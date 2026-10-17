"""
Tenant and workspace management persistence layer for Phase 5 Multi-tenancy.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from psycopg.types.json import Jsonb

from app.db import connection, execute, fetchall, fetchone

CREATE_TENANTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

CREATE_TENANT_MEMBERS_SQL = """
CREATE TABLE IF NOT EXISTS tenant_members (
    tenant_id   TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
)
"""

TENANT_SCHEMA_MIGRATIONS = [
    "ALTER TABLE forms ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE saved_sheets ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS tenant_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_forms_tenant_id ON forms(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)",
]


def init_tenants_tables() -> None:
    """Initialize multi-tenancy tables, columns, and indexes."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TENANTS_TABLE_SQL)
            cur.execute(CREATE_USERS_TABLE_SQL)
            cur.execute(CREATE_TENANT_MEMBERS_SQL)
            for stmt in TENANT_SCHEMA_MIGRATIONS:
                try:
                    cur.execute(stmt)
                except Exception:
                    pass


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug or "tenant"


def get_or_create_user(email: str, name: Optional[str] = None) -> dict[str, Any]:
    """Get existing user by email or create new user."""
    row = fetchone("SELECT * FROM users WHERE email = %s", (email,))
    if row:
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row.get("name"),
            "created_at": str(row["created_at"]),
        }

    user_id = uuid4().hex[:16]
    execute(
        "INSERT INTO users (id, email, name) VALUES (%s, %s, %s)",
        (user_id, email, name or email.split("@")[0]),
    )
    return {
        "id": user_id,
        "email": email,
        "name": name or email.split("@")[0],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def create_tenant(name: str, slug: Optional[str] = None, owner_email: Optional[str] = None) -> dict[str, Any]:
    """Create a new tenant workspace and assign owner."""
    tenant_id = uuid4().hex[:16]
    base_slug = _slugify(slug or name)
    unique_slug = base_slug

    # Ensure unique slug
    suffix = 1
    while fetchone("SELECT id FROM tenants WHERE slug = %s", (unique_slug,)):
        unique_slug = f"{base_slug}-{suffix}"
        suffix += 1

    execute(
        "INSERT INTO tenants (id, name, slug) VALUES (%s, %s, %s)",
        (tenant_id, name, unique_slug),
    )

    if owner_email:
        user = get_or_create_user(owner_email)
        execute(
            "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (%s, %s, 'owner') ON CONFLICT DO NOTHING",
            (tenant_id, user["id"]),
        )

    return get_tenant(tenant_id) or {}


def get_tenant(tenant_id: str) -> Optional[dict[str, Any]]:
    """Fetch tenant by ID."""
    row = fetchone("SELECT * FROM tenants WHERE id = %s", (tenant_id,))
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "updated_at": row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else str(row["updated_at"]),
    }


def get_tenant_by_slug(slug: str) -> Optional[dict[str, Any]]:
    """Fetch tenant by slug."""
    row = fetchone("SELECT * FROM tenants WHERE slug = %s", (slug,))
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "updated_at": row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else str(row["updated_at"]),
    }


def list_user_tenants(email: str) -> list[dict[str, Any]]:
    """List all tenants a user is a member of."""
    user = fetchone("SELECT id FROM users WHERE email = %s", (email,))
    if not user:
        return []

    rows = fetchall(
        """
        SELECT t.id, t.name, t.slug, tm.role, t.created_at, t.updated_at
        FROM tenants t
        JOIN tenant_members tm ON t.id = tm.tenant_id
        WHERE tm.user_id = %s
        ORDER BY t.created_at ASC
        """,
        (user["id"],),
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "slug": r["slug"],
            "role": r["role"],
            "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            "updated_at": r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"]),
        }
        for r in rows
    ]


def get_or_create_personal_tenant(email: str) -> dict[str, Any]:
    """Ensure user has a default personal tenant workspace."""
    user = get_or_create_user(email)
    existing_tenants = list_user_tenants(email)
    if existing_tenants:
        return existing_tenants[0]

    # Create personal tenant
    username = email.split("@")[0]
    tenant = create_tenant(name=f"{username}'s Workspace", slug=f"personal-{username}", owner_email=email)
    return tenant


def add_tenant_member(tenant_id: str, email: str, role: str = "member") -> dict[str, Any]:
    """Add a member to a tenant workspace."""
    user = get_or_create_user(email)
    execute(
        """
        INSERT INTO tenant_members (tenant_id, user_id, role)
        VALUES (%s, %s, %s)
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role
        """,
        (tenant_id, user["id"], role),
    )
    return {
        "tenant_id": tenant_id,
        "user_id": user["id"],
        "email": email,
        "role": role,
    }


def list_tenant_members(tenant_id: str) -> list[dict[str, Any]]:
    """List all members of a tenant."""
    rows = fetchall(
        """
        SELECT tm.tenant_id, tm.user_id, u.email, u.name, tm.role, tm.created_at
        FROM tenant_members tm
        JOIN users u ON tm.user_id = u.id
        WHERE tm.tenant_id = %s
        ORDER BY tm.created_at ASC
        """,
        (tenant_id,),
    )
    return [
        {
            "user_id": r["user_id"],
            "email": r["email"],
            "name": r.get("name"),
            "role": r["role"],
            "joined_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        }
        for r in rows
    ]


def remove_tenant_member(tenant_id: str, email: str) -> bool:
    """Remove a member from a tenant workspace."""
    user = fetchone("SELECT id FROM users WHERE email = %s", (email,))
    if not user:
        return False
    execute(
        "DELETE FROM tenant_members WHERE tenant_id = %s AND user_id = %s",
        (tenant_id, user["id"]),
    )
    return True
