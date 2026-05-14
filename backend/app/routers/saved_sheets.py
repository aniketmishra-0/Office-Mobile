"""
Router for Saved Sheets — lets users bookmark Google Sheets for quick access later.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.db import execute, fetchall, fetchone
from app.services.session_context import get_current_oauth_session_key

router = APIRouter(prefix="/api/saved-sheets", tags=["saved-sheets"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SaveSheetRequest(BaseModel):
    sheet_url: str = Field(..., min_length=10)
    spreadsheet_id: str = Field(..., min_length=5)
    title: str = Field(..., min_length=1, max_length=200)
    worksheet_name: str | None = None


class SaveSheetResponse(BaseModel):
    id: str
    title: str
    sheet_url: str
    spreadsheet_id: str
    worksheet_name: str | None = None
    saved_at: str


class SavedSheetItem(BaseModel):
    id: str
    title: str
    sheet_url: str
    spreadsheet_id: str
    worksheet_name: str | None = None
    saved_at: str


class SavedSheetsListResponse(BaseModel):
    items: list[SavedSheetItem]


# ---------------------------------------------------------------------------
# DB Schema (called from form_store.init_db via main.py lifespan)
# ---------------------------------------------------------------------------

CREATE_SAVED_SHEETS_SQL = """
CREATE TABLE IF NOT EXISTS saved_sheets (
    id              TEXT PRIMARY KEY,
    session_key     TEXT NOT NULL,
    title           TEXT NOT NULL,
    sheet_url       TEXT NOT NULL,
    spreadsheet_id  TEXT NOT NULL,
    worksheet_name  TEXT,
    saved_at        TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_SAVED_SHEETS_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_saved_sheets_session ON saved_sheets(session_key)",
    "CREATE INDEX IF NOT EXISTS idx_saved_sheets_session_time ON saved_sheets(session_key, saved_at DESC)",
]


def init_saved_sheets_table() -> None:
    """Create the saved_sheets table if it doesn't exist."""
    from app.db import connection as db_connection

    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_SAVED_SHEETS_SQL)
            for stmt in CREATE_SAVED_SHEETS_INDEXES:
                cur.execute(stmt)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_session_key(request: Request, response: Response) -> str:
    """Extract or create a session key for the current user."""
    key = get_current_oauth_session_key()
    if key:
        return key
    # Fallback: try header or cookie
    key = request.cookies.get("om_session") or request.headers.get("x-session-key")
    if not key:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return key


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=SavedSheetsListResponse)
def list_saved_sheets(request: Request, response: Response):
    """List all saved sheets for the current user."""
    session_key = _get_session_key(request, response)

    rows = fetchall(
        """
        SELECT id, title, sheet_url, spreadsheet_id, worksheet_name, saved_at
        FROM saved_sheets
        WHERE session_key = %s
        ORDER BY saved_at DESC
        """,
        (session_key,),
    )

    items = []
    for row in rows:
        saved_at = row["saved_at"]
        if isinstance(saved_at, datetime):
            saved_at = saved_at.isoformat()
        items.append(
            SavedSheetItem(
                id=row["id"],
                title=row["title"],
                sheet_url=row["sheet_url"],
                spreadsheet_id=row["spreadsheet_id"],
                worksheet_name=row.get("worksheet_name"),
                saved_at=str(saved_at),
            )
        )

    return SavedSheetsListResponse(items=items)


@router.post("", response_model=SaveSheetResponse, status_code=201)
def save_sheet(body: SaveSheetRequest, request: Request, response: Response):
    """Save a Google Sheet for quick access later."""
    session_key = _get_session_key(request, response)

    sheet_id = uuid4().hex[:12]
    now = datetime.now(timezone.utc)

    execute(
        """
        INSERT INTO saved_sheets (id, session_key, title, sheet_url, spreadsheet_id, worksheet_name, saved_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            sheet_id,
            session_key,
            body.title,
            body.sheet_url,
            body.spreadsheet_id,
            body.worksheet_name,
            now,
        ),
    )

    return SaveSheetResponse(
        id=sheet_id,
        title=body.title,
        sheet_url=body.sheet_url,
        spreadsheet_id=body.spreadsheet_id,
        worksheet_name=body.worksheet_name,
        saved_at=now.isoformat(),
    )


@router.delete("/{sheet_id}")
def delete_saved_sheet(sheet_id: str, request: Request, response: Response):
    """Remove a saved sheet."""
    session_key = _get_session_key(request, response)

    row = fetchone(
        "SELECT id FROM saved_sheets WHERE id = %s AND session_key = %s",
        (sheet_id, session_key),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Saved sheet not found")

    execute(
        "DELETE FROM saved_sheets WHERE id = %s AND session_key = %s",
        (sheet_id, session_key),
    )

    return {"success": True}


@router.patch("/{sheet_id}")
def rename_saved_sheet(
    sheet_id: str,
    request: Request,
    response: Response,
    body: dict[str, Any] = {},
):
    """Rename a saved sheet."""
    session_key = _get_session_key(request, response)

    new_title = (body.get("title") or "").strip()
    if not new_title:
        raise HTTPException(status_code=422, detail="Title is required")
    if len(new_title) > 200:
        raise HTTPException(status_code=422, detail="Title too long (max 200 chars)")

    row = fetchone(
        "SELECT id FROM saved_sheets WHERE id = %s AND session_key = %s",
        (sheet_id, session_key),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Saved sheet not found")

    execute(
        "UPDATE saved_sheets SET title = %s WHERE id = %s AND session_key = %s",
        (new_title, sheet_id, session_key),
    )

    return {"success": True, "title": new_title}
