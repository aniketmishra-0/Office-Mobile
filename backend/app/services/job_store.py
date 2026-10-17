"""
Job persistence layer for background tasks, backed by Neon PostgreSQL.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from psycopg.types.json import Jsonb

from app.db import connection, execute, fetchone

CREATE_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,
    user_key        TEXT,
    job_type        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    progress_pct    INT NOT NULL DEFAULT 0,
    processed_count INT NOT NULL DEFAULT 0,
    total_count     INT NOT NULL DEFAULT 0,
    sheet_id        TEXT,
    params_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_JOBS_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_jobs_user_key ON jobs(user_key)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)",
]


def init_jobs_table() -> None:
    """Create jobs table and indexes if not exists."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_JOBS_SQL)
            for stmt in CREATE_JOBS_INDEXES:
                cur.execute(stmt)


def create_job(
    job_type: str,
    user_key: Optional[str] = None,
    sheet_id: Optional[str] = None,
    total_count: int = 0,
    params: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Create a new background job record with 'queued' status."""
    job_id = uuid4().hex[:16]
    execute(
        """
        INSERT INTO jobs (
            id, user_key, job_type, status, progress_pct,
            processed_count, total_count, sheet_id, params_json, result_json
        ) VALUES (%s, %s, %s, 'queued', 0, 0, %s, %s, %s, '{}'::jsonb)
        """,
        (
            job_id,
            user_key,
            job_type,
            total_count,
            sheet_id,
            Jsonb(params or {}),
        ),
    )
    return get_job(job_id) or {}


def _coerce_json(val: Any) -> Any:
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return {}


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    """Fetch job by ID."""
    row = fetchone("SELECT * FROM jobs WHERE id = %s", (job_id,))
    if row is None:
        return None
    return {
        "id": row["id"],
        "user_key": row.get("user_key"),
        "job_type": row["job_type"],
        "status": row["status"],
        "progress_pct": row["progress_pct"],
        "processed_count": row["processed_count"],
        "total_count": row["total_count"],
        "sheet_id": row.get("sheet_id"),
        "params": _coerce_json(row.get("params_json")),
        "result": _coerce_json(row.get("result_json")),
        "error": row.get("error"),
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "updated_at": row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else str(row["updated_at"]),
    }


def update_job_progress(
    job_id: str,
    processed_count: int,
    total_count: int,
    status: str = "running",
) -> None:
    """Update progress percentage and processed count after a chunk write."""
    pct = int((processed_count / total_count * 100)) if total_count > 0 else 0
    pct = min(max(pct, 0), 100)
    execute(
        """
        UPDATE jobs
        SET status = %s,
            processed_count = %s,
            total_count = %s,
            progress_pct = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (status, processed_count, total_count, pct, job_id),
    )


def complete_job(
    job_id: str,
    result: dict[str, Any],
    processed_count: Optional[int] = None,
) -> None:
    """Mark job as successfully completed."""
    if processed_count is not None:
        execute(
            """
            UPDATE jobs
            SET status = 'completed',
                progress_pct = 100,
                processed_count = %s,
                result_json = %s,
                updated_at = now()
            WHERE id = %s
            """,
            (processed_count, Jsonb(result), job_id),
        )
    else:
        execute(
            """
            UPDATE jobs
            SET status = 'completed',
                progress_pct = 100,
                result_json = %s,
                updated_at = now()
            WHERE id = %s
            """,
            (Jsonb(result), job_id),
        )


def fail_job(job_id: str, error: str) -> None:
    """Mark job as failed with error details."""
    execute(
        """
        UPDATE jobs
        SET status = 'failed',
            error = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (error[:1000], job_id),
    )
