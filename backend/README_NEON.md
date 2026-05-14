# Neon Postgres setup

The backend uses Neon (Postgres) as its only data store. All forms,
submissions, share links, QR code targets, and OAuth tokens live in Neon.
SQLite is no longer supported.

## 1. Create a Neon database

Sign up at [neon.tech](https://neon.tech), create a project, and copy the
connection string. Neon requires TLS, so append `?sslmode=require`:

```
postgresql://<user>:<pass>@<host>/<db>?sslmode=require
```

## 2. Configure the backend

Put the connection string in `backend/.env`:

```bash
DATABASE_URL=postgresql://<user>:<pass>@<host>/<db>?sslmode=require
```

## 3. Install dependencies

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## 4. Create the schema

The app creates tables automatically on startup. You can also run the
init script manually (useful for CI / fresh provisioning):

```bash
python backend/scripts/init_db.py
```

## 5. Migrate data from the legacy SQLite DB (one-time)

If you have existing data in `backend/data/forms.db` and/or `data/forms.db`,
copy it into Neon:

```bash
python backend/scripts/migrate_sqlite_to_neon.py
```

The script is idempotent and merges both files if they exist. After you
verify the data in Neon, you can delete the SQLite files.

## Schema

```sql
forms            -- form metadata, share link target, QR code value, field schema
submissions      -- every submitted response (FK to forms, ON DELETE CASCADE)
oauth_tokens     -- per-session Google OAuth tokens
```

## Data-clearing behavior

- Deleting a form via the API (`DELETE /api/forms/{id}`) or from the
  Settings panel removes the row from Neon. Its submissions are removed
  automatically via `ON DELETE CASCADE`.
- Unauthorize (`POST /api/forms/{id}/unauthorize`) clears the associated
  OAuth token row and the form's `oauth_key`, so a shared form stops
  writing to the original user's sheet.
- Logging out (`POST /api/auth/logout`) deletes the caller's row in
  `oauth_tokens`.
