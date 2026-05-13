from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from functools import partial

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sheet_error(exc: Exception) -> HTTPException:
    status_code, message = map_sheet_exception(exc)
    return HTTPException(status_code=status_code, detail=message)


def _get_record_or_404(form_id: str) -> dict:
    record = form_store.get_form(form_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Form not found")
    return record


async def _get_record_or_404_async(form_id: str) -> dict:
    record = await asyncio.to_thread(form_store.get_form, form_id)
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/config/public")
def public_config() -> dict[str, str | None]:
    settings = get_settings()
    return {"service_account_email": settings.google_service_account_email}


@router.post("/sheet/create", response_model=CreateSheetResponse)
async def create_sheet(payload: CreateSheetRequest) -> CreateSheetResponse:
    _ensure_fields(payload.fields)

    def _do_create():
        try:
            client = get_client()
        except Exception as exc:
            logger.exception("sheet.create.client_init_failed")
            raise _sheet_error(exc) from exc

        try:
            spreadsheet = client.create(payload.form_title)
            worksheet = spreadsheet.sheet1
            headers = [field.source_header for field in payload.fields]
            worksheet.update("A1", [headers], value_input_option="RAW")
        except Exception as exc:
            logger.warning(
                "sheet.create.failed title=%r type=%s msg=%s",
                payload.form_title,
                type(exc).__name__,
                str(exc)[:300],
            )
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

    return await asyncio.to_thread(_do_create)


@router.get("/forms/library")
async def list_form_library(limit: int = Query(50, ge=1, le=200)) -> dict:
    items = await asyncio.to_thread(form_store.list_forms, limit)
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
async def get_sheet_access(sheet_url: str) -> dict:
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    from app.services.sheets_client import check_sheet_access

    return await asyncio.to_thread(check_sheet_access, spreadsheet_id)


@router.get("/sheet/worksheets")
async def list_worksheets(sheet_url: str) -> dict:
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        from app.services.sheets_client import list_worksheet_names

        names = await asyncio.to_thread(list_worksheet_names, spreadsheet_id)
    except Exception as exc:
        raise _sheet_error(exc) from exc

    return {"items": names}


@router.post("/sheet/preview", response_model=PreviewResponse)
async def preview_sheet(payload: PreviewRequest) -> PreviewResponse:
    try:
        spreadsheet_id = extract_spreadsheet_id(payload.sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        spreadsheet_title, worksheet_name, headers = await asyncio.to_thread(
            read_headers, spreadsheet_id, payload.worksheet_name
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
async def create_form(payload: CreateFormRequest) -> CreateFormResponse:
    _validate_sheet_url_matches(payload.sheet_url, payload.spreadsheet_id)
    _ensure_fields(payload.fields)

    oauth_key = get_current_oauth_session_key()

    record = await asyncio.to_thread(
        partial(
            form_store.create_form,
            sheet_url=payload.sheet_url,
            spreadsheet_id=payload.spreadsheet_id,
            worksheet_name=payload.worksheet_name,
            form_title=payload.form_title,
            fields=payload.fields,
            custom_keywords=payload.custom_keywords,
            autofill_columns=payload.autofill_columns,
            oauth_key=oauth_key,
        )
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
async def get_sheet_history(
    sheet_url: str,
    worksheet_name: str | None = None,
    limit: int = Query(100000, ge=1, le=200000),
) -> dict:
    """
    Read history directly from any worksheet tab of a Google Sheet,
    even if no form has been created for it. Used by the Check History feature.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        spreadsheet_title, actual_worksheet, headers = await asyncio.to_thread(
            read_headers, spreadsheet_id, worksheet_name
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

    try:
        rows = await asyncio.to_thread(
            partial(
                read_sheet_rows,
                spreadsheet_id=spreadsheet_id,
                worksheet_name=actual_worksheet,
                fields=fields,
                max_rows=limit,
            )
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
async def lookup_forms_by_sheet(sheet_url: str) -> dict:
    """
    List ALL worksheet tabs from a Google Sheet (including ones without forms),
    merged with any existing form metadata.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    records = await asyncio.to_thread(
        form_store.find_forms_by_spreadsheet, spreadsheet_id
    )
    forms_by_tab: dict[str, dict] = {}
    for r in records:
        tab_key = (r.get("worksheet_name") or "").strip().lower()
        if tab_key and tab_key not in forms_by_tab:
            forms_by_tab[tab_key] = r

    try:
        from app.services.sheets_client import list_worksheet_names

        tab_names = await asyncio.to_thread(list_worksheet_names, spreadsheet_id)
    except Exception as exc:
        logger.warning(f"Could not list worksheet tabs: {exc}")
        tab_names = []

    if not tab_names and not records:
        raise HTTPException(
            status_code=404,
            detail="No tabs or forms found for this sheet.",
        )

    items = []

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
                items.append({
                    "id": None,
                    "form_title": tab,
                    "worksheet_name": tab,
                    "fields": [],
                    "autofill_columns": [],
                    "has_form": False,
                })
    else:
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
async def get_public_form(form_id: str) -> PublicFormResponse:
    record = await _get_record_or_404_async(form_id)
    return PublicFormResponse(
        id=record["id"],
        form_title=record["form_title"],
        worksheet_name=record.get("worksheet_name"),
        fields=record["fields"],
        autofill_columns=record.get("autofill_columns", []),
    )


@router.delete("/forms/{form_id}")
async def delete_form_endpoint(form_id: str, payload: dict | None = Body(None)) -> dict:
    """Delete a saved form and its submissions."""
    token = payload.get("token") if payload else None
    record = await _get_record_or_404_async(form_id)
    if token and token != record.get("edit_token"):
        raise HTTPException(status_code=403, detail="Invalid edit token")

    success = await asyncio.to_thread(form_store.delete_form, form_id)
    if not success:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"success": True}


@router.post("/forms/{form_id}/unauthorize")
async def unauthorize_form_endpoint(form_id: str, payload: dict | None = Body(None)) -> dict:
    """Unauthorize a form: clear its oauth_key and associated token if any."""
    token = payload.get("token") if payload else None
    record = await _get_record_or_404_async(form_id)

    if token:
        if token != record.get("edit_token"):
            raise HTTPException(status_code=403, detail="Invalid edit token")
    else:
        current_key = get_current_oauth_session_key()
        if record.get("oauth_key") and record.get("oauth_key") != current_key:
            raise HTTPException(status_code=403, detail="Not authorized to unauthorize this form")

    try:
        if record.get("oauth_key"):
            await asyncio.to_thread(form_store.clear_oauth_token, record.get("oauth_key"))
        await asyncio.to_thread(form_store.unset_oauth_key, form_id)
    except Exception as exc:
        logger.warning(f"Failed to unauthorize form {form_id}: {exc}")

    return {"success": True}


@router.get("/forms/{form_id}/edit", response_model=EditFormResponse)
async def get_edit_form(
    form_id: str, token: str = Query(..., min_length=16)
) -> EditFormResponse:
    record = await _get_record_or_404_async(form_id)
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
async def update_form(form_id: str, payload: UpdateFormRequest) -> UpdateFormResponse:
    record = await _get_record_or_404_async(form_id)
    if payload.edit_token != record["edit_token"]:
        raise HTTPException(status_code=403, detail="Invalid edit token")
    _ensure_fields(payload.fields)

    updated = await asyncio.to_thread(
        partial(
            form_store.update_form,
            form_id=form_id,
            form_title=payload.form_title,
            fields=payload.fields,
            custom_keywords=payload.custom_keywords,
            autofill_columns=payload.autofill_columns,
        )
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Form not found")

    def _sync_headers():
        oauth_key = updated.get("oauth_key") or DEFAULT_OAUTH_KEY
        with oauth_session_context(oauth_key):
            sync_sheet_headers(
                spreadsheet_id=updated["spreadsheet_id"],
                worksheet_name=updated["worksheet_name"],
                headers=[field.source_header for field in payload.fields],
            )

    try:
        await asyncio.to_thread(_sync_headers)
    except Exception as exc:
        if _has_credentials():
            raise _sheet_error(exc) from exc

    return UpdateFormResponse(success=True, id=form_id)


@router.get("/forms/{form_id}/submissions")
async def list_submissions(form_id: str, token: str = Query(..., min_length=16)) -> dict:
    record = await _get_record_or_404_async(form_id)
    if token != record["edit_token"]:
        raise HTTPException(status_code=403, detail="Invalid edit token")

    items = await asyncio.to_thread(form_store.list_submissions, form_id=form_id)
    return {"items": items}


@router.get("/forms/{form_id}/suggestions")
async def get_form_suggestions(form_id: str, limit: int = Query(100000, ge=1, le=200000)) -> dict:
    """
    Read existing rows from the backing Google Sheet and return them
    as autofill suggestions.
    """
    record = await _get_record_or_404_async(form_id)

    def _read():
        oauth_key = record.get("oauth_key") or DEFAULT_OAUTH_KEY
        with oauth_session_context(oauth_key):
            return read_sheet_rows(
                spreadsheet_id=record["spreadsheet_id"],
                worksheet_name=record["worksheet_name"],
                fields=record["fields"],
                max_rows=limit,
            )

    rows = await asyncio.to_thread(_read)
    return {"rows": rows}


@router.post("/forms/{form_id}/submit", response_model=SubmitFormResponse)
async def submit_form(form_id: str, payload: SubmitFormRequest) -> SubmitFormResponse:
    record = await _get_record_or_404_async(form_id)
    _validate_submission(record, payload.values)

    # Ensure all field keys have a value (even empty string) so no columns are skipped
    complete_values = {}
    for field in record["fields"]:
        complete_values[field.key] = payload.values.get(field.key, "")

    # Try to append to Google Sheets (skipped automatically if no credentials).
    updated_range: str | None = None
    oauth_key = record.get("oauth_key") or DEFAULT_OAUTH_KEY

    def _append():
        with oauth_session_context(oauth_key):
            return append_form_row(
                spreadsheet_id=record["spreadsheet_id"],
                worksheet_name=record["worksheet_name"],
                fields=record["fields"],
                values=complete_values,
            )

    try:
        updated_range = await asyncio.to_thread(_append)
    except Exception as exc:
        with oauth_session_context(oauth_key):
            if _has_credentials():
                raise _sheet_error(exc) from exc
        # No credentials — Sheets write was skipped; fall through to DB save.

    # Always persist the submission locally in Postgres.
    await asyncio.to_thread(
        partial(
            form_store.save_submission,
            form_id=form_id,
            values=complete_values,
            sheets_range=updated_range,
        )
    )

    return SubmitFormResponse(
        success=True,
        updated_range=updated_range,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
