from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.models.form import (
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
from app.services.sheets_client import (
    _has_credentials,
    append_form_row,
    map_sheet_exception,
    read_headers,
    read_sheet_rows,
)
from app.utils.sanitizer import headers_to_fields
from app.utils.url_parser import InvalidGoogleSheetUrl, extract_spreadsheet_id

router = APIRouter(prefix="/api", tags=["forms"])


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

    record = form_store.create_form(
        sheet_url=payload.sheet_url,
        spreadsheet_id=payload.spreadsheet_id,
        worksheet_name=payload.worksheet_name,
        form_title=payload.form_title,
        fields=payload.fields,
        custom_keywords=payload.custom_keywords,
        autofill_columns=payload.autofill_columns,
    )

    form_url = f"/f/{record['id']}"
    edit_url = f"/edit/{record['id']}?token={record['edit_token']}"

    return CreateFormResponse(
        id=record["id"],
        edit_token=record["edit_token"],
        form_url=form_url,
        edit_url=edit_url,
    )


@router.get("/forms/lookup/by-sheet")
def lookup_forms_by_sheet(sheet_url: str) -> dict:
    """
    Find forms linked to a Google Sheet URL. Used by the history lookup
    feature so users can paste their sheet URL to find associated forms.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    records = form_store.find_forms_by_spreadsheet(spreadsheet_id)

    items = [
        {
            "id": r["id"],
            "form_title": r["form_title"],
            "worksheet_name": r.get("worksheet_name"),
            "fields": [f.model_dump() for f in r["fields"]],
            "autofill_columns": r.get("autofill_columns", []),
        }
        for r in records
    ]

    if not items:
        raise HTTPException(
            status_code=404,
            detail="No forms found for this sheet. Create a form first.",
        )

    return {"items": items}


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
    try:
        updated_range = append_form_row(
            spreadsheet_id=record["spreadsheet_id"],
            worksheet_name=record["worksheet_name"],
            fields=record["fields"],
            values=complete_values,
        )
    except Exception as exc:
        # If credentials are configured but Sheets write fails, surface the error.
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
