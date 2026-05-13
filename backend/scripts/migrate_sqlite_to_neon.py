"""
One-time migration: copy all data from the legacy SQLite forms DB(s) to Neon.

Usage
-----
    source .venv/bin/activate
    # DATABASE_URL is read from backend/.env automatically via app.config.
    python backend/scripts/migrate_sqlite_to_neon.py

By default the script looks for SQLite files in these locations (in order):
    - backend/data/forms.db
    - data/forms.db   (relative to the project root)

You can point it at a specific file with --sqlite:
    python backend/scripts/migrate_sqlite_to_neon.py --sqlite /path/to/forms.db

Behavior
--------
* Idempotent: re-running the script will upsert rows by primary key and not
  produce duplicates.
* Merges multiple SQLite files when more than one is present. If the same
  form id exists in both, the copy with the most recent `updated_at` wins.
* Does not delete the SQLite files. Remove them yourself once you've
  verified the data in Neon.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

# Ensure `app` is importable when run from the repo root.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.db import connection, get_pool  # noqa: E402
from app.services.form_store import init_db  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402


DEFAULT_SQLITE_PATHS = [
    BACKEND_ROOT / "data" / "forms.db",
    REPO_ROOT / "data" / "forms.db",
]


def _sqlite_rows(db_path: Path, query: str) -> list[sqlite3.Row]:
    if not db_path.exists():
        return []
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        return list(conn.execute(query))
    except sqlite3.OperationalError as exc:
        # Table missing — just skip silently.
        print(f"  ! skipping {db_path.name}: {exc}")
        return []
    finally:
        conn.close()


def _parse_json(raw: Any, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _pick_latest(rows: list[sqlite3.Row]) -> dict[str, sqlite3.Row]:
    """Deduplicate by primary key, keeping the row with the newest updated_at/submitted_at."""
    latest: dict[str, sqlite3.Row] = {}
    for row in rows:
        key = row["id"] if "id" in row.keys() else row["key"]
        if key not in latest:
            latest[key] = row
            continue
        # Compare timestamps lexically; ISO-8601 strings sort correctly.
        existing = latest[key]
        ts_field = "updated_at" if "updated_at" in row.keys() else "submitted_at"
        if (row[ts_field] or "") > (existing[ts_field] or ""):
            latest[key] = row
    return latest


def _collect(paths: list[Path], query: str) -> list[sqlite3.Row]:
    all_rows: list[sqlite3.Row] = []
    for p in paths:
        rows = _sqlite_rows(p, query)
        if rows:
            print(f"  · {p}: {len(rows)} row(s)")
        all_rows.extend(rows)
    return all_rows


def migrate_forms(paths: list[Path]) -> int:
    print("Migrating forms...")
    rows = _collect(paths, "SELECT * FROM forms")
    if not rows:
        return 0
    unique = _pick_latest(rows)

    upsert_sql = """
        INSERT INTO forms (
            id, edit_token, oauth_key, sheet_url, spreadsheet_id, worksheet_name,
            form_title, fields_json, custom_keywords_json, autofill_columns_json,
            created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            edit_token = EXCLUDED.edit_token,
            oauth_key = EXCLUDED.oauth_key,
            sheet_url = EXCLUDED.sheet_url,
            spreadsheet_id = EXCLUDED.spreadsheet_id,
            worksheet_name = EXCLUDED.worksheet_name,
            form_title = EXCLUDED.form_title,
            fields_json = EXCLUDED.fields_json,
            custom_keywords_json = EXCLUDED.custom_keywords_json,
            autofill_columns_json = EXCLUDED.autofill_columns_json,
            updated_at = EXCLUDED.updated_at
        WHERE forms.updated_at <= EXCLUDED.updated_at
    """

    count = 0
    with connection() as conn:
        with conn.cursor() as cur:
            for row in unique.values():
                # Old schemas may lack oauth_key / autofill_columns_json — default to None/[].
                oauth_key = None
                try:
                    oauth_key = row["oauth_key"]
                except (IndexError, KeyError):
                    pass

                autofill = "[]"
                try:
                    autofill = row["autofill_columns_json"] or "[]"
                except (IndexError, KeyError):
                    pass

                cur.execute(
                    upsert_sql,
                    (
                        row["id"],
                        row["edit_token"],
                        oauth_key,
                        row["sheet_url"],
                        row["spreadsheet_id"],
                        row["worksheet_name"],
                        row["form_title"],
                        Jsonb(_parse_json(row["fields_json"], [])),
                        Jsonb(_parse_json(row["custom_keywords_json"], [])),
                        Jsonb(_parse_json(autofill, [])),
                        row["created_at"],
                        row["updated_at"],
                    ),
                )
                count += 1
    return count


def migrate_submissions(paths: list[Path]) -> int:
    print("Migrating submissions...")
    rows = _collect(paths, "SELECT * FROM submissions")
    if not rows:
        return 0

    # Build set of known form ids already in Postgres, so we don't violate the
    # foreign key.
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM forms")
            form_ids = {r["id"] for r in cur.fetchall()}

    upsert_sql = """
        INSERT INTO submissions (id, form_id, values_json, sheets_range, submitted_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """

    count = 0
    skipped = 0
    with connection() as conn:
        with conn.cursor() as cur:
            for row in rows:
                if row["form_id"] not in form_ids:
                    skipped += 1
                    continue
                cur.execute(
                    upsert_sql,
                    (
                        row["id"],
                        row["form_id"],
                        Jsonb(_parse_json(row["values_json"], {})),
                        row["sheets_range"],
                        row["submitted_at"],
                    ),
                )
                count += 1
    if skipped:
        print(f"  ! skipped {skipped} submission(s) with no matching form")
    return count


def migrate_oauth_tokens(paths: list[Path]) -> int:
    print("Migrating oauth tokens...")
    rows = _collect(paths, "SELECT * FROM oauth_tokens")
    if not rows:
        return 0
    unique = _pick_latest(rows)

    upsert_sql = """
        INSERT INTO oauth_tokens (key, token_json, updated_at)
        VALUES (%s, %s, %s)
        ON CONFLICT (key) DO UPDATE SET
            token_json = EXCLUDED.token_json,
            updated_at = EXCLUDED.updated_at
        WHERE oauth_tokens.updated_at <= EXCLUDED.updated_at
    """

    count = 0
    with connection() as conn:
        with conn.cursor() as cur:
            for row in unique.values():
                cur.execute(
                    upsert_sql,
                    (
                        row["key"],
                        Jsonb(_parse_json(row["token_json"], {})),
                        row["updated_at"],
                    ),
                )
                count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sqlite",
        action="append",
        default=None,
        help="Explicit path to a SQLite DB (can be passed multiple times). "
        "Default: backend/data/forms.db and data/forms.db.",
    )
    args = parser.parse_args()

    paths = [Path(p).resolve() for p in (args.sqlite or DEFAULT_SQLITE_PATHS)]
    existing = [p for p in paths if p.exists()]
    if not existing:
        print("No SQLite DBs found at:")
        for p in paths:
            print(f"  - {p}")
        return 1

    print("SQLite sources:")
    for p in existing:
        print(f"  - {p}")

    # Ensure pool opens & schema exists.
    get_pool()
    init_db()

    forms_count = migrate_forms(existing)
    subs_count = migrate_submissions(existing)
    tokens_count = migrate_oauth_tokens(existing)

    print("\nMigration complete:")
    print(f"  forms:         {forms_count}")
    print(f"  submissions:   {subs_count}")
    print(f"  oauth tokens:  {tokens_count}")
    return 0


if __name__ == "__main__":
    # Load backend/.env so DATABASE_URL is available without a separate export.
    from dotenv import load_dotenv

    load_dotenv(BACKEND_ROOT / ".env")
    raise SystemExit(main())
