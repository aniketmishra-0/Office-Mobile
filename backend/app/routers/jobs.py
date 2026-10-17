"""
Background jobs router for long-running / heavy spreadsheet operations.

Uses FastAPI BackgroundTasks with a persistent PostgreSQL `jobs` table
for progress tracking, status polling, and chunked crash resilience.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import get_settings
from app.limiter import limiter
from app.services import job_store
from app.services.cache import invalidate_sheet_cache
from app.services.session_context import (
    get_current_oauth_session_key,
    oauth_session_context,
)
from app.services.sheets_client import (
    _has_credentials,
    batch_append_rows,
    batch_delete_rows,
    get_client,
    read_sheet_history_authenticated,
)
from app.services.websocket_manager import ws_manager
from app.utils.error_responses import ErrorCode
from app.utils.url_parser import InvalidGoogleSheetUrl, extract_spreadsheet_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])

CHUNK_SIZE = 50


# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------


class BatchAppendJobRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: Optional[str] = Field(default=None, max_length=100)
    rows: list[dict[str, str]] = Field(..., min_length=1, max_length=2000)

    model_config = {"extra": "ignore"}


class BulkDeleteJobRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: Optional[str] = Field(default=None, max_length=100)
    row_indices: list[int] = Field(..., min_length=1, max_length=2000)

    model_config = {"extra": "ignore"}


class DuplicateScanJobRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10, max_length=2000)
    worksheet_name: Optional[str] = Field(default=None, max_length=100)
    key_columns: Optional[list[str]] = Field(default=None, max_length=50)

    model_config = {"extra": "ignore"}


class JobStatusResponse(BaseModel):
    id: str
    job_type: str
    status: str
    progress_pct: int
    processed_count: int
    total_count: int
    sheet_id: Optional[str] = None
    result: dict[str, Any] = {}
    error: Optional[str] = None
    created_at: str
    updated_at: str


class JobCreatedResponse(BaseModel):
    job_id: str
    status: str
    message: str
    poll_url: str


# ---------------------------------------------------------------------------
# Background Task Workers
# ---------------------------------------------------------------------------


def _execute_batch_append_worker(
    job_id: str,
    spreadsheet_id: str,
    worksheet_name: Optional[str],
    rows: list[dict[str, str]],
    oauth_key: Optional[str],
) -> None:
    """Synchronous worker function that writes chunks and records progress."""
    with oauth_session_context(oauth_key):
        total = len(rows)
        job_store.update_job_progress(job_id, processed_count=0, total_count=total, status="running")
        processed = 0

        try:
            for i in range(0, total, CHUNK_SIZE):
                chunk = rows[i : i + CHUNK_SIZE]
                batch_append_rows(
                    spreadsheet_id=spreadsheet_id,
                    worksheet_name=worksheet_name,
                    rows=chunk,
                )
                processed += len(chunk)
                job_store.update_job_progress(
                    job_id,
                    processed_count=processed,
                    total_count=total,
                    status="running",
                )

            # Mark completed in DB
            job_store.complete_job(
                job_id,
                result={"appended_count": total, "spreadsheet_id": spreadsheet_id},
                processed_count=total,
            )

            # Invalidate cache and broadcast WebSocket event
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(invalidate_sheet_cache(spreadsheet_id))
                    loop.create_task(
                        ws_manager.broadcast(
                            sheet_id=spreadsheet_id,
                            event_type="rows_batch_appended",
                            extra={"appended_count": total, "job_id": job_id},
                        )
                    )
            except Exception as broadcast_err:
                logger.debug("Background worker cache/ws broadcast skipped: %s", broadcast_err)

        except Exception as exc:
            logger.exception("batch_append_worker failed on job %s: %s", job_id, exc)
            job_store.fail_job(job_id, str(exc))


def _execute_bulk_delete_worker(
    job_id: str,
    spreadsheet_id: str,
    worksheet_name: Optional[str],
    row_indices: list[int],
    oauth_key: Optional[str],
) -> None:
    """Delete rows in descending chunks and record progress."""
    with oauth_session_context(oauth_key):
        # Sort descending to keep row indices valid during deletions
        sorted_indices = sorted(set(row_indices), reverse=True)
        total = len(sorted_indices)
        job_store.update_job_progress(job_id, processed_count=0, total_count=total, status="running")
        processed = 0

        try:
            for i in range(0, total, CHUNK_SIZE):
                chunk = sorted_indices[i : i + CHUNK_SIZE]
                deleted = batch_delete_rows(
                    spreadsheet_id=spreadsheet_id,
                    worksheet_name=worksheet_name,
                    row_indices=chunk,
                )
                processed += deleted
                job_store.update_job_progress(
                    job_id,
                    processed_count=processed,
                    total_count=total,
                    status="running",
                )

            job_store.complete_job(
                job_id,
                result={"deleted_count": processed, "spreadsheet_id": spreadsheet_id},
                processed_count=processed,
            )

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(invalidate_sheet_cache(spreadsheet_id))
                    loop.create_task(
                        ws_manager.broadcast(
                            sheet_id=spreadsheet_id,
                            event_type="rows_batch_deleted",
                            extra={"deleted_count": processed, "job_id": job_id},
                        )
                    )
            except Exception as broadcast_err:
                logger.debug("Background bulk delete broadcast skipped: %s", broadcast_err)

        except Exception as exc:
            logger.exception("bulk_delete_worker failed on job %s: %s", job_id, exc)
            job_store.fail_job(job_id, str(exc))


def _execute_duplicate_scan_worker(
    job_id: str,
    spreadsheet_id: str,
    worksheet_name: Optional[str],
    key_columns: Optional[list[str]],
    oauth_key: Optional[str],
) -> None:
    """Read sheet rows, scan for duplicate entries, and record duplicate row indices."""
    with oauth_session_context(oauth_key):
        job_store.update_job_progress(job_id, processed_count=0, total_count=100, status="running")

        try:
            history = read_sheet_history_authenticated(
                spreadsheet_id=spreadsheet_id,
                worksheet_name=worksheet_name,
                limit=10000,
            )
            headers: list[str] = history.get("headers") or []
            rows: list[dict[str, Any]] = history.get("rows") or []
            total = len(rows)

            job_store.update_job_progress(job_id, processed_count=0, total_count=total, status="running")

            # Determine key columns to match
            keys_to_match = [k.strip() for k in key_columns] if key_columns else headers

            seen: dict[tuple, int] = {}
            duplicates: list[dict[str, Any]] = []

            for idx, r in enumerate(rows):
                # Row index in Google Sheets: row 1 is header, data starts at row 2
                sheet_row_index = idx + 2
                key_tuple = tuple(str(r.get(col, "")).strip().lower() for col in keys_to_match)

                if key_tuple in seen:
                    first_seen_row = seen[key_tuple]
                    duplicates.append({
                        "row_index": sheet_row_index,
                        "duplicate_of_row": first_seen_row,
                        "matched_values": {col: r.get(col) for col in keys_to_match},
                    })
                else:
                    seen[key_tuple] = sheet_row_index

                if idx % CHUNK_SIZE == 0:
                    job_store.update_job_progress(
                        job_id,
                        processed_count=idx + 1,
                        total_count=total,
                        status="running",
                    )

            result = {
                "total_rows_scanned": total,
                "duplicate_count": len(duplicates),
                "matched_columns": keys_to_match,
                "duplicates": duplicates[:500],  # cap return list to 500 items
            }

            job_store.complete_job(job_id, result=result, processed_count=total)

        except Exception as exc:
            logger.exception("duplicate_scan_worker failed on job %s: %s", job_id, exc)
            job_store.fail_job(job_id, str(exc))


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, request: Request):
    """
    Check the status and progress of a background job.
    Returns status ('queued', 'running', 'completed', 'failed'), progress_pct,
    processed_count, total_count, result, and any error message.
    """
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found",
        )
    return JobStatusResponse(**job)


@router.post(
    "/batch-append",
    response_model=JobCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(get_settings().rate_limit_batch)
async def enqueue_batch_append(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: BatchAppendJobRequest = Body(...),
):
    """
    Enqueue a background job to append up to 2,000 rows to a Google Sheet.
    Writes rows in chunks of 50 to prevent memory spikes and API timeouts.
    Check progress via GET /api/jobs/{job_id}.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(payload.sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not _has_credentials():
        raise HTTPException(status_code=500, detail="Google credentials not configured")

    oauth_key = get_current_oauth_session_key()
    total_count = len(payload.rows)

    job = job_store.create_job(
        job_type="batch_append",
        user_key=oauth_key,
        sheet_id=spreadsheet_id,
        total_count=total_count,
        params={"worksheet_name": payload.worksheet_name},
    )

    background_tasks.add_task(
        _execute_batch_append_worker,
        job_id=job["id"],
        spreadsheet_id=spreadsheet_id,
        worksheet_name=payload.worksheet_name,
        rows=payload.rows,
        oauth_key=oauth_key,
    )

    return JobCreatedResponse(
        job_id=job["id"],
        status="queued",
        message=f"Queued batch append of {total_count} rows in background.",
        poll_url=f"/api/jobs/{job['id']}",
    )


@router.post(
    "/bulk-delete",
    response_model=JobCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(get_settings().rate_limit_batch)
async def enqueue_bulk_delete(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: BulkDeleteJobRequest = Body(...),
):
    """
    Enqueue a background job to delete up to 2,000 rows from a Google Sheet.
    Deletes in descending chunks to ensure index stability.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(payload.sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not _has_credentials():
        raise HTTPException(status_code=500, detail="Google credentials not configured")

    oauth_key = get_current_oauth_session_key()
    total_count = len(payload.row_indices)

    job = job_store.create_job(
        job_type="bulk_delete",
        user_key=oauth_key,
        sheet_id=spreadsheet_id,
        total_count=total_count,
        params={"worksheet_name": payload.worksheet_name},
    )

    background_tasks.add_task(
        _execute_bulk_delete_worker,
        job_id=job["id"],
        spreadsheet_id=spreadsheet_id,
        worksheet_name=payload.worksheet_name,
        row_indices=payload.row_indices,
        oauth_key=oauth_key,
    )

    return JobCreatedResponse(
        job_id=job["id"],
        status="queued",
        message=f"Queued bulk delete of {total_count} rows in background.",
        poll_url=f"/api/jobs/{job['id']}",
    )


@router.post(
    "/duplicate-scan",
    response_model=JobCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(get_settings().rate_limit_batch)
async def enqueue_duplicate_scan(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: DuplicateScanJobRequest = Body(...),
):
    """
    Enqueue a background job to scan a sheet for duplicate rows.
    Optionally specify key_columns to match duplicates on specific columns only.
    """
    try:
        spreadsheet_id = extract_spreadsheet_id(payload.sheet_url)
    except InvalidGoogleSheetUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not _has_credentials():
        raise HTTPException(status_code=500, detail="Google credentials not configured")

    oauth_key = get_current_oauth_session_key()

    job = job_store.create_job(
        job_type="duplicate_scan",
        user_key=oauth_key,
        sheet_id=spreadsheet_id,
        total_count=0,
        params={
            "worksheet_name": payload.worksheet_name,
            "key_columns": payload.key_columns,
        },
    )

    background_tasks.add_task(
        _execute_duplicate_scan_worker,
        job_id=job["id"],
        spreadsheet_id=spreadsheet_id,
        worksheet_name=payload.worksheet_name,
        key_columns=payload.key_columns,
        oauth_key=oauth_key,
    )

    return JobCreatedResponse(
        job_id=job["id"],
        status="queued",
        message="Queued duplicate scan job in background.",
        poll_url=f"/api/jobs/{job['id']}",
    )
