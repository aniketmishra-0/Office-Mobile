# Multi-Tenancy Architecture & Design Document

**Status:** Proposed / Discussion Draft  
**Target:** Office Mobile Backend  
**Authors:** DeepMind Antigravity Team  
**Date:** October 2026  

---

## 1. Executive Summary

Office Mobile currently operates on an individual user model: an OAuth session key (`oauth_key`, typically the user's Google sub or email) partitions form configurations, bookmarked sheets, and user preferences. Google Sheets remains the exclusive source of truth for spreadsheet rows, and PostgreSQL only stores form definitions and metadata.

This document outlines the architectural blueprint for transitioning Office Mobile to a **multi-tenant architecture**. Multi-tenancy enables teams, educational institutions, and businesses to share forms, collaborate on sheet-connected workflows, manage member permissions, and share Google Drive integrations while strictly isolating data across tenant boundaries.

> [!IMPORTANT]
> **Core Invariant Preserved:** Even under multi-tenancy, Google Sheets remains the sole source of truth for spreadsheet row data. The backend **never** stores sheet row data in PostgreSQL.

---

## 2. Tenant & Data Model

### 2.1 Entity Hierarchy

```
┌────────────────────────────────────────────────────────┐
│                      Tenant (Org)                      │
│   (id, name, slug, domain, plan, billing_status)       │
└────────────────────────────────────────────────────────┘
         │                                      │
         ▼ 1:N                                  ▼ 1:N
┌─────────────────────────┐            ┌─────────────────────────┐
│     Tenant Members      │            │   Tenant Google Drives  │
│ (user_id, role, status) │            │ (service account/oauth) │
└─────────────────────────┘            └─────────────────────────┘
         │                                      │
         ▼                                      ▼
┌────────────────────────────────────────────────────────┐
│                     Tenant Scoped                      │
│     • Forms (form definitions & UI layout)             │
│     • Submissions (temporary queue metadata)           │
│     • Saved Sheets (team bookmarks)                    │
│     • Jobs (bulk operations / background workers)      │
│     • Preferences (theme, defaults, shortcuts)         │
└────────────────────────────────────────────────────────┘
```

### 2.2 Proposed Schema

```sql
-- 1. Tenants (Organizations / Workspaces)
CREATE TABLE tenants (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    domain          TEXT,                       -- optional corporate domain (e.g. acme.com)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Users (Global identity)
CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    google_sub      TEXT UNIQUE,
    name            TEXT,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tenant Memberships (Role-Based Access Control)
CREATE TABLE tenant_members (
    tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);
```

### 2.3 Roles and Permissions

| Role | Form Create / Edit | Form Submit | View Sheet History | Invite Members | Manage Google Auth |
|------|--------------------|-------------|--------------------|----------------|--------------------|
| **Owner** | Yes | Yes | Yes | Yes | Yes |
| **Admin** | Yes | Yes | Yes | Yes | Yes |
| **Editor** | Yes | Yes | Yes | No | No |
| **Viewer** | No | Yes (public) | Yes (read-only) | No | No |

---

## 3. Data Isolation in PostgreSQL

To guarantee complete tenant isolation, we employ a **defense-in-depth strategy** combining PostgreSQL Row-Level Security (RLS) with application-level session context enforcement.

### 3.1 Tenant ID Column

Every tenancy-scoped table receives a mandatory `tenant_id` column:
- `forms.tenant_id`
- `submissions.tenant_id`
- `saved_sheets.tenant_id`
- `preferences.tenant_id`
- `jobs.tenant_id`

### 3.2 Dual-Layer Isolation Strategy

#### Layer 1: PostgreSQL Row-Level Security (RLS)
PostgreSQL natively enforces data boundaries at the database engine level via `current_setting('app.current_tenant_id', true)`:

```sql
-- Enable RLS on forms table
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (Neon role)
ALTER TABLE forms FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy: only rows matching app.current_tenant_id can be selected, updated, or deleted
CREATE POLICY tenant_isolation_policy ON forms
    AS PERMISSIVE
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
```

When a database connection is borrowed from the pool, the middleware sets the tenant context for the transaction:
```python
@contextmanager
def tenant_connection(tenant_id: str):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL app.current_tenant_id = %s;", (tenant_id,))
        yield conn
```

#### Layer 2: Application-Level Explicit Scoping
All SQL queries in `form_store.py`, `job_store.py`, and `saved_sheets.py` explicitly include `WHERE tenant_id = %s`. Even if RLS were bypassed during testing or maintenance, application code never executes unscoped queries.

---

## 4. Google OAuth & Sheets Scopes Mapping

Multi-tenancy introduces two primary models for accessing Google Sheets:

### Model A: Shared Workspace Service Account (Recommended for Teams)
- The tenant admin connects a Google Cloud Service Account or Google Workspace Domain-Wide Delegation.
- Sheets shared with the team folder are automatically accessible to all tenant members with appropriate roles.
- Eliminates the need for every form builder to re-authorize individual OAuth scopes.

### Model B: Delegated User OAuth (Current Extended)
- Individual users maintain their OAuth tokens in `oauth_tokens(user_id, token_data)`.
- When accessing a sheet, the backend uses the active member's OAuth token.
- If a form is marked `shared_with_team`, the creator's encrypted refresh token or an org-level service account handles automated background sync and form submissions.

### OAuth Scopes
- `https://www.googleapis.com/auth/spreadsheets` (Read/write spreadsheets)
- `https://www.googleapis.com/auth/drive.file` (Access files created or opened by the app)
- `openid`, `email`, `profile` (Identity verification)

---

## 5. Migration Plan for Existing Users & Forms

To transition zero-downtime from the current single-user database to multi-tenancy:

### Phase 1: Schema Preparation (Non-Breaking)
1. Deploy migration creating `tenants`, `users`, and `tenant_members` tables.
2. Add nullable `tenant_id` columns to `forms`, `submissions`, `saved_sheets`, `preferences`, and `jobs`.
3. Add index `CREATE INDEX idx_forms_tenant_id ON forms(tenant_id)`.

### Phase 2: Data Backfill & Default Personal Workspaces
1. Run a backfill script:
   - For every distinct `oauth_key` in `forms` or `saved_sheets`:
     - Create a record in `users` (`id = md5(oauth_key)`, `email = oauth_key`).
     - Create a default personal tenant in `tenants` (`id = 't_' || md5(oauth_key)`, `name = 'Personal Workspace'`).
     - Insert membership in `tenant_members` with `role = 'owner'`.
     - Update all existing records setting `tenant_id = 't_' || md5(oauth_key)`.

### Phase 3: Constraint Enforcement
1. Alter `tenant_id` columns to `NOT NULL`.
2. Add foreign key constraints referencing `tenants(id) ON DELETE CASCADE`.
3. Enable PostgreSQL RLS policies.

### Phase 4: API & Frontend Updates
1. Add workspace selector to Next.js header.
2. Pass active workspace via `X-Tenant-ID` header or JWT session claim.
3. Expose tenant management endpoints (`/api/tenants`, `/api/tenants/{id}/members`).

---

## 6. Decision & Discussion Points

Before proceeding with any implementation:
1. **Workspace Model:** Should users have a personal workspace by default and optionally create/join team workspaces, or should every workspace be an organization?
2. **Google OAuth Ownership:** Should Google Sheets access credentials belong to the tenant organization (recommended for team continuity) or to the individual user who created the form?
3. **Public Form Submission:** Public form submissions (`/f/{id}`) do not require login. They will continue to run with tenant-level rate limiting and write through using the form's designated credential.
