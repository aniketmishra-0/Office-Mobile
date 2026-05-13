from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.config import get_settings
from app.models.field import CustomKeywordRule, FieldSchema
from app.services import session_context

CREATE_FORMS_SQL = """
CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    edit_token TEXT NOT NULL,
    oauth_key TEXT,
    sheet_url TEXT NOT NULL,
    spreadsheet_id TEXT NOT NULL,
    worksheet_name TEXT,
    form_title TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    custom_keywords_json TEXT NOT NULL,
    autofill_columns_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""

CREATE_SUBMISSIONS_SQL = """
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    values_json TEXT NOT NULL,
    sheets_range TEXT,
    submitted_at TEXT NOT NULL
)
"""

CREATE_OAUTH_TOKENS_SQL = """
CREATE TABLE IF NOT EXISTS oauth_tokens (
    key TEXT PRIMARY KEY,
    token_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    settings = get_settings()
    db_dir = os.path.dirname(settings.form_db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(settings.form_db_path)
    conn.row_factory = sqlite3.Row
    # Enable Write-Ahead Logging so readers don't block writers and vice versa.
    # busy_timeout gives SQLite up to 5s to acquire a lock before raising,
    # which handles the occasional concurrent write cleanly.
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
    except sqlite3.DatabaseError:
        # Some filesystems (e.g. read-only mounts) reject PRAGMA changes.
        # We continue with defaults rather than crash.
        pass
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(CREATE_FORMS_SQL)
        conn.execute(CREATE_SUBMISSIONS_SQL)
        conn.execute(CREATE_OAUTH_TOKENS_SQL)
        # Migrate: add autofill_columns_json if missing (for existing DBs)
        try:
            conn.execute(
                "ALTER TABLE forms ADD COLUMN autofill_columns_json TEXT NOT NULL DEFAULT '[]'"
            )
        except Exception:
            pass  # Column already exists

        # Migrate: add oauth_key for per-session OAuth association
        try:
            conn.execute("ALTER TABLE forms ADD COLUMN oauth_key TEXT")
        except Exception:
            pass  # Column already exists

        # Indexes — idempotent, safe to run every start.
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_forms_spreadsheet_id ON forms(spreadsheet_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON forms(updated_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_submissions_form_id_time "
            "ON submissions(form_id, submitted_at DESC)"
        )
        conn.commit()


def _dump_models(items: list[FieldSchema] | list[CustomKeywordRule]) -> str:
    return json.dumps([item.model_dump() for item in items])


def _load_fields(raw: str) -> list[FieldSchema]:
    return [FieldSchema(**item) for item in json.loads(raw)]


def _load_keywords(raw: str) -> list[CustomKeywordRule]:
    return [CustomKeywordRule(**item) for item in json.loads(raw)]


def _row_to_record(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    # Handle autofill_columns_json gracefully (column may not exist in old DBs)
    autofill_raw = ""
    try:
        autofill_raw = row["autofill_columns_json"]
    except (IndexError, KeyError):
        autofill_raw = "[]"
    oauth_key = None
    try:
        oauth_key = row["oauth_key"]
    except (IndexError, KeyError):
        oauth_key = None
    try:
        submission_count = row["submission_count"]
    except (IndexError, KeyError):
        submission_count = None
    return {
        "id": row["id"],
        "edit_token": row["edit_token"],
        "oauth_key": oauth_key,
        "sheet_url": row["sheet_url"],
        "spreadsheet_id": row["spreadsheet_id"],
        "worksheet_name": row["worksheet_name"],
        "form_title": row["form_title"],
        "fields": _load_fields(row["fields_json"]),
        "custom_keywords": _load_keywords(row["custom_keywords_json"]),
        "autofill_columns": json.loads(autofill_raw) if autofill_raw else [],
        "submission_count": submission_count,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_form(
    *,
    sheet_url: str,
    spreadsheet_id: str,
    worksheet_name: str | None,
    form_title: str,
    fields: list[FieldSchema],
    custom_keywords: list[CustomKeywordRule],
    autofill_columns: list[str] | None = None,
    oauth_key: str | None = None,
) -> dict[str, Any]:
    form_id = uuid4().hex[:12]
    edit_token = secrets.token_urlsafe(24)
    now = _utc_now()

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO forms (
                id, edit_token, oauth_key, sheet_url, spreadsheet_id, worksheet_name,
                form_title, fields_json, custom_keywords_json, autofill_columns_json,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                form_id,
                edit_token,
                oauth_key,
                sheet_url,
                spreadsheet_id,
                worksheet_name,
                form_title,
                _dump_models(fields),
                _dump_models(custom_keywords),
                json.dumps(autofill_columns or []),
                now,
                now,
            ),
        )
        conn.commit()

    return get_form(form_id) or {}


def get_form(form_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
    return _row_to_record(row)


def find_forms_by_spreadsheet(spreadsheet_id: str) -> list[dict[str, Any]]:
    """Find all forms linked to a given spreadsheet ID."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM forms WHERE spreadsheet_id = ? ORDER BY updated_at DESC",
            (spreadsheet_id,),
        ).fetchall()
    results = []
    for row in rows:
        record = _row_to_record(row)
        if record:
            results.append(record)
    return results


def list_forms(limit: int = 100) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT f.*, COUNT(s.id) AS submission_count
            FROM forms f
            LEFT JOIN submissions s ON s.form_id = f.id
            GROUP BY f.id
            ORDER BY f.updated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        record = _row_to_record(row)
        if record:
            results.append(record)
    return results


def update_form(
    *,
    form_id: str,
    form_title: str,
    fields: list[FieldSchema],
    custom_keywords: list[CustomKeywordRule],
    autofill_columns: list[str] | None = None,
) -> dict[str, Any] | None:
    now = _utc_now()
    with _connect() as conn:
        conn.execute(
            """
            UPDATE forms
            SET form_title = ?, fields_json = ?, custom_keywords_json = ?,
                autofill_columns_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                form_title,
                _dump_models(fields),
                _dump_models(custom_keywords),
                json.dumps(autofill_columns or []),
                now,
                form_id,
            ),
        )
        conn.commit()
    return get_form(form_id)


def list_submissions(*, form_id: str, limit: int = 200) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, form_id, values_json, sheets_range, submitted_at
            FROM submissions
            WHERE form_id = ?
            ORDER BY submitted_at DESC
            LIMIT ?
            """,
            (form_id, limit),
        ).fetchall()

    items: list[dict[str, Any]] = []
    for r in rows:
        try:
            values = json.loads(r["values_json"]) if r["values_json"] else {}
        except Exception:
            values = {}
        items.append(
            {
                "id": r["id"],
                "form_id": r["form_id"],
                "values": values,
                "sheets_range": r["sheets_range"],
                "submitted_at": r["submitted_at"],
            }
        )
    return items


def _resolve_oauth_key(key: str | None) -> str | None:
    if key is not None:
        return key
    raw = session_context.get_oauth_session_key_raw()
    if raw is session_context.UNSET:
        return session_context.DEFAULT_OAUTH_KEY
    if not raw:
        return None
    return str(raw)


def get_oauth_token(key: str | None = None) -> dict[str, Any] | None:
    resolved = _resolve_oauth_key(key)
    if not resolved:
        return None
    with _connect() as conn:
        row = conn.execute(
            "SELECT token_json FROM oauth_tokens WHERE key = ?",
            (resolved,),
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["token_json"])
    except Exception:
        return None


def set_oauth_token(token: dict[str, Any], key: str | None = None) -> None:
    resolved = _resolve_oauth_key(key)
    if not resolved:
        return
    now = _utc_now()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO oauth_tokens (key, token_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET token_json = excluded.token_json, updated_at = excluded.updated_at
            """,
            (resolved, json.dumps(token), now),
        )
        conn.commit()


def clear_oauth_token(key: str | None = None) -> None:
    resolved = _resolve_oauth_key(key)
    if not resolved:
        return
    with _connect() as conn:
        conn.execute("DELETE FROM oauth_tokens WHERE key = ?", (resolved,))
        conn.commit()


def save_submission(
    *,
    form_id: str,
    values: dict[str, Any],
    sheets_range: str | None = None,
) -> dict[str, Any]:
    """Persist a form submission to SQLite. Always called, regardless of Google Sheets."""
    sub_id = uuid4().hex
    now = _utc_now()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO submissions (id, form_id, values_json, sheets_range, submitted_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (sub_id, form_id, json.dumps(values), sheets_range, now),
        )
        conn.commit()
    return {"id": sub_id, "form_id": form_id, "submitted_at": now}


def delete_form(form_id: str) -> bool:
    """Delete a form and its submissions. Returns True if deleted."""
    with _connect() as conn:
        cur = conn.execute("SELECT 1 FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not cur:
            return False
        conn.execute("DELETE FROM submissions WHERE form_id = ?", (form_id,))
        conn.execute("DELETE FROM forms WHERE id = ?", (form_id,))
        conn.commit()
    return True


def unset_oauth_key(form_id: str) -> bool:
    """Remove oauth_key association for a form. Returns True if updated."""
    with _connect() as conn:
        cur = conn.execute("SELECT oauth_key FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not cur:
            return False
        conn.execute("UPDATE forms SET oauth_key = NULL WHERE id = ?", (form_id,))
        conn.commit()
    return True
