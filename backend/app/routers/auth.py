from __future__ import annotations

import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import get_settings
from app.services import form_store

router = APIRouter(prefix="/api/auth", tags=["auth"])


GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

# Cookie used to carry the OAuth state value between the redirect and the
# callback. Short-lived; HttpOnly so it cannot be read from JS.
_STATE_COOKIE_NAME = "oauth_state"
_STATE_COOKIE_MAX_AGE = 600  # 10 minutes is plenty for an OAuth round trip


def _require_oauth_config() -> tuple[str, str, str]:
    settings = get_settings()
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise HTTPException(status_code=500, detail="OAuth is not configured")
    redirect_uri = (
        settings.google_oauth_redirect_uri
        or "http://localhost:8000/api/auth/google/callback"
    )
    return (
        settings.google_oauth_client_id,
        settings.google_oauth_client_secret,
        redirect_uri,
    )


def _frontend_origin() -> str:
    """Return a single frontend origin used for postMessage targetOrigin.
    We never use '*' so that a malicious opener cannot receive this message."""
    settings = get_settings()
    if settings.allowed_origins:
        return settings.allowed_origins[0]
    return "http://localhost:3000"


@router.get("/status")
def status() -> dict:
    token = form_store.get_oauth_token()
    return {"connected": token is not None}


@router.post("/logout")
def logout() -> dict:
    form_store.clear_oauth_token()
    return {"success": True}


def _build_auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{GOOGLE_AUTH_BASE}?{urlencode(params)}"


def _set_state_cookie(response: Response, state: str) -> None:
    response.set_cookie(
        key=_STATE_COOKIE_NAME,
        value=state,
        max_age=_STATE_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/auth",
    )


@router.get("/google/start")
def google_start() -> RedirectResponse:
    client_id, _secret, redirect_uri = _require_oauth_config()
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(_build_auth_url(client_id, redirect_uri, state))
    _set_state_cookie(response, state)
    return response


@router.get("/google/url")
def google_url(response: Response) -> dict:
    """Return the OAuth URL so the frontend can open it directly in the browser."""
    client_id, _secret, redirect_uri = _require_oauth_config()
    state = secrets.token_urlsafe(32)
    _set_state_cookie(response, state)
    return {"url": _build_auth_url(client_id, redirect_uri, state)}


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code")

    # Verify state matches the cookie we issued in /google/start.
    # This blocks OAuth CSRF where an attacker tricks the victim into logging
    # in with the attacker's authorization code.
    expected_state = request.cookies.get(_STATE_COOKIE_NAME)
    if not expected_state or not state or not secrets.compare_digest(expected_state, state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

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
        # Never echo Google's response body to the client; log it server-side
        # so we can debug without leaking internals.
        import logging

        logging.getLogger(__name__).warning(
            "oauth.token_exchange_failed status=%s body=%s",
            res.status_code,
            res.text[:500],
        )
        raise HTTPException(
            status_code=400, detail="Google sign-in failed. Please try again."
        )

    token = res.json()
    token["obtained_at"] = int(time.time())
    form_store.set_oauth_token(token)

    # Close the popup and notify the opener window. We pin the targetOrigin
    # to our frontend origin rather than using '*' so a malicious opener
    # cannot intercept the message.
    frontend_origin = _frontend_origin()

    html = (
        "<!doctype html><html><body>"
        "<script>"
        "try { "
        "if (window.opener) { "
        f"window.opener.postMessage({{ type: 'oauth-success' }}, {frontend_origin!r});"
        " } "
        "} catch (e) {} "
        "window.close();"
        "</script>"
        "<p>Sign-in successful. You can close this window.</p>"
        "</body></html>"
    )

    response = HTMLResponse(html)
    # Clear the state cookie now that the flow is complete.
    response.delete_cookie(_STATE_COOKIE_NAME, path="/api/auth")
    return response
