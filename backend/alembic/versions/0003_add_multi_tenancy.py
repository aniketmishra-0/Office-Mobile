"""Add multi-tenancy tables and tenant_id columns

Revision ID: 0003_add_multi_tenancy
Revises: 0002_add_jobs_table
Create Date: 2026-10-17 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0003_add_multi_tenancy'
down_revision: Union[str, None] = '0002_add_jobs_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            slug        TEXT UNIQUE NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id          TEXT PRIMARY KEY,
            email       TEXT UNIQUE NOT NULL,
            name        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tenant_members (
            tenant_id   TEXT NOT NULL,
            user_id     TEXT NOT NULL,
            role        TEXT NOT NULL DEFAULT 'member',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (tenant_id, user_id)
        )
        """
    )
    op.execute("ALTER TABLE forms ADD COLUMN IF NOT EXISTS tenant_id TEXT")
    op.execute("ALTER TABLE saved_sheets ADD COLUMN IF NOT EXISTS tenant_id TEXT")
    op.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT")
    op.execute("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS tenant_id TEXT")
    op.execute("CREATE INDEX IF NOT EXISTS idx_forms_tenant_id ON forms(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant_members")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS tenants")
