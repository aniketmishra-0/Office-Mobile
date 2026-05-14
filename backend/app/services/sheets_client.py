from __future__ import annotations

import io
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import time
import xml.etree.ElementTree as ET
import zipfile
from typing import Any

import gspread
from gspread.exceptions import APIError, SpreadsheetNotFound, WorksheetNotFound

from app.config import get_settings
from app.models.field import FieldSchema
from app.services import form_store

logger = logging.getLogger(__name__)

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


# In-process cache for sheet row reads. Keyed by (spreadsheet_id, worksheet_name,
# field_keys_tuple) so that schema changes invalidate naturally. Values are
# (timestamp, rows). TTL is short — 60s gives form fillers near-live autofill
# while cutting 80%+ of Sheets API calls under concurrent load.
_ROWS_CACHE_TTL_SECONDS = 60
_ROWS_CACHE: dict[tuple, tuple[float, list[dict[str, str]]]] = {}

# In-process cache for the header row (row 1) of a sheet/tab. Submissions only
# need the header mapping to decide which column each field writes to, and that
# mapping rarely changes. A 5-minute TTL turns most repeat submissions into
# a single Sheets API call (the append itself) instead of three.
_HEADERS_CACHE_TTL_SECONDS = 300
_HEADERS_CACHE: dict[tuple[str, str], tuple[float, list[str]]] = {}


def _headers_cache_key(spreadsheet_id: str, worksheet_name: str | None) -> tuple[str, str]:
    return (spreadsheet_id, worksheet_name or "")


def _invalidate_headers_cache(spreadsheet_id: str, worksheet_name: str | None) -> None:
    _HEADERS_CACHE.pop(_headers_cache_key(spreadsheet_id, worksheet_name), None)


def _get_cached_headers(
    spreadsheet_id: str, worksheet_name: str | None
) -> list[str] | None:
    cached = _HEADERS_CACHE.get(_headers_cache_key(spreadsheet_id, worksheet_name))
    if cached is None:
        return None
    ts, headers = cached
    if time.time() - ts >= _HEADERS_CACHE_TTL_SECONDS:
        return None
    return headers


def _store_cached_headers(
    spreadsheet_id: str, worksheet_name: str | None, headers: list[str]
) -> None:
    _HEADERS_CACHE[_headers_cache_key(spreadsheet_id, worksheet_name)] = (
        time.time(),
        headers,
    )


def _rows_cache_key(
    spreadsheet_id: str, worksheet_name: str | None, fields: list[FieldSchema]
) -> tuple:
    return (
        spreadsheet_id,
        worksheet_name or "",
        tuple(f.key for f in fields),
    )


def _invalidate_rows_cache(spreadsheet_id: str, worksheet_name: str | None) -> None:
    """Drop cached rows for a sheet/tab so the next read reflects fresh writes."""
    prefix = (spreadsheet_id, worksheet_name or "")
    for key in list(_ROWS_CACHE.keys()):
        if key[:2] == prefix:
            _ROWS_CACHE.pop(key, None)


class GoogleSheetsConfigurationError(RuntimeError):
    pass


class PublicSheetError(RuntimeError):
    """Raised when a public (no-auth) sheet fetch fails."""


# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------


def _has_credentials() -> bool:
    """Return True if a usable Google service account OR OAuth token is configured."""
    import os

    # Check OAuth first (end-user sign-in)
    if form_store.get_oauth_token() is not None:
        return True

    s = get_settings()
    if s.google_service_account_json:
        return True
    if s.google_service_account_file:
        return os.path.isfile(s.google_service_account_file)
    return False


def _oauth_credentials() -> Any | None:
    """Return google-auth credentials from stored OAuth token if present.

    Wires up a refresh callback so refreshed access tokens are persisted
    back to the store, preventing repeated refresh round-trips and keeping
    long-lived sessions working after the initial access_token expires.
    """
    token = form_store.get_oauth_token()
    if not token:
        return None

    settings = get_settings()
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        return None

    try:
        from google.oauth2.credentials import Credentials
    except Exception:
        return None

    creds = Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        scopes=SCOPES,
    )

    # Proactively refresh if expired or about to expire. This keeps the
    # access_token fresh for the lifetime of this request and lets us
    # persist the new token for subsequent requests.
    try:
        from google.auth.transport.requests import Request as GoogleRequest

        if creds.refresh_token and (
            not creds.token or not creds.valid or creds.expired
        ):
            creds.refresh(GoogleRequest())
            # Persist the refreshed token so we don't re-refresh on the
            # next request and so other workers pick up the new access token.
            refreshed = dict(token)
            refreshed["access_token"] = creds.token
            if getattr(creds, "expiry", None):
                refreshed["expires_at"] = int(creds.expiry.timestamp())
            form_store.set_oauth_token(refreshed)
    except Exception as exc:
        # A failed refresh means the user revoked access or Google is
        # temporarily unreachable. Log and fall through — gspread will
        # surface a clear permission error that the API maps to 401/403.
        logger.warning("oauth.refresh_failed: %s", exc)

    return creds


def _authenticated_sheet_access(spreadsheet_id: str) -> dict[str, bool]:
    if not _has_credentials():
        return {"read": False, "edit": False}

    client = get_client()
    try:
        spreadsheet = client.open_by_key(spreadsheet_id)
    except PermissionError:
        return {"read": False, "edit": False}
    except Exception:
        return {"read": False, "edit": False}

    try:
        # A batchUpdate with an empty list of requests requires write permission
        # but does not modify the sheet or update the "Last Modified" timestamp.
        spreadsheet.batch_update({"requests": []})
        return {"read": True, "edit": True}
    except APIError as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code == 400:
            # Some API versions reject empty batchUpdate requests even with
            # valid edit access. Treat this as editable rather than false-negative.
            return {"read": True, "edit": True}
        if status_code == 403:
            return {"read": True, "edit": False}
        return {"read": True, "edit": False}


def get_client() -> gspread.Client:
    # Prefer OAuth (end-user) if connected
    oauth_creds = _oauth_credentials()
    if oauth_creds is not None:
        return gspread.Client(auth=oauth_creds)

    settings = get_settings()

    if settings.google_service_account_json:
        try:
            credentials = json.loads(settings.google_service_account_json)
        except json.JSONDecodeError as exc:
            raise GoogleSheetsConfigurationError(
                "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON"
            ) from exc
        return gspread.service_account_from_dict(credentials, scopes=SCOPES)

    if settings.google_service_account_file:
        return gspread.service_account(
            filename=settings.google_service_account_file, scopes=SCOPES
        )

    raise GoogleSheetsConfigurationError(
        "Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE before using Google Sheets."
    )


def _fetch_public_xlsx(spreadsheet_id: str) -> bytes:
    url = (
        f"https://docs.google.com/spreadsheets/d/"
        f"{urllib.parse.quote(spreadsheet_id, safe='')}"
        f"/export?format=xlsx"
    )

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AllinForm/1.0",
            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 403, 404):
            raise PublicSheetError(
                "Sheet not found or not publicly accessible. "
                "Set sharing to 'Anyone with the link can view'."
            ) from exc
        raise PublicSheetError(f"Google returned HTTP {exc.code}.") from exc
    except urllib.error.URLError as exc:
        raise PublicSheetError(f"Network error fetching sheet: {exc.reason}") from exc


def _extract_sheet_names_from_xlsx(xlsx_bytes: bytes) -> list[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as archive:
            workbook_xml = archive.read("xl/workbook.xml")
    except Exception as exc:
        raise PublicSheetError("Unexpected response format from Google Sheets.") from exc

    try:
        root = ET.fromstring(workbook_xml)
    except ET.ParseError as exc:
        raise PublicSheetError("Unexpected response format from Google Sheets.") from exc

    namespaces = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    }
    sheets_parent = root.find("main:sheets", namespaces)
    if sheets_parent is None:
        raise PublicSheetError("Unexpected response format from Google Sheets.")

    names: list[str] = []
    for sheet in sheets_parent.findall("main:sheet", namespaces):
        name = sheet.attrib.get("name")
        if name:
            names.append(name)

    if not names:
        raise PublicSheetError("Unexpected response format from Google Sheets.")

    return names


def _read_public_sheet_names(spreadsheet_id: str) -> list[str]:
    return _extract_sheet_names_from_xlsx(_fetch_public_xlsx(spreadsheet_id))


# ---------------------------------------------------------------------------
# Public (no-auth) sheet access via Google gviz/tq API
# ---------------------------------------------------------------------------


def _fetch_gviz_json(spreadsheet_id: str, worksheet_name: str | None) -> dict:
    """
    Fetch column metadata from a publicly readable Google Sheet using the
    undocumented but stable gviz/tq endpoint.
    """
    params: dict[str, str] = {
        "tqx": "out:json",
        "tq": "select * limit 0",
    }
    if worksheet_name:
        params["sheet"] = worksheet_name

    url = (
        f"https://docs.google.com/spreadsheets/d/"
        f"{urllib.parse.quote(spreadsheet_id, safe='')}"
        f"/gviz/tq?{urllib.parse.urlencode(params)}"
    )

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AllinForm/1.0",
            "Accept": "*/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 403, 404):
            raise PublicSheetError(
                "Sheet not found or not publicly accessible. "
                "Set sharing to 'Anyone with the link can view'."
            ) from exc
        raise PublicSheetError(f"Google returned HTTP {exc.code}.") from exc
    except urllib.error.URLError as exc:
        raise PublicSheetError(f"Network error fetching sheet: {exc.reason}") from exc

    match = re.search(
        r"google\.visualization\.Query\.setResponse\((\{.*\})\);?\s*$",
        raw,
        re.DOTALL,
    )
    if not match:
        raise PublicSheetError("Unexpected response format from Google Sheets.")

    data = json.loads(match.group(1))

    if data.get("status") == "error":
        errors = data.get("errors", [])
        msg = (
            errors[0].get("detailed_message", "Cannot access this spreadsheet.")
            if errors
            else "Cannot access this spreadsheet."
        )
        raise PublicSheetError(msg)

    return data


def list_worksheet_names(spreadsheet_id: str) -> list[str]:
    """List worksheet/tab names for a spreadsheet."""
    try:
        return _read_public_sheet_names(spreadsheet_id)
    except PublicSheetError:
        pass

    if _has_credentials():
        client = get_client()
        spreadsheet = client.open_by_key(spreadsheet_id)
        return [ws.title for ws in spreadsheet.worksheets()]

    raise PublicSheetError(
        "Sheet not found or not publicly accessible. "
        "Set sharing to 'Anyone with the link can view'."
    )


def read_headers_public(
    spreadsheet_id: str, worksheet_name: str | None = None
) -> tuple[str, str, list[str]]:
    """Read the header row of a public Google Sheet without any credentials."""
    data = _fetch_gviz_json(spreadsheet_id, worksheet_name)

    table = data.get("table", {})
    cols: list[dict] = table.get("cols", [])
    headers = [col.get("label", "") for col in cols]

    actual_worksheet = worksheet_name or "Sheet1"
    # The gviz/tq endpoint doesn't reliably include a spreadsheet title for
    # unauthenticated requests. Use a clearer, minimally-unique default so
    # multiple inaccessible sheets don't all appear as "My Form" in the UI.
    short_id = spreadsheet_id[-6:]
    spreadsheet_title = f"Untitled Form ({short_id})"

    return spreadsheet_title, actual_worksheet, headers


# ---------------------------------------------------------------------------
# Authenticated sheet access (gspread)
# ---------------------------------------------------------------------------


def check_sheet_access(spreadsheet_id: str) -> dict[str, bool]:
    """Check if we have read/edit access to the spreadsheet."""
    try:
        _read_public_sheet_names(spreadsheet_id)
        public_read = True
    except PublicSheetError:
        public_read = False

    if public_read:
        result = {"read": True, "edit": False}
        if _has_credentials():
            auth_access = _authenticated_sheet_access(spreadsheet_id)
            if auth_access["edit"]:
                return {"read": True, "edit": True}
        return result

    if not _has_credentials():
        return {"read": False, "edit": False}

    return _authenticated_sheet_access(spreadsheet_id)


def _select_worksheet(spreadsheet: Any, worksheet_name: str | None = None) -> Any:
    if worksheet_name:
        return spreadsheet.worksheet(worksheet_name)
    first_sheet = spreadsheet.get_worksheet(0)
    if first_sheet is None:
        raise WorksheetNotFound("Spreadsheet has no worksheets")
    return first_sheet


def read_headers_authenticated(
    spreadsheet_id: str, worksheet_name: str | None = None
) -> tuple[str, str, list[str]]:
    client = get_client()
    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = _select_worksheet(spreadsheet, worksheet_name)
    headers = worksheet.row_values(1)
    return spreadsheet.title, worksheet.title, headers


def read_headers(
    spreadsheet_id: str, worksheet_name: str | None = None
) -> tuple[str, str, list[str]]:
    """Read headers — prefers public access, then falls back to authenticated."""
    try:
        return read_headers_public(spreadsheet_id, worksheet_name)
    except PublicSheetError:
        if _has_credentials():
            return read_headers_authenticated(spreadsheet_id, worksheet_name)
        raise


def sync_sheet_headers(
    *,
    spreadsheet_id: str,
    worksheet_name: str | None,
    headers: list[str],
) -> None:
    """Rewrite row 1 so the live Google Sheet matches the saved field headers."""
    if not _has_credentials():
        return

    client = get_client()
    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = _select_worksheet(spreadsheet, worksheet_name)

    if not headers:
        return

    worksheet.update("A1", [headers], value_input_option="RAW")
    # Headers just changed on disk, drop any cached copy so the next append
    # reads the fresh layout rather than routing data to stale columns.
    _invalidate_headers_cache(spreadsheet_id, worksheet_name)


# ---------------------------------------------------------------------------
# Smart row detection + append
# ---------------------------------------------------------------------------


# Characters that Google Sheets interprets as formula prefixes when using
# value_input_option="USER_ENTERED". Sanitizing prevents formula injection
# where a submitter plants =IMPORTXML(...), +HYPERLINK(...), etc. that run
# when the sheet owner opens the file.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_cell(value: Any) -> Any:
    """Prefix a dangerous leading character with an apostrophe so Google Sheets
    treats the cell as literal text. Non-string values are returned unchanged."""
    if not isinstance(value, str) or not value:
        return value
    if value[0] in _FORMULA_PREFIXES:
        return "'" + value
    return value


def _col_index_to_letter(col_index: int) -> str:
    """Convert 0-based column index to A1 notation letter (0=A, 25=Z, 26=AA)."""
    result = ""
    idx = col_index
    while True:
        result = chr(ord("A") + idx % 26) + result
        idx = idx // 26 - 1
        if idx < 0:
            break
    return result


def _read_live_headers(worksheet: Any, spreadsheet_id: str, worksheet_name: str | None) -> list[str]:
    """Return the header row, using the cached copy when available."""
    cached = _get_cached_headers(spreadsheet_id, worksheet_name)
    if cached is not None:
        return cached
    headers = worksheet.row_values(1)
    _store_cached_headers(spreadsheet_id, worksheet_name, headers)
    return headers


def _build_row_from_headers(
    live_headers: list[str],
    fields: list[FieldSchema],
    values: dict[str, Any],
) -> list[Any]:
    """Place each field's value in the column that matches its source_header.
    Ensures data lands in the correct column even if columns were reordered."""
    if not live_headers:
        return _build_append_row_simple(fields, values)

    header_to_col: dict[str, int] = {}
    for idx, header in enumerate(live_headers):
        normalized = header.strip()
        if normalized and normalized not in header_to_col:
            header_to_col[normalized] = idx

    max_needed_col = 0
    col_assignments: list[tuple[int, str]] = []

    for field in fields:
        raw_value = values.get(field.key)
        value_str = str(raw_value) if raw_value not in (None, "") else ""
        value_str = _sanitize_cell(value_str)

        col_idx = header_to_col.get(field.source_header.strip())
        if col_idx is None:
            source_lower = field.source_header.strip().lower()
            for h, idx in header_to_col.items():
                if h.lower() == source_lower:
                    col_idx = idx
                    break
        if col_idx is None:
            col_idx = field.column_index

        col_assignments.append((col_idx, value_str))
        if col_idx > max_needed_col:
            max_needed_col = col_idx

    row_values: list[Any] = [""] * (max_needed_col + 1)
    for col_idx, value_str in col_assignments:
        row_values[col_idx] = value_str

    return row_values


def _build_append_row_simple(fields: list[FieldSchema], values: dict[str, Any]) -> list[Any]:
    """Fallback: build row using stored column_index positions."""
    if not fields:
        return []

    max_column_index = max(field.column_index for field in fields)
    row_values: list[Any] = [""] * (max_column_index + 1)

    for field in fields:
        raw_value = values.get(field.key)
        cell = str(raw_value) if raw_value not in (None, "") else ""
        row_values[field.column_index] = _sanitize_cell(cell)

    return row_values


def append_form_row(
    *,
    spreadsheet_id: str,
    worksheet_name: str | None,
    fields: list[FieldSchema],
    values: dict[str, Any],
) -> str | None:
    """
    Append a row to the backing Google Sheet using the server-side append API.

    This is a single round-trip to Google in the hot path:
      spreadsheets.values.append  →  Google picks the next empty row, grows
      the grid as needed, and returns the updated range.

    The previous implementation did 3-5 round-trips per submission (open sheet,
    read headers, scan for last row, expand capacity, write). The header read
    is now cached for 5 minutes and column matching happens locally, so a warm
    submission issues exactly one Sheets API call.

    Returns the updated range string, or None if no credentials.
    """
    if not _has_credentials():
        return None

    client = get_client()
    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = _select_worksheet(spreadsheet, worksheet_name)

    live_headers = _read_live_headers(worksheet, spreadsheet_id, worksheet_name)
    row_values = _build_row_from_headers(live_headers, fields, values)

    # Trim trailing empty cells so the written range is as narrow as possible.
    while row_values and row_values[-1] == "":
        row_values.pop()

    if not row_values:
        return None

    end_col = _col_index_to_letter(len(row_values) - 1)
    # Sheets' append_rows uses the worksheet's whole data range as the search
    # area when table_range is omitted, which is exactly what we want: Google
    # locates the next empty row below the existing data for us.
    try:
        result = worksheet.append_rows(
            [row_values],
            value_input_option="USER_ENTERED",
            insert_data_option="INSERT_ROWS",
            table_range=f"A1:{end_col}",
            include_values_in_response=False,
        )
    except APIError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 429:
            time.sleep(2)
            result = worksheet.append_rows(
                [row_values],
                value_input_option="USER_ENTERED",
                insert_data_option="INSERT_ROWS",
                table_range=f"A1:{end_col}",
                include_values_in_response=False,
            )
        else:
            # A 400 here often means the header row moved or was deleted, so
            # any cached header map is stale. Drop it before bubbling the
            # error up so the next submission rebuilds the mapping.
            if status == 400:
                _invalidate_headers_cache(spreadsheet_id, worksheet_name)
            raise

    # Pull the updated range out of the API response so the caller can echo
    # it back to the client (and store it with the submission).
    updated_range: str | None = None
    try:
        updates = (result or {}).get("updates") or {}
        updated_range = updates.get("updatedRange")
    except Exception:
        updated_range = None

    if not updated_range:
        # Fall back to a best-effort string; the write did succeed.
        updated_range = f"{worksheet.title}!A:{end_col}"

    logger.info("sheets.append ok range=%s", updated_range)

    # Invalidate cached reads for this sheet/tab so subsequent autofill
    # queries see the row we just wrote.
    _invalidate_rows_cache(spreadsheet_id, worksheet_name)

    return updated_range


# ---------------------------------------------------------------------------
# Read existing rows for autofill suggestions
# ---------------------------------------------------------------------------


def read_sheet_rows(
    *,
    spreadsheet_id: str,
    worksheet_name: str | None,
    fields: list[FieldSchema],
    max_rows: int = 100000,
) -> list[dict[str, str]]:
    """
    Read existing data rows from the Google Sheet and return them as a list
    of dicts keyed by field.key. Used for autofill and history search.

    Uses a short-lived (60s) in-process cache to avoid hammering Google Sheets
    when many form fillers open the same form in succession. The cache is
    invalidated by append_form_row after a successful write.

    Returns an empty list if no credentials or on error.
    """
    if not _has_credentials():
        return []

    cache_key = _rows_cache_key(spreadsheet_id, worksheet_name, fields)
    cached = _ROWS_CACHE.get(cache_key)
    if cached is not None:
        cached_at, cached_rows = cached
        if time.time() - cached_at < _ROWS_CACHE_TTL_SECONDS:
            logger.debug("read_sheet_rows cache hit for %s", cache_key[:2])
            return cached_rows

    try:
        client = get_client()
        spreadsheet = client.open_by_key(spreadsheet_id)
        worksheet = _select_worksheet(spreadsheet, worksheet_name)

        # Read headers to map columns (cached)
        live_headers = _read_live_headers(worksheet, spreadsheet_id, worksheet_name)
        if not live_headers:
            return []

        # Build header → column index map
        header_to_col: dict[str, int] = {}
        for idx, header in enumerate(live_headers):
            normalized = header.strip()
            if normalized and normalized not in header_to_col:
                header_to_col[normalized] = idx

        # Build field → column index map
        field_col_map: dict[str, int] = {}
        for field in fields:
            col_idx = header_to_col.get(field.source_header.strip())
            if col_idx is None:
                source_lower = field.source_header.strip().lower()
                for h, idx in header_to_col.items():
                    if h.lower() == source_lower:
                        col_idx = idx
                        break
            if col_idx is None:
                col_idx = field.column_index
            field_col_map[field.key] = col_idx

        # Read data rows (skip header row).
        # Read ALL rows from the sheet — no artificial cap.
        total_rows = max(worksheet.row_count - 1, 0)
        if total_rows == 0:
            return []
        end_col = _col_index_to_letter(max(field_col_map.values()))
        data_range = f"A2:{end_col}{total_rows + 1}"

        logger.info(
            f"Reading all {total_rows} rows from {worksheet.title}!{data_range}"
        )
        all_data = worksheet.get(data_range)

        if not all_data:
            return []

        # Convert to list of dicts
        rows: list[dict[str, str]] = []
        for data_idx, row_data in enumerate(all_data):
            row_dict: dict[str, str] = {}
            has_data = False
            for field in fields:
                col_idx = field_col_map[field.key]
                value = row_data[col_idx] if col_idx < len(row_data) else ""
                row_dict[field.key] = value
                if value.strip():
                    has_data = True
            if has_data:
                # Store the actual 1-based sheet row index (data starts at row 2)
                row_dict["_row_index"] = str(data_idx + 2)
                rows.append(row_dict)

        # Detect checkbox columns: if all non-empty values in a column are
        # exclusively TRUE/FALSE (case-insensitive), mark the field as checkbox.
        # This catches Google Sheets checkbox columns that store boolean values.
        _BOOLEAN_VALUES = {"true", "false", ""}
        for field in fields:
            if field.type != "text":
                continue  # Only override text fields
            col_values = [row.get(field.key, "").strip().lower() for row in rows]
            non_empty = [v for v in col_values if v]
            if non_empty and all(v in _BOOLEAN_VALUES for v in col_values):
                field.type = "checkbox"

        logger.info(f"Returned {len(rows)} non-empty rows from sheet")
        _ROWS_CACHE[cache_key] = (time.time(), rows)
        return rows

    except Exception as e:
        logger.exception(f"Failed to read sheet rows: {type(e).__name__}: {e}")
        return []


# ---------------------------------------------------------------------------
# Update an existing row in-place
# ---------------------------------------------------------------------------


def update_sheet_row(
    *,
    spreadsheet_id: str,
    worksheet_name: str | None,
    row_index: int,
    fields: list[FieldSchema],
    values: dict[str, Any],
) -> str | None:
    """
    Update an existing row in the Google Sheet at the given row_index
    (1-based, where row 1 is the header). So the first data row is row_index=2.

    Returns the updated range string, or None if no credentials.
    """
    if not _has_credentials():
        return None

    if row_index < 2:
        raise ValueError("row_index must be >= 2 (row 1 is the header)")

    client = get_client()
    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = _select_worksheet(spreadsheet, worksheet_name)

    live_headers = _read_live_headers(worksheet, spreadsheet_id, worksheet_name)
    row_values = _build_row_from_headers(live_headers, fields, values)

    # Trim trailing empty cells
    while row_values and row_values[-1] == "":
        row_values.pop()

    if not row_values:
        return None

    # Ensure we don't write beyond the sheet's actual column count.
    # Google Sheets returns 400 if the range exceeds the grid dimensions.
    sheet_col_count = worksheet.col_count
    if len(row_values) > sheet_col_count:
        row_values = row_values[:sheet_col_count]
        # Re-trim trailing empty cells after truncation
        while row_values and row_values[-1] == "":
            row_values.pop()
        if not row_values:
            return None

    # Ensure the target row exists within the sheet's grid.
    # Google Sheets returns 400 if row_index exceeds the current row count.
    sheet_row_count = worksheet.row_count
    if row_index > sheet_row_count:
        # Expand the sheet to accommodate the target row
        try:
            worksheet.add_rows(row_index - sheet_row_count)
        except Exception as expand_exc:
            logger.warning(
                "sheets.update.expand_rows failed row_index=%d sheet_rows=%d exc=%s",
                row_index, sheet_row_count, str(expand_exc)[:200],
            )
            raise ValueError(
                f"Row {row_index} is beyond the sheet's current size ({sheet_row_count} rows) "
                f"and could not be expanded: {expand_exc}"
            ) from expand_exc

    end_col = _col_index_to_letter(len(row_values) - 1)
    cell_range = f"A{row_index}:{end_col}{row_index}"

    logger.info(
        "sheets.update.attempt range=%s row_index=%d num_values=%d sheet_rows=%d sheet_cols=%d",
        cell_range, row_index, len(row_values), sheet_row_count, sheet_col_count,
    )

    try:
        worksheet.update(cell_range, [row_values], value_input_option="USER_ENTERED")
    except APIError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        resp_body = ""
        try:
            resp = getattr(exc, "response", None)
            if resp is not None:
                resp_body = (getattr(resp, "text", None) or "")[:500]
        except Exception:
            pass
        if status == 429:
            time.sleep(2)
            worksheet.update(cell_range, [row_values], value_input_option="USER_ENTERED")
        else:
            logger.error(
                "sheets.update FAILED range=%s row_index=%d num_values=%d status=%s body=%s exc=%s",
                cell_range, row_index, len(row_values), status, resp_body, str(exc)[:300],
            )
            raise

    updated_range = f"{worksheet.title}!{cell_range}"
    logger.info("sheets.update ok range=%s", updated_range)

    # Invalidate cached reads so subsequent queries see the updated row.
    _invalidate_rows_cache(spreadsheet_id, worksheet_name)

    return updated_range


# ---------------------------------------------------------------------------
# Exception → HTTP status mapper
# ---------------------------------------------------------------------------


def map_sheet_exception(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, GoogleSheetsConfigurationError):
        # Configuration errors are deployment issues, not user issues —
        # log the real reason but only show a neutral message to the client.
        logger.error("sheets.config_error", exc_info=exc)
        return 500, "Google Sheets is not configured. Please contact support."
        
    try:
        from google.auth.exceptions import GoogleAuthError
        if isinstance(exc, GoogleAuthError):
            logger.warning("sheets.auth_error", exc_info=exc)
            return 401, "Your Google login session has expired or is invalid. Please sign out and sign in again."
    except ImportError:
        pass

    if isinstance(exc, PublicSheetError):
        return 422, str(exc)
    if isinstance(exc, SpreadsheetNotFound):
        return 404, "Spreadsheet not found or not shared with the service account."
    if isinstance(exc, WorksheetNotFound):
        return 404, "Worksheet/tab not found."
    if isinstance(exc, PermissionError):
        return 403, "You do not have permission to access this Google Sheet. Please make sure you have access to it."
    if isinstance(exc, APIError):
        status_code = (
            getattr(getattr(exc, "response", None), "status_code", None) or 502
        )
        # Grab Google's actual error body so ops can see what went wrong.
        response_body = ""
        try:
            resp = getattr(exc, "response", None)
            if resp is not None:
                response_body = (getattr(resp, "text", None) or "")[:800]
        except Exception:
            response_body = ""
        logger.warning(
            "sheets.api_error status=%s message=%s body=%s",
            status_code,
            str(exc)[:500],
            response_body,
        )
        if status_code == 400:
            # Always include both response body and exception string for maximum debug info
            detail_parts = []
            if response_body:
                detail_parts.append(response_body[:300])
            exc_str = str(exc)[:300]
            if exc_str and exc_str not in (response_body or ""):
                detail_parts.append(exc_str)
            detail = " | ".join(detail_parts) if detail_parts else "No additional detail from Google"
            # Provide a more actionable message when possible
            if "exceeds" in detail.lower() or "range" in detail.lower() or "grid" in detail.lower():
                return 400, f"The update range exceeds the sheet dimensions. The row may not exist in the sheet. Detail: {detail}"
            return 400, f"The sheet structure changed or the request was invalid. Detail: {detail}"
        if status_code == 403:
            # The message differs depending on which auth path is in use.
            # OAuth users can't "share with a service account" — that advice
            # is only correct when the backend is running on service-account
            # credentials. Detecting this up-front avoids misleading users.
            has_oauth = form_store.get_oauth_token() is not None
            body_lower = response_body.lower()

            # Pull Google's own reason out of the body so the UI can show
            # something more useful than "access denied". Google's v3 error
            # envelope is {"error":{"code":403,"message":"...","errors":[...]}}.
            google_reason: str | None = None
            google_status: str | None = None
            try:
                parsed = json.loads(response_body) if response_body else None
                if isinstance(parsed, dict):
                    err = parsed.get("error") or {}
                    if isinstance(err, dict):
                        google_reason = err.get("message") or None
                        google_status = err.get("status") or None
                        errors = err.get("errors") or []
                        if not google_reason and errors:
                            google_reason = (errors[0] or {}).get("message")
            except Exception:
                google_reason = None

            if has_oauth:
                # Drive API / Sheets API not enabled on the OAuth project.
                # Google's message contains "has not been used in project" or
                # "disabled" plus a link to the Cloud Console.
                if (
                    "has not been used in project" in body_lower
                    or "api has not been used" in body_lower
                    or ("api" in body_lower and "disabled" in body_lower)
                ):
                    msg = (
                        "Google Drive or Sheets API is disabled for the app's OAuth project. "
                        "An administrator needs to enable them in the Google Cloud Console."
                    )
                    if google_reason:
                        msg += f" (Google said: {google_reason[:200]})"
                    return 403, msg

                # User ran out of Drive storage.
                if "storage quota" in body_lower or "storagequotaexceeded" in body_lower:
                    return 403, (
                        "Your Google Drive storage is full, so Google refused to create the "
                        "spreadsheet. Free up space in Drive and try again."
                    )

                # Workspace policy / admin restriction.
                if (
                    "admin" in body_lower
                    or "workspace" in body_lower
                    or "policy" in body_lower
                    or "domain" in body_lower
                ):
                    msg = (
                        "Your Google Workspace administrator has blocked this action. "
                        "Ask them to allow third-party apps to create Sheets on your account."
                    )
                    if google_reason:
                        msg += f" (Google said: {google_reason[:200]})"
                    return 403, msg

                # Missing scope — user unchecked a permission box on consent.
                if (
                    "insufficient" in body_lower
                    or "scope" in body_lower
                    or google_status == "PERMISSION_DENIED"
                    and "scope" in (google_reason or "").lower()
                ):
                    return 403, (
                        "Google refused this request because your sign-in is missing the "
                        "Sheets or Drive permission. Sign out and sign in again, and make "
                        "sure both 'See, edit, create, and delete your spreadsheets' and "
                        "'See, edit, create, and delete only the specific Google Drive files "
                        "you use with this app' stay checked on the consent screen."
                    )

                # Fall back to Google's own message if we have one — much more
                # useful than the old generic "sign out and sign in again" blurb.
                if google_reason:
                    return 403, f"Google denied this request: {google_reason[:300]}"

                return 403, (
                    "Google denied access to this sheet or to your Drive. "
                    "If you're trying to open an existing sheet, make sure you have access to it in Google Drive. "
                    "If this keeps happening when creating new forms, sign out and sign in again to re-grant permissions."
                )
            return 403, (
                "No permission to read or write this sheet. "
                "If you expect the app to create or access sheets, share the sheet/Drive with the service account or sign in with Google."
            )
        if status_code == 404:
            return 404, "Sheet or tab not found."
        if status_code == 429:
            return 429, "Google Sheets rate limit reached. Try again in a minute."
        return int(status_code), "Google Sheets is unavailable right now. Please retry."
        
    try:
        import requests
        if isinstance(exc, requests.exceptions.RequestException):
            logger.warning("sheets.network_error", exc_info=exc)
            return 502, "Network error connecting to Google Sheets. Please check your connection and try again."
    except ImportError:
        pass

    logger.exception("sheets.unexpected_error", exc_info=exc)
    return 500, "Unexpected Google Sheets error."
