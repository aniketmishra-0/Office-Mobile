from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Body

from app.config import get_settings
from app.models.form import (
    CreateSheetRequest,
    CreateSheetResponse,
    CreateFormRequest,
    CreateFormResponse,
    EditFormResponse,
    PreviewRequest,
    PreviewResponse,
    PublicFormResponse,
    SubmitFormRequest,
    SubmitFormResponse,
    UpdateFormRequest,
    UpdateFormResponse,
)
from app.services import form_store
from app.services.session_context import DEFAULT_OAUTH_KEY, get_current_oauth_session_key, oauth_session_context
from app.services.sheets_client import (
    _has_credentials,
    append_form_row,
    get_client,
    map_sheet_exception,
    read_headers,
    read_sheet_rows,
    sync_sheet_headers,
)
from app.utils.sanitizer import headers_to_fields
from app.utils.url_parser import InvalidGoogleSheetUrl, extract_spreadsheet_id

router = APIRouter(prefix="/api", tags=["forms"])

logger = logging.getLogger(__name__)


def _sheet_error(exc: Exception) -> HTTPException:
    status_code, message = map_sheet_exception(exc)
    return HTTPException(status_code=status_code, detail=message)


def _get_record_or_404(form_id: str) -> dict:
    record = form_store.get_form(form_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return record


def _ensure_fields(fields: list) -> None:
    if not fields:
        raise HTTPException(
            status_code=400,
            detail="No usable headers found in row 1 of the selected sheet.",
        )


def _validate_sheet_url_matches(sheet_url: str, spreadsheet_id: str) -> None:
    try:
        parsed_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if parsed_id != spreadsheet_id:
        raise HTTPException(
            status_code=400,
            detail="Spreadsheet ID does not match the pasted Google Sheet URL.",
        )


def _validate_submission(record: dict, values: dict) -> None:
    allowed_keys = {field.key for field in record["fields"]}
    for key in values:
        if key not in allowed_keys:
            raise HTTPException(status_code=400, detail=f"Unknown field key: {key}")

    for field in record["fields"]:
        if not field.required:
            continue
        value = values.get(field.key)
        if value is None or str(value).strip() == "":
            raise HTTPException(status_code=400, detail=f"{field.label} is required")


@router.get("/config/public")
def public_config() -> dict[str, str | None]:
    settings = get_settings()
    return {"service_account_email": settings.google_service_account_email}


@router.post("/sheet/create", response_model=CreateSheetResponse)
def create_sheet(payload: CreateSheetRequest) -> CreateSheetResponse:
    _ensure_fields(payload.fields)

    try:
        client = get_client()
        spreadsheet = client.create(payload.form_title)
        worksheet = spreadsheet.sheet1
        headers = [field.source_header for field in payload.fields]
        worksheet.update("A1", [headers], value_input_option="RAW")
    except Exception as exc:
        raise _sheet_error(exc) from exc

    spreadsheet_id = spreadsheet.id
    sheet_url = (
        spreadsheet.url
        if getattr(spreadsheet, "url", None)
        else f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
    )

    return CreateSheetResponse(
        spreadsheet_id=spreadsheet_id,
        sheet_url=sheet_url,
        worksheet_name=worksheet.title,
    )


@router.get("/forms/library")
def list_form_library(limit: int = Query(50, ge=1, le=200)) -> dict:
    items = form_store.list_forms(limit=limit)
    return {
        "items": [
            {
                "id": item["id"],
                "form_title": item["form_title"],
                "sheet_url": item["sheet_url"],
                "spreadsheet_id": item["spreadsheet_id"],
                "worksheet_name": item.get("worksheet_name"),
                "field_count": len(item.get("fields", [])),
                "submission_count": item.get("submission_count") or 0,
                "updated_at": item.get("updated_at"),
                "form_url": f"/f/{item['id']}",
                "edit_url": f"/edit/{item['id']}?token={item['edit_token']}",
            }
            for item in items
        ]
    }


@router.get("/sheet/access")
def get_sheet_access(sheet_url: str) -> dict:
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    from app.services.sheets_client import check_sheet_access

    return check_sheet_access(spreadsheet_id)


@router.get("/sheet/worksheets")
def list_worksheets(sheet_url: str) -> dict:
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        from app.services.sheets_client import list_worksheet_names

        names = list_worksheet_names(spreadsheet_id)
    except Exception as exc:
        raise _sheet_error(exc) from exc

    return {"items": names}


@router.post("/sheet/preview", response_model=PreviewResponse)
def preview_sheet(payload: PreviewRequest) -> PreviewResponse:
    try:
        spreadsheet_id = extract_spreadsheet_id(payload.sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        spreadsheet_title, worksheet_name, headers = read_headers(
            spreadsheet_id, payload.worksheet_name
        )
    except Exception as exc:
        raise _sheet_error(exc) from exc

    fields, warnings = headers_to_fields(headers, payload.custom_keywords)
    _ensure_fields(fields)

    return PreviewResponse(
        spreadsheet_id=spreadsheet_id,
        sheet_url=payload.sheet_url,
        spreadsheet_title=spreadsheet_title,
        worksheet_name=worksheet_name,
        form_title=spreadsheet_title,
        fields=fields,
        custom_keywords=payload.custom_keywords,
        warnings=warnings,
    )


@router.post("/forms", response_model=CreateFormResponse)
def create_form(payload: CreateFormRequest) -> CreateFormResponse:
    _validate_sheet_url_matches(payload.sheet_url, payload.spreadsheet_id)
    _ensure_fields(payload.fields)

    oauth_key = get_current_oauth_session_key()

    record = form_store.create_form(
        sheet_url=payload.sheet_url,
        spreadsheet_id=payload.spreadsheet_id,
        worksheet_name=payload.worksheet_name,
        form_title=payload.form_title,
        fields=payload.fields,
        custom_keywords=payload.custom_keywords,
        autofill_columns=payload.autofill_columns,
        oauth_key=oauth_key,
    )

    form_url = f"/f/{record['id']}"
    edit_url = f"/edit/{record['id']}?token={record['edit_token']}"

    return CreateFormResponse(
        id=record["id"],
        edit_token=record["edit_token"],
        form_url=form_url,
        edit_url=edit_url,
    )


@router.get("/sheet/history")
def get_sheet_history(sheet_url: str, worksheet_name: str | None = None, limit: int = Query(10000, ge=1, le=50000)) -> dict:
    """
    Read history directly from any worksheet tab of a Google Sheet,
    even if no form has been created for it. Used by the Check History feature.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Read headers to build synthetic field schemas
    try:
        spreadsheet_title, actual_worksheet, headers = read_headers(
            spreadsheet_id, worksheet_name
        )
    except Exception as exc:
        raise _sheet_error(exc) from exc

    fields, _warnings = headers_to_fields(headers, custom_keywords=[])
    if not fields:
        return {
            "worksheet_name": actual_worksheet,
            "fields": [],
            "rows": [],
        }

    # Read data rows
    try:
        rows = read_sheet_rows(
            spreadsheet_id=spreadsheet_id,
            worksheet_name=actual_worksheet,
            fields=fields,
            max_rows=limit,
        )
    except Exception as exc:
        logger.warning(f"Failed to read rows for history: {exc}")
        rows = []

    return {
        "worksheet_name": actual_worksheet,
        "fields": [f.model_dump() for f in fields],
        "rows": rows,
    }


@router.get("/forms/lookup/by-sheet")
def lookup_forms_by_sheet(sheet_url: str) -> dict:
    """
    List ALL worksheet tabs from a Google Sheet (including ones without forms),
    merged with any existing form metadata. This lets users search history in
    any tab, not just tabs where a form has been created.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Fetch existing forms for this sheet, deduped by tab name (keep most recent)
    records = form_store.find_forms_by_spreadsheet(spreadsheet_id)
    forms_by_tab: dict[str, dict] = {}
    for r in records:
        tab_key = (r.get("worksheet_name") or "").strip().lower()
        if tab_key and tab_key not in forms_by_tab:
            forms_by_tab[tab_key] = r

    # Fetch the actual list of worksheet tabs from Google Sheets
    try:
        from app.services.sheets_client import list_worksheet_names

        tab_names = list_worksheet_names(spreadsheet_id)
    except Exception as exc:
        # Fall back to just the tabs we know from existing forms
        logger.warning(f"Could not list worksheet tabs: {exc}")
        tab_names = []

    # If we couldn't fetch tabs AND there are no forms, bail out
    if not tab_names and not records:
        raise HTTPException(
            status_code=404,
            detail="No tabs or forms found for this sheet.",
        )

    items = []

    # If we got the actual tab list, use that as source of truth
    if tab_names:
        for tab in tab_names:
            tab_key = tab.strip().lower()
            existing = forms_by_tab.get(tab_key)
            if existing:
                items.append({
                    "id": existing["id"],
                    "form_title": existing["form_title"],
                    "worksheet_name": existing.get("worksheet_name") or tab,
                    "fields": [f.model_dump() for f in existing["fields"]],
                    "autofill_columns": existing.get("autofill_columns", []),
                    "has_form": True,
                })
            else:
                # Tab exists in the sheet but no form yet — we'll load schema on demand
                items.append({
                    "id": None,
                    "form_title": tab,
                    "worksheet_name": tab,
                    "fields": [],
                    "autofill_columns": [],
                    "has_form": False,
                })
    else:
        # Fallback: only show tabs where forms exist
        for r in forms_by_tab.values():
            items.append({
                "id": r["id"],
                "form_title": r["form_title"],
                "worksheet_name": r.get("worksheet_name"),
                "fields": [f.model_dump() for f in r["fields"]],
                "autofill_columns": r.get("autofill_columns", []),
                "has_form": True,
            })

    return {"items": items, "spreadsheet_id": spreadsheet_id}


@router.get("/forms/{form_id}", response_model=PublicFormResponse)
def get_public_form(form_id: str) -> PublicFormResponse:
    record = _get_record_or_404(form_id)
    return PublicFormResponse(
        id=record["id"],
        form_title=record["form_title"],
        worksheet_name=record.get("worksheet_name"),
        fields=record["fields"],
        autofill_columns=record.get("autofill_columns", []),
    )


@router.delete("/forms/{form_id}")
def delete_form_endpoint(form_id: str, payload: dict | None = Body(None)) -> dict:
    """Delete a saved form and its submissions. Requires edit token if provided.
    If an edit token is supplied it must match the form's edit token.
    """
    token = payload.get("token") if payload else None
    record = _get_record_or_404(form_id)
    if token and token != record.get("edit_token"):
        raise HTTPException(status_code=403, detail="Invalid edit token")

    success = form_store.delete_form(form_id)
    if not success:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"success": True}


@router.post("/forms/{form_id}/unauthorize")
def unauthorize_form_endpoint(form_id: str, payload: dict | None = Body(None)) -> dict:
    """Unauthorize a form: clear its oauth_key and associated token if any.
    Requires either the edit token or the current oauth session that owns the token.
    """
    token = payload.get("token") if payload else None
    record = _get_record_or_404(form_id)

    # If edit token provided, validate it
    if token:
        if token != record.get("edit_token"):
            raise HTTPException(status_code=403, detail="Invalid edit token")
    else:
        # Otherwise require that the current oauth session matches the form's oauth_key
        current_key = get_current_oauth_session_key()
        if record.get("oauth_key") and record.get("oauth_key") != current_key:
            raise HTTPException(status_code=403, detail="Not authorized to unauthorize this form")

    # Clear the token and unset association
    try:
        if record.get("oauth_key"):
            form_store.clear_oauth_token(record.get("oauth_key"))
        form_store.unset_oauth_key(form_id)
    except Exception as exc:
        logger.warning(f"Failed to unauthorize form {form_id}: {exc}")

    return {"success": True}


@router.get("/forms/{form_id}/edit", response_model=EditFormResponse)
def get_edit_form(
    form_id: str, token: str = Query(..., min_length=16)
) -> EditFormResponse:
    record = _get_record_or_404(form_id)
    if token != record["edit_token"]:
        raise HTTPException(status_code=403, detail="Invalid edit token")

    return EditFormResponse(
        id=record["id"],
        sheet_url=record["sheet_url"],
        spreadsheet_id=record["spreadsheet_id"],
        worksheet_name=record["worksheet_name"],
        form_title=record["form_title"],
        fields=record["fields"],
        custom_keywords=record["custom_keywords"],
        autofill_columns=record.get("autofill_columns", []),
    )


@router.patch("/forms/{form_id}", response_model=UpdateFormResponse)
@router.put("/forms/{form_id}", response_model=UpdateFormResponse)
def update_form(form_id: str, payload: UpdateFormRequest) -> UpdateFormResponse:
    record = _get_record_or_404(form_id)
    if payload.edit_token != record["edit_token"]:
        raise HTTPException(status_code=403, detail="Invalid edit token")
    _ensure_fields(payload.fields)

    updated = form_store.update_form(
        form_id=form_id,
        form_title=payload.form_title,
        fields=payload.fields,
        custom_keywords=payload.custom_keywords,
        autofill_columns=payload.autofill_columns,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Form not found")

    try:
        oauth_key = updated.get("oauth_key") or DEFAULT_OAUTH_KEY
        with oauth_session_context(oauth_key):
            sync_sheet_headers(
                spreadsheet_id=updated["spreadsheet_id"],
                worksheet_name=updated["worksheet_name"],
                headers=[field.source_header for field in payload.fields],
            )
    except Exception as exc:
        if _has_credentials():
            raise _sheet_error(exc) from exc

    return UpdateFormResponse(success=True, id=form_id)


@router.get("/forms/{form_id}/submissions")
def list_submissions(form_id: str, token: str = Query(..., min_length=16)) -> dict:
    record = _get_record_or_404(form_id)
    if token != record["edit_token"]:
        raise HTTPException(status_code=403, detail="Invalid edit token")

    items = form_store.list_submissions(form_id=form_id)
    return {"items": items}


@router.get("/forms/{form_id}/suggestions")
def get_form_suggestions(form_id: str, limit: int = Query(10000, ge=1, le=50000)) -> dict:
    """
    Read existing rows from the backing Google Sheet and return them
    as autofill suggestions. Users can pick a matching row to auto-fill
    the entire form, then edit any field before submitting.
    """
    record = _get_record_or_404(form_id)

    oauth_key = record.get("oauth_key") or DEFAULT_OAUTH_KEY
    with oauth_session_context(oauth_key):
        rows = read_sheet_rows(
            spreadsheet_id=record["spreadsheet_id"],
            worksheet_name=record["worksheet_name"],
            fields=record["fields"],
            max_rows=limit,
        )

    return {"rows": rows}


@router.post("/forms/{form_id}/submit", response_model=SubmitFormResponse)
def submit_form(form_id: str, payload: SubmitFormRequest) -> SubmitFormResponse:
    record = _get_record_or_404(form_id)
    _validate_submission(record, payload.values)

    # Ensure all field keys have a value (even empty string) so no columns are skipped
    complete_values = {}
    for field in record["fields"]:
        complete_values[field.key] = payload.values.get(field.key, "")

    # Try to append to Google Sheets (skipped automatically if no credentials).
    updated_range: str | None = None
    oauth_key = record.get("oauth_key") or DEFAULT_OAUTH_KEY
    try:
        with oauth_session_context(oauth_key):
            updated_range = append_form_row(
                spreadsheet_id=record["spreadsheet_id"],
                worksheet_name=record["worksheet_name"],
                fields=record["fields"],
                values=complete_values,
            )
    except Exception as exc:
        # If credentials are configured but Sheets write fails, surface the error.
        with oauth_session_context(oauth_key):
            if _has_credentials():
                raise _sheet_error(exc) from exc
        # No credentials — Sheets write was skipped; fall through to SQLite save.

    # Always persist the submission locally in SQLite.
    form_store.save_submission(
        form_id=form_id,
        values=complete_values,
        sheets_range=updated_range,
    )

    return SubmitFormResponse(
        success=True,
        updated_range=updated_range,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
