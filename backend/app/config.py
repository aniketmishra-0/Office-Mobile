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

    # Rate limiting — all values use `limits` syntax, e.g. "15/minute".
    rate_limit_auth: str = "15/minute"
    rate_limit_submit: str = "30/minute"
    rate_limit_batch: str = "10/minute"
    rate_limit_default: str = "120/minute"

    # Debug mode — enables diagnostic endpoints like /api/debug/form/{id}.
    debug_mode: bool = False

    # Redis cache layer — optional. If unset, caching falls back to no-op.
    redis_url: str | None = None
    cache_ttl_sheets: int = 60


DEFAULT_ALLOWED_ORIGINS: List[str] = [
    "https://officemobile.org",
    "https://www.officemobile.org",
    "https://officemobile.vercel.app",
    "https://34.24.168.162.nip.io",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
]


def _split_origins(raw: str | None) -> List[str]:
    origins = [o.rstrip("/") for o in DEFAULT_ALLOWED_ORIGINS]
    if raw:
        for origin in raw.split(","):
            cleaned = origin.strip().rstrip("/")
            if cleaned and cleaned not in origins:
                origins.append(cleaned)
    return origins


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
        rate_limit_auth=os.getenv("RATE_LIMIT_AUTH", "15/minute"),
        rate_limit_submit=os.getenv("RATE_LIMIT_SUBMIT", "30/minute"),
        rate_limit_batch=os.getenv("RATE_LIMIT_BATCH", "10/minute"),
        rate_limit_default=os.getenv("RATE_LIMIT_DEFAULT", "120/minute"),
        debug_mode=os.getenv("DEBUG_MODE", "false").lower() in ("true", "1", "yes"),
        redis_url=os.getenv("REDIS_URL") or None,
        cache_ttl_sheets=int(os.getenv("CACHE_TTL_SHEETS", "60")),
    )

