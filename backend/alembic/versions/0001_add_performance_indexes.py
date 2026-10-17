"""Add performance indexes for form lookups, submissions, and library queries

Revision ID: 0001_add_performance_indexes
Revises: 
Create Date: 2026-10-17 21:55:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0001_add_performance_indexes'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Index for library queries: filtered by user's oauth_key, sorted by updated_at DESC
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_forms_oauth_key_updated_at "
        "ON forms(oauth_key, updated_at DESC)"
    )

    # Index for tab/form lookups by sheet and worksheet
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_forms_spreadsheet_worksheet "
        "ON forms(spreadsheet_id, worksheet_name)"
    )

    # Index for submissions sync status and counts per form
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_submissions_form_id_sync "
        "ON submissions(form_id, sync_status)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_submissions_form_id_sync")
    op.execute("DROP INDEX IF EXISTS idx_forms_spreadsheet_worksheet")
    op.execute("DROP INDEX IF EXISTS idx_forms_oauth_key_updated_at")
