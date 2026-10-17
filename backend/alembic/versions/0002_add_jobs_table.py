"""Add jobs table for background tasks

Revision ID: 0002_add_jobs_table
Revises: 0001_add_performance_indexes
Create Date: 2026-10-17 22:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0002_add_jobs_table'
down_revision: Union[str, None] = '0001_add_performance_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
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
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_jobs_user_key ON jobs(user_key)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS jobs")
