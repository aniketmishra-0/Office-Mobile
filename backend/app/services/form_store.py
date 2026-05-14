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
            for stmt in CREATE_INDEXES_SQL:
                cur.execute(stmt)


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
    oauth_key: str | None = None,
) -> dict[str, Any]:
    form_id = uuid4().hex[:12]
    edit_token = secrets.token_urlsafe(24)

    execute(
        """
        INSERT INTO forms (
            id, edit_token, oauth_key, sheet_url, spreadsheet_id, worksheet_name,
            form_title, fields_json, custom_keywords_json, autofill_columns_json
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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


def list_forms(limit: int = 100) -> list[dict[str, Any]]:
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
) -> dict[str, Any] | None:
    execute(
        """
        UPDATE forms
        SET form_title = %s,
            fields_json = %s,
            custom_keywords_json = %s,
            autofill_columns_json = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (
            form_title,
            Jsonb(_dump_models(fields)),
            Jsonb(_dump_models(custom_keywords)),
            Jsonb(autofill_columns or []),
            form_id,
        ),
    )
    return get_form(form_id)


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


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------


def get_dashboard_stats() -> dict[str, Any]:
    """Aggregate stats for the dashboard widgets page."""
    # Total forms and submissions
    totals = fetchone(
        """
        SELECT
            (SELECT COUNT(*) FROM forms) AS total_forms,
            (SELECT COUNT(*) FROM submissions) AS total_submissions
        """,
        (),
    )
    total_forms = totals["total_forms"] if totals else 0
    total_submissions = totals["total_submissions"] if totals else 0

    # Today's submissions
    today_count_row = fetchone(
        """
        SELECT COUNT(*) AS cnt
        FROM submissions
        WHERE submitted_at >= CURRENT_DATE
        """,
        (),
    )
    today_submissions = today_count_row["cnt"] if today_count_row else 0

    # Submissions per day (last 30 days)
    daily_rows = fetchall(
        """
        SELECT DATE(submitted_at) AS day, COUNT(*) AS cnt
        FROM submissions
        WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(submitted_at)
        ORDER BY day
        """,
        (),
    )
    daily = [
        {"date": str(r["day"]), "count": r["cnt"]}
        for r in daily_rows
    ]

    # Top forms by submission count
    top_forms_rows = fetchall(
        """
        SELECT f.id, f.form_title, COUNT(s.id) AS submission_count
        FROM forms f
        LEFT JOIN submissions s ON s.form_id = f.id
        GROUP BY f.id, f.form_title
        ORDER BY submission_count DESC
        LIMIT 10
        """,
        (),
    )
    top_forms = [
        {
            "id": r["id"],
            "form_title": r["form_title"],
            "submission_count": r["submission_count"],
        }
        for r in top_forms_rows
    ]

    # Recent submissions (last 10)
    recent_rows = fetchall(
        """
        SELECT s.id, s.form_id, f.form_title, s.submitted_at
        FROM submissions s
        JOIN forms f ON f.id = s.form_id
        ORDER BY s.submitted_at DESC
        LIMIT 10
        """,
        (),
    )
    recent = [
        {
            "id": r["id"],
            "form_id": r["form_id"],
            "form_title": r["form_title"],
            "submitted_at": _iso(r.get("submitted_at")),
        }
        for r in recent_rows
    ]

    return {
        "total_forms": total_forms,
        "total_submissions": total_submissions,
        "today_submissions": today_submissions,
        "daily": daily,
        "top_forms": top_forms,
        "recent_submissions": recent,
    }
