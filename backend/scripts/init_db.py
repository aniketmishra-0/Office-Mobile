"""
Initialize the Postgres schema on Neon.

Usage
-----
    source .venv/bin/activate
    # DATABASE_URL is read from backend/.env automatically.
    python backend/scripts/init_db.py

Safe to re-run (uses IF NOT EXISTS). The app also creates the schema
automatically on startup, so this script is mainly useful for provisioning
a new Neon database ahead of deploying.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_ROOT / ".env")

from app.services.form_store import init_db  # noqa: E402


def main() -> int:
    print("Creating schema on Neon...")
    init_db()
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
