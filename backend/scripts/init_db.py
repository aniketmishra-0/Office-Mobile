"""
Run this script to initialize the Postgres schema (forms, users).
Usage:
  source .venv/bin/activate
  export DATABASE_URL="postgres://..."
  python backend/scripts/init_db.py

Designed for Neon/Postgres. Safe to re-run (uses IF NOT EXISTS).
"""
import asyncio
import os
from app import db


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  form_title TEXT NOT NULL,
  sheet_url TEXT,
  spreadsheet_id TEXT,
  worksheet_name TEXT,
  fields JSONB,
  autofill_columns JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
"""


async def main():
    if not os.environ.get("DATABASE_URL"):
        print("Please set DATABASE_URL in the environment before running this script.")
        return

    await db.init_pool()
    try:
        print("Creating schema...")
        await db.execute(SCHEMA_SQL)
        print("Done.")
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
