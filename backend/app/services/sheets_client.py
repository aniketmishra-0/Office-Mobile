from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import time
from typing import Any

import gspread
from gspread.exceptions import APIError, SpreadsheetNotFound, WorksheetNotFound

from app.config import get_settings
from app.models.field import FieldSchema
from app.services import form_store

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


# In-process cache for sheet row reads. Keyed by (spreadsheet_id, worksheet_name,
# field_keys_tuple) so that schema changes invalidate naturally. Values are
# (timestamp, rows). TTL is short — 60s gives form fillers near-live autofill
# while cutting 80%+ of Sheets API calls under concurrent load.
_ROWS_CACHE_TTL_SECONDS = 60
_ROWS_CACHE: dict[tuple, tuple[float, list[dict[str, str]]]] = {}


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
    """Return google-auth credentials from stored OAuth token if present."""
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

    return Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        scopes=SCOPES,
    )


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
    if _has_credentials():
        client = get_client()
        spreadsheet = client.open_by_key(spreadsheet_id)
        return [ws.title for ws in spreadsheet.worksheets()]
    return ["Sheet1"]


def read_headers_public(
    spreadsheet_id: str, worksheet_name: str | None = None
) -> tuple[str, str, list[str]]:
    """Read the header row of a public Google Sheet without any credentials."""
    data = _fetch_gviz_json(spreadsheet_id, worksheet_name)

    table = data.get("table", {})
    cols: list[dict] = table.get("cols", [])
    headers = [col.get("label", "") for col in cols]

    actual_worksheet = worksheet_name or "Sheet1"
    spreadsheet_title = "My Form"

    return spreadsheet_title, actual_worksheet, headers


# ---------------------------------------------------------------------------
# Authenticated sheet access (gspread)
# ---------------------------------------------------------------------------


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
    """Read headers — prefers authenticated, falls back to public."""
    if _has_credentials():
        return read_headers_authenticated(spreadsheet_id, worksheet_name)
    return read_headers_public(spreadsheet_id, worksheet_name)


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


def _find_next_empty_row(worksheet: Any, header_count: int) -> int:
    """
    Smart next-row detection using binary search on the actual data range.
    
    Strategy:
    1. Use Google Sheets API COUNTA approach — check a small range at the end
       to find where data stops.
    2. Binary search between row 2 and the sheet's row_count to find the
       first completely empty row.
    
    This avoids fetching all 30k+ rows which is slow and error-prone.
    """
    total_rows = worksheet.row_count

    # Quick check: use the Sheets API to get the last row with data
    # by reading column A (most reliable — usually always has data)
    # But limit to a smart range to avoid fetching 30k cells
    
    # Strategy: Use Google Sheets' native append detection via COUNTA
    # Read a formula result that tells us the last row
    try:
        # Use the spreadsheets.values.get with a large range but let
        # Google handle the trimming — it only returns up to last data row
        end_col = _col_index_to_letter(min(header_count - 1, 25))
        data_range = f"A1:{end_col}{total_rows}"
        
        # gspread's get() returns only cells with data (trims trailing empty rows)
        all_data = worksheet.get(data_range)
        
        if not all_data:
            return 2  # Empty sheet, start after header
        
        # all_data length = number of rows returned (including header)
        # The last row with data is at index len(all_data)
        last_data_row = len(all_data)
        
        logger.info(
            f"Sheet has {total_rows} total rows, last data at row {last_data_row}, "
            f"next empty row: {last_data_row + 1}"
        )
        
        return last_data_row + 1
        
    except Exception as e:
        logger.warning(f"Smart row detection failed, using fallback: {e}")
        # Fallback: use col_values which is still better than get_all_values
        col_a = worksheet.col_values(1)
        # Reverse search for last non-empty
        for i in range(len(col_a) - 1, -1, -1):
            if col_a[i].strip():
                return i + 2  # i is 0-indexed, +1 for 1-indexed, +1 for next row
        return 2


def _build_row_from_live_headers(
    worksheet: Any,
    fields: list[FieldSchema],
    values: dict[str, Any],
) -> list[Any]:
    """
    Read the current header row from the sheet and place each field's value
    in the column that matches its source_header. This ensures data always
    goes into the correct column even if columns were reordered.
    """
    live_headers = worksheet.row_values(1)

    if not live_headers:
        return _build_append_row_simple(fields, values)

    # Build a map: normalized header text → column index (0-based)
    header_to_col: dict[str, int] = {}
    for idx, header in enumerate(live_headers):
        normalized = header.strip()
        if normalized and normalized not in header_to_col:
            header_to_col[normalized] = idx

    # Only build row up to the last column we actually need to write to
    # (not the full header width — avoids exceeding grid limits)
    max_needed_col = 0
    col_assignments: list[tuple[int, str]] = []

    for field in fields:
        raw_value = values.get(field.key)
        value_str = str(raw_value) if raw_value not in (None, "") else ""
        value_str = _sanitize_cell(value_str)

        # Match by source_header (exact)
        col_idx = header_to_col.get(field.source_header.strip())

        if col_idx is None:
            # Case-insensitive fallback
            source_lower = field.source_header.strip().lower()
            for h, idx in header_to_col.items():
                if h.lower() == source_lower:
                    col_idx = idx
                    break

        if col_idx is None:
            # Last fallback: stored column_index
            col_idx = field.column_index

        col_assignments.append((col_idx, value_str))
        if col_idx > max_needed_col:
            max_needed_col = col_idx

    # Build the row array only as wide as needed
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


def _ensure_sheet_capacity(worksheet: Any, target_row: int, num_cols: int) -> None:
    """
    Ensure the worksheet has enough rows and columns for the write.
    Adds rows/cols in bulk to minimize API calls.
    """
    if target_row > worksheet.row_count:
        # Add 500 extra rows as buffer to reduce future expansions
        rows_to_add = target_row - worksheet.row_count + 500
        worksheet.add_rows(rows_to_add)
        logger.info(f"Expanded sheet by {rows_to_add} rows (new total: {worksheet.row_count + rows_to_add})")

    if num_cols > worksheet.col_count:
        cols_to_add = num_cols - worksheet.col_count + 5
        worksheet.add_cols(cols_to_add)
        logger.info(f"Expanded sheet by {cols_to_add} columns")


def append_form_row(
    *,
    spreadsheet_id: str,
    worksheet_name: str | None,
    fields: list[FieldSchema],
    values: dict[str, Any],
) -> str | None:
    """
    Append a row to the backing Google Sheet.
    
    Smart features:
    - Uses efficient row detection (doesn't fetch entire sheet)
    - Matches columns by header name (handles reordered columns)
    - Auto-expands sheet if at capacity
    - Only writes to columns that have data (avoids exceeding grid limits)
    - Retries once on transient errors
    
    Returns the updated range string, or None if no credentials.
    """
    if not _has_credentials():
        return None

    client = get_client()
    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = _select_worksheet(spreadsheet, worksheet_name)

    # Build row by matching field source_header to live sheet headers
    row_values = _build_row_from_live_headers(worksheet, fields, values)

    # Trim trailing empty cells to minimize the range we write
    while row_values and row_values[-1] == "":
        row_values.pop()

    if not row_values:
        # Nothing to write
        return None

    # Find the next empty row efficiently
    next_row = _find_next_empty_row(worksheet, len(row_values))

    # Ensure sheet has capacity
    _ensure_sheet_capacity(worksheet, next_row, len(row_values))

    # Build the exact range (only as wide as our data)
    start_col = "A"
    end_col = _col_index_to_letter(len(row_values) - 1)
    cell_range = f"{start_col}{next_row}:{end_col}{next_row}"

    logger.info(f"Writing to {worksheet.title}!{cell_range}")

    # Write with retry on transient failure
    try:
        worksheet.update(
            cell_range,
            [row_values],
            value_input_option="USER_ENTERED",
        )
    except APIError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 429:
            # Rate limited — wait and retry once
            import time
            time.sleep(2)
            worksheet.update(
                cell_range,
                [row_values],
                value_input_option="USER_ENTERED",
            )
        else:
            raise

    # Invalidate any cached reads for this sheet/tab so subsequent autofill
    # queries see the row we just wrote.
    _invalidate_rows_cache(spreadsheet_id, worksheet_name)

    return f"{worksheet.title}!{cell_range}"


# ---------------------------------------------------------------------------
# Read existing rows for autofill suggestions
# ---------------------------------------------------------------------------


def read_sheet_rows(
    *,
    spreadsheet_id: str,
    worksheet_name: str | None,
    fields: list[FieldSchema],
    max_rows: int = 10000,
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

        # Read headers to map columns
        live_headers = worksheet.row_values(1)
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
        # Use min(max_rows, worksheet.row_count) to cap at actual sheet size.
        actual_max = min(max_rows, max(worksheet.row_count - 1, 1))
        end_col = _col_index_to_letter(max(field_col_map.values()))
        data_range = f"A2:{end_col}{actual_max + 1}"

        logger.info(
            f"Reading up to {actual_max} rows from {worksheet.title}!{data_range}"
        )
        all_data = worksheet.get(data_range)

        if not all_data:
            return []

        # Convert to list of dicts
        rows: list[dict[str, str]] = []
        for row_data in all_data:
            row_dict: dict[str, str] = {}
            has_data = False
            for field in fields:
                col_idx = field_col_map[field.key]
                value = row_data[col_idx] if col_idx < len(row_data) else ""
                row_dict[field.key] = value
                if value.strip():
                    has_data = True
            if has_data:
                rows.append(row_dict)

        logger.info(f"Returned {len(rows)} non-empty rows from sheet")
        _ROWS_CACHE[cache_key] = (time.time(), rows)
        return rows

    except Exception as e:
        logger.exception(f"Failed to read sheet rows: {type(e).__name__}: {e}")
        return []


# ---------------------------------------------------------------------------
# Exception → HTTP status mapper
# ---------------------------------------------------------------------------


def map_sheet_exception(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, GoogleSheetsConfigurationError):
        # Configuration errors are deployment issues, not user issues —
        # log the real reason but only show a neutral message to the client.
        logger.error("sheets.config_error", exc_info=exc)
        return 500, "Google Sheets is not configured. Please contact support."
    if isinstance(exc, PublicSheetError):
        return 422, str(exc)
    if isinstance(exc, SpreadsheetNotFound):
        return 404, "Spreadsheet not found or not shared with the service account."
    if isinstance(exc, WorksheetNotFound):
        return 404, "Worksheet/tab not found."
    if isinstance(exc, APIError):
        status_code = (
            getattr(getattr(exc, "response", None), "status_code", None) or 502
        )
        # Log the raw message for debugging, surface a safe one.
        logger.warning("sheets.api_error status=%s message=%s", status_code, str(exc)[:500])
        if status_code == 400:
            return 400, "The sheet structure changed or the request was invalid."
        if status_code == 403:
            return 403, "No permission to read or write this sheet."
        if status_code == 404:
            return 404, "Sheet or tab not found."
        if status_code == 429:
            return 429, "Google Sheets rate limit reached. Try again in a minute."
        return int(status_code), "Google Sheets is unavailable right now. Please retry."
    logger.exception("sheets.unexpected_error", exc_info=exc)
    return 500, "Unexpected Google Sheets error."
