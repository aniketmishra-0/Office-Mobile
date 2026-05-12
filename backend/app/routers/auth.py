from __future__ import annotations

import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.services import form_store

router = APIRouter(prefix="/auth", tags=["auth"])


GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


def _require_oauth_config() -> tuple[str, str, str]:
    settings = get_settings()
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(status_code=500, detail="OAuth is not configured")
    redirect_uri = (
        settings.google_oauth_redirect_uri
        or "http://localhost:8000/auth/google/callback"
    )
    return (
        settings.google_oauth_client_id,
        settings.google_oauth_client_secret,
        redirect_uri,
    )


@router.get("/status")
def status() -> dict:
    token = form_store.get_oauth_token()
    return {"connected": token is not None}


@router.post("/logout")
def logout() -> dict:
    form_store.clear_oauth_token()
    return {"success": True}


@router.get("/google/start")
def google_start() -> RedirectResponse:
    client_id, _secret, redirect_uri = _require_oauth_config()

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_BASE}?{urlencode(params)}")


@router.get("/google/url")
def google_url() -> dict:
    """Return the OAuth URL so the frontend can open it directly in the browser."""
    client_id, _secret, redirect_uri = _require_oauth_config()

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return {"url": f"{GOOGLE_AUTH_BASE}?{urlencode(params)}"}


@router.get("/google/callback")
def google_callback(code: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code")

    client_id, client_secret, redirect_uri = _require_oauth_config()

    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    with httpx.Client(timeout=20) as client:
        res = client.post(GOOGLE_TOKEN_URL, data=data)

    if res.status_code >= 400:
        raise HTTPException(
            status_code=400, detail=f"Token exchange failed: {res.text}"
        )

    token = res.json()
    token["obtained_at"] = int(time.time())
    form_store.set_oauth_token(token)

    # Close the popup and notify the opener window
    from fastapi.responses import HTMLResponse

    return HTMLResponse(
        """
        <html><body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: "oauth-success" }, "*");
          }
          window.close();
        </script>
        <p>Sign-in successful. You can close this window.</p>
        </body></html>
        """
    )
