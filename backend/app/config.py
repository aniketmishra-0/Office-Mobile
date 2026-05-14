from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel

# Always load from backend/.env regardless of where uvicorn is invoked from
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_FILE)


class Settings(BaseModel):
    allowed_origins: List[str]
    google_service_account_json: str | None = None
    google_service_account_file: str | None = None
    google_service_account_email: str | None = None

    # OAuth (end-user Google login) — optional alternative to service account
    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    google_oauth_redirect_uri: str | None = None

    # Postgres (Neon). Required — the app stores forms, submissions and OAuth
    # tokens in Postgres. Set via the DATABASE_URL env var.
    database_url: str | None = None


def _split_origins(raw: str | None) -> List[str]:
    if not raw:
        return ["http://localhost:5173"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings(
        allowed_origins=_split_origins(os.getenv("ALLOWED_ORIGINS")),
        google_service_account_json=os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or None,
        google_service_account_file=os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE") or None,
        google_service_account_email=os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL") or None,
        google_oauth_client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID") or None,
        google_oauth_client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or None,
        google_oauth_redirect_uri=os.getenv("GOOGLE_OAUTH_REDIRECT_URI") or None,
        database_url=os.getenv("DATABASE_URL") or None,
    )
