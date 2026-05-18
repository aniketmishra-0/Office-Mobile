"""
Form metadata, submissions, and OAuth token persistence — backed by Neon Postgres.

Public API is identical to the previous SQLite implementation so routers
and tests do not need to change. Timestamps are kept as ISO-8601 strings in
the returned records to match the old contract.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from psycopg.types.json import Jsonb

from app.db import connection, execute, fetchall, fetchone
from app.models.field import CustomKeywordRule, FieldSchema
from app.services import session_context


# ---------------------------------------------------------------------------
# Schema — idempotent; run at app startup.
# ---------------------------------------------------------------------------

CREATE_FORMS_SQL = """
CREATE TABLE IF NOT EXISTS forms (
    id              TEXT PRIMARY KEY,
    edit_token      TEXT NOT NULL,
    oauth_key       TEXT,
    sheet_url       TEXT NOT NULL,
    spreadsheet_id  TEXT NOT NULL,
    worksheet_name  TEXT,
    form_title      TEXT NOT NULL,
    fields_json     JSONB NOT NULL,
    custom_keywords_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
    autofill_columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ui_config_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_SUBMISSIONS_SQL = """
CREATE TABLE IF NOT EXISTS submissions (
    id            TEXT PRIMARY KEY,
    form_id       TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    values_json   JSONB NOT NULL,
    sheets_range  TEXT,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_OAUTH_TOKENS_SQL = """
CREATE TABLE IF NOT EXISTS oauth_tokens (
    key         TEXT PRIMARY KEY,
    token_json  JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_USER_PREFERENCES_SQL = """
CREATE TABLE IF NOT EXISTS user_preferences (
    session_key     TEXT PRIMARY KEY,
    prefs_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_forms_spreadsheet_id ON forms(spreadsheet_id)",
    "CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON forms(updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_submissions_form_id_time "
    "ON submissions(form_id, submitted_at DESC)",
]


def init_db() -> None:
    """Create tables and indexes if they don't exist. Safe to call repeatedly."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_FORMS_SQL)
            cur.execute(CREATE_SUBMISSIONS_SQL)
            cur.execute(CREATE_OAUTH_TOKENS_SQL)
            cur.execute(CREATE_USER_PREFERENCES_SQL)
            for stmt in CREATE_INDEXES_SQL:
                cur.execute(stmt)
            # Safe migration
            cur.execute("ALTER TABLE forms ADD COLUMN IF NOT EXISTS ui_config_json JSONB DEFAULT '{}'::jsonb")
            cur.execute("ALTER TABLE forms ADD COLUMN IF NOT EXISTS autofill_columns_json JSONB DEFAULT '[]'::jsonb")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(ts: Any) -> str:
    """Return ISO-8601 string from a datetime, or the value itself if already a string."""
    if ts is None:
        return ""
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.isoformat()
    return str(ts)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dump_models(items: list[FieldSchema] | list[CustomKeywordRule]) -> list[dict[str, Any]]:
    return [item.model_dump() for item in items]


def _load_fields(raw: Any) -> list[FieldSchema]:
    data = _coerce_json(raw) or []
    return [FieldSchema(**item) for item in data]


def _load_keywords(raw: Any) -> list[CustomKeywordRule]:
    data = _coerce_json(raw) or []
    return [CustomKeywordRule(**item) for item in data]


def _coerce_json(raw: Any) -> Any:
    """psycopg returns JSONB as already-parsed Python objects, but we tolerate strings too."""
    if raw is None:
        return None
    if isinstance(raw, (list, dict)):
        return raw
    if isinstance(raw, str):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw


def _row_to_record(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "edit_token": row["edit_token"],
        "oauth_key": row.get("oauth_key"),
        "sheet_url": row["sheet_url"],
        "spreadsheet_id": row["spreadsheet_id"],
        "worksheet_name": row.get("worksheet_name"),
        "form_title": row["form_title"],
        "fields": _load_fields(row.get("fields_json")),
        "custom_keywords": _load_keywords(row.get("custom_keywords_json")),
        "autofill_columns": _coerce_json(row.get("autofill_columns_json")) or [],
        "ui_config": _coerce_json(row.get("ui_config_json")),
        "submission_count": row.get("submission_count"),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


# ---------------------------------------------------------------------------
# Forms
# ---------------------------------------------------------------------------


def create_form(
    *,
    sheet_url: str,
    spreadsheet_id: str,
    worksheet_name: str | None,
    form_title: str,
    fields: list[FieldSchema],
    custom_keywords: list[CustomKeywordRule],
    autofill_columns: list[str] | None = None,
    ui_config: dict | None = None,
    oauth_key: str | None = None,
) -> dict[str, Any]:
    form_id = uuid4().hex[:12]
    edit_token = secrets.token_urlsafe(24)

    execute(
        """
        INSERT INTO forms (
            id, edit_token, oauth_key, sheet_url, spreadsheet_id, worksheet_name,
            form_title, fields_json, custom_keywords_json, autofill_columns_json, ui_config_json
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            form_id,
            edit_token,
            oauth_key,
            sheet_url,
            spreadsheet_id,
            worksheet_name,
            form_title,
            Jsonb(_dump_models(fields)),
            Jsonb(_dump_models(custom_keywords)),
            Jsonb(autofill_columns or []),
            Jsonb(ui_config or {}),
        ),
    )

    return get_form(form_id) or {}


def get_form(form_id: str) -> dict[str, Any] | None:
    row = fetchone("SELECT * FROM forms WHERE id = %s", (form_id,))
    return _row_to_record(row)


def find_forms_by_spreadsheet(spreadsheet_id: str) -> list[dict[str, Any]]:
    rows = fetchall(
        "SELECT * FROM forms WHERE spreadsheet_id = %s ORDER BY updated_at DESC",
        (spreadsheet_id,),
    )
    return [r for r in (_row_to_record(row) for row in rows) if r]


def list_forms(limit: int = 100, oauth_key: str | None = None) -> list[dict[str, Any]]:
    if oauth_key:
        rows = fetchall(
            """
            SELECT f.*, COUNT(s.id) AS submission_count
            FROM forms f
            LEFT JOIN submissions s ON s.form_id = f.id
            WHERE f.oauth_key = %s
            GROUP BY f.id
            ORDER BY f.updated_at DESC
            LIMIT %s
            """,
            (oauth_key, limit),
        )
    else:
        rows = fetchall(
            """
            SELECT f.*, COUNT(s.id) AS submission_count
            FROM forms f
            LEFT JOIN submissions s ON s.form_id = f.id
            GROUP BY f.id
            ORDER BY f.updated_at DESC
            LIMIT %s
            """,
            (limit,),
        )
    return [r for r in (_row_to_record(row) for row in rows) if r]


def update_form(
    *,
    form_id: str,
    form_title: str,
    fields: list[FieldSchema],
    custom_keywords: list[CustomKeywordRule],
    autofill_columns: list[str] | None = None,
    ui_config: dict | None = None,
) -> dict[str, Any] | None:
    execute(
        """
        UPDATE forms
        SET form_title = %s,
            fields_json = %s,
            custom_keywords_json = %s,
            autofill_columns_json = %s,
            ui_config_json = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (
            form_title,
            Jsonb(_dump_models(fields)),
            Jsonb(_dump_models(custom_keywords)),
            Jsonb(autofill_columns or []),
            Jsonb(ui_config or {}),
            form_id,
        ),
    )
    return get_form(form_id)


def update_form_fields(form_id: str, fields: list[FieldSchema]) -> None:
    """Lightweight update of just the fields_json column (e.g. after type promotion)."""
    execute(
        "UPDATE forms SET fields_json = %s, updated_at = now() WHERE id = %s",
        (Jsonb(_dump_models(fields)), form_id),
    )


def delete_form(form_id: str) -> bool:
    """
    Delete a form and all of its submissions.
    `ON DELETE CASCADE` on the submissions table handles the child rows.
    Returns True if a row was removed.
    """
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM forms WHERE id = %s", (form_id,))
            return cur.rowcount > 0


def delete_all_forms(oauth_key: str | None = None) -> int:
    """
    Delete all forms belonging to the given oauth_key (user).
    If oauth_key is None, no rows are deleted (safety guard).
    Returns the number of forms deleted.
    """
    if not oauth_key:
        return 0
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM forms WHERE oauth_key = %s", (oauth_key,))
            return cur.rowcount


def unset_oauth_key(form_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE forms SET oauth_key = NULL WHERE id = %s",
                (form_id,),
            )
            return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


def save_submission(
    *,
    form_id: str,
    values: dict[str, Any],
    sheets_range: str | None = None,
) -> dict[str, Any]:
    sub_id = uuid4().hex
    now = _utc_now_iso()
    execute(
        """
        INSERT INTO submissions (id, form_id, values_json, sheets_range)
        VALUES (%s, %s, %s, %s)
        """,
        (sub_id, form_id, Jsonb(values), sheets_range),
    )
    return {"id": sub_id, "form_id": form_id, "submitted_at": now}


def list_submissions(*, form_id: str, limit: int = 200) -> list[dict[str, Any]]:
    rows = fetchall(
        """
        SELECT id, form_id, values_json, sheets_range, submitted_at
        FROM submissions
        WHERE form_id = %s
        ORDER BY submitted_at DESC
        LIMIT %s
        """,
        (form_id, limit),
    )
    items: list[dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "id": r["id"],
                "form_id": r["form_id"],
                "values": _coerce_json(r.get("values_json")) or {},
                "sheets_range": r.get("sheets_range"),
                "submitted_at": _iso(r.get("submitted_at")),
            }
        )
    return items


# ---------------------------------------------------------------------------
# OAuth tokens
# ---------------------------------------------------------------------------


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
    row = fetchone(
        "SELECT token_json FROM oauth_tokens WHERE key = %s",
        (resolved,),
    )
    if not row:
        return None
    data = _coerce_json(row.get("token_json"))
    return data if isinstance(data, dict) else None


def set_oauth_token(token: dict[str, Any], key: str | None = None) -> None:
    resolved = _resolve_oauth_key(key)
    if not resolved:
        return
    execute(
        """
        INSERT INTO oauth_tokens (key, token_json, updated_at)
        VALUES (%s, %s, now())
        ON CONFLICT (key) DO UPDATE
          SET token_json = EXCLUDED.token_json,
              updated_at = EXCLUDED.updated_at
        """,
        (resolved, Jsonb(token)),
    )


def clear_oauth_token(key: str | None = None) -> None:
    resolved = _resolve_oauth_key(key)
    if not resolved:
        return
    execute("DELETE FROM oauth_tokens WHERE key = %s", (resolved,))


def migrate_session_key(old_key: str, new_key: str) -> None:
    """Migrate forms, saved sheets, preferences, and oauth tokens from an old
    random session key to the new stable (email-derived) key. This ensures
    data created before the stable-key logic was deployed is not lost."""
    if not old_key or not new_key or old_key == new_key:
        return
    # Migrate forms
    execute(
        "UPDATE forms SET oauth_key = %s WHERE oauth_key = %s",
        (new_key, old_key),
    )
    # Migrate saved sheets
    execute(
        "UPDATE saved_sheets SET session_key = %s WHERE session_key = %s",
        (new_key, old_key),
    )
    # Migrate user preferences
    execute(
        "UPDATE user_preferences SET session_key = %s WHERE session_key = %s AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE session_key = %s)",
        (new_key, old_key, new_key),
    )
    # Migrate oauth token (copy to new key if new key doesn't already have one)
    existing = fetchone("SELECT key FROM oauth_tokens WHERE key = %s", (new_key,))
    if not existing:
        execute(
            "UPDATE oauth_tokens SET key = %s WHERE key = %s",
            (new_key, old_key),
        )


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# User Preferences
# ---------------------------------------------------------------------------


def get_user_preferences(session_key: str) -> dict[str, Any]:
    """Return the user's saved preferences, or an empty dict if none exist."""
    row = fetchone(
        "SELECT prefs_json FROM user_preferences WHERE session_key = %s",
        (session_key,),
    )
    if not row:
        return {}
    data = _coerce_json(row.get("prefs_json"))
    return data if isinstance(data, dict) else {}


def set_user_preferences(session_key: str, prefs: dict[str, Any]) -> dict[str, Any]:
    """Upsert the user's preferences. Returns the saved prefs dict."""
    execute(
        """
        INSERT INTO user_preferences (session_key, prefs_json, updated_at)
        VALUES (%s, %s, now())
        ON CONFLICT (session_key) DO UPDATE
          SET prefs_json = EXCLUDED.prefs_json,
              updated_at = EXCLUDED.updated_at
        """,
        (session_key, Jsonb(prefs)),
    )
    return prefs



