from __future__ import annotations

import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import get_settings
from app.services import form_store
from app.services.session_context import OAUTH_SESSION_COOKIE, OAUTH_SESSION_MAX_AGE
import base64
import json

router = APIRouter(prefix="/api/auth", tags=["auth"])


GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
# `openid`, `email`, and `profile` are required so Google returns an
# id_token with the user's email/name/picture claims used for the UI.
SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

# Cookie used to carry the OAuth state value between the redirect and the
# callback. Short-lived; HttpOnly so it cannot be read from JS.
_STATE_COOKIE_NAME = "oauth_state"
_STATE_COOKIE_MAX_AGE = 600  # 10 minutes is plenty for an OAuth round trip


def _is_local_request(request: Request) -> bool:
    origin = (request.headers.get("origin") or "").lower()
    host = (request.url.hostname or "").lower()
    if origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1"):
        return True
    return host in ("localhost", "127.0.0.1")


def _session_cookie_attrs(request: Request) -> dict[str, object]:
    if _is_local_request(request):
        return {"secure": False, "samesite": "lax"}
    return {"secure": True, "samesite": "none"}


def _set_session_cookie(response: Response, request: Request, session_key: str) -> None:
    attrs = _session_cookie_attrs(request)
    response.set_cookie(
        key=OAUTH_SESSION_COOKIE,
        value=session_key,
        max_age=OAUTH_SESSION_MAX_AGE,
        httponly=True,
        secure=bool(attrs["secure"]),
        samesite=str(attrs["samesite"]),
        path="/",
    )


def _clear_session_cookie(response: Response, request: Request) -> None:
    attrs = _session_cookie_attrs(request)
    response.delete_cookie(
        OAUTH_SESSION_COOKIE,
        path="/",
        secure=bool(attrs["secure"]),
        samesite=str(attrs["samesite"]),
    )


def _ensure_session_key(request: Request, response: Response) -> str:
    session_key = request.cookies.get(OAUTH_SESSION_COOKIE) or request.headers.get(
        "x-session-key"
    )
    if not session_key:
        session_key = secrets.token_urlsafe(32)
    if request.cookies.get(OAUTH_SESSION_COOKIE) != session_key:
        _set_session_cookie(response, request, session_key)
    return session_key


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
def status(request: Request, response: Response) -> dict:
    session_key = _ensure_session_key(request, response)
    token = form_store.get_oauth_token(session_key)
    user: dict | None = None
    if token and isinstance(token, dict):
        idt = token.get("id_token") or token.get("idToken")
        if idt:
            try:
                # Lightweight, non-verified JWT payload parsing. This is
                # only used for UI display (email/name/avatar) and not for
                # security decisions. If parsing fails, we ignore it.
                parts = idt.split(".")
                if len(parts) >= 2:
                    payload = parts[1]
                    # Base64url decode with padding
                    rem = len(payload) % 4
                    if rem:
                        payload += "=" * (4 - rem)
                    decoded = base64.urlsafe_b64decode(payload.encode())
                    claims = json.loads(decoded.decode())
                    user = {
                        "email": claims.get("email"),
                        "name": claims.get("name"),
                        "picture": claims.get("picture"),
                    }
            except Exception:
                user = None

        # Fallback — no id_token (older sessions or missing openid scope).
        # Use the access token against Google's userinfo endpoint so the
        # header can still show the user's name and avatar.
        if user is None:
            access = token.get("access_token")
            if access:
                try:
                    with httpx.Client(timeout=5) as client:
                        info = client.get(
                            "https://openidconnect.googleapis.com/v1/userinfo",
                            headers={"Authorization": f"Bearer {access}"},
                        )
                    if info.status_code < 400:
                        claims = info.json()
                        user = {
                            "email": claims.get("email"),
                            "name": claims.get("name"),
                            "picture": claims.get("picture"),
                        }
                except Exception:
                    user = None

    return {"connected": token is not None, "session_key": session_key, "user": user}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    session_key = request.cookies.get(OAUTH_SESSION_COOKIE) or request.headers.get(
        "x-session-key"
    )
    if session_key:
        form_store.clear_oauth_token(session_key)
    _clear_session_cookie(response, request)
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


def _set_state_cookie(response: Response, request: Request, state: str) -> None:
    # Match the session cookie's Secure/SameSite so plain-HTTP localhost can
    # actually store this cookie. Browsers drop `Secure` cookies on
    # http://localhost in many cases, which would then fail state validation
    # on the callback and abort sign-in with "Invalid OAuth state".
    local = _is_local_request(request)
    response.set_cookie(
        key=_STATE_COOKIE_NAME,
        value=state,
        max_age=_STATE_COOKIE_MAX_AGE,
        httponly=True,
        secure=not local,
        samesite="lax" if local else "none",
        path="/api/auth",
    )


@router.get("/google/start")
def google_start(request: Request) -> RedirectResponse:
    client_id, _secret, redirect_uri = _require_oauth_config()
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(_build_auth_url(client_id, redirect_uri, state))
    _set_state_cookie(response, request, state)
    _ensure_session_key(request, response)
    return response


@router.get("/google/url")
def google_url(request: Request, response: Response) -> dict:
    """Return the OAuth URL so the frontend can open it directly in the browser."""
    client_id, _secret, redirect_uri = _require_oauth_config()
    state = secrets.token_urlsafe(32)
    _set_state_cookie(response, request, state)
    _ensure_session_key(request, response)
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

    # Verify the user actually granted the Sheets + Drive scopes. If they
    # unchecked a permission box on the consent screen the OAuth exchange
    # still succeeds, but the access_token is useless for creating sheets.
    # Catching it here gives a clear error at sign-in time instead of a
    # confusing 403 later when they try to create a form.
    granted_scopes = set((token.get("scope") or "").split())
    required_scopes = {
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
    }
    missing_scopes = required_scopes - granted_scopes
    if missing_scopes:
        import logging

        logging.getLogger(__name__).warning(
            "oauth.missing_scopes granted=%s missing=%s",
            sorted(granted_scopes),
            sorted(missing_scopes),
        )
        # Don't persist a partial token; force the user to try again.
        missing_label = (
            "Google Sheets"
            if "https://www.googleapis.com/auth/spreadsheets" in missing_scopes
            else "Google Drive"
        )
        return HTMLResponse(
            "<!doctype html><html><body style='font-family:system-ui;padding:40px;"
            "max-width:520px;margin:0 auto;color:#18181b'>"
            "<h2 style='margin-top:0'>Sign-in incomplete</h2>"
            f"<p>You didn't grant permission to {missing_label}, so the app can't "
            "create or write to your sheets.</p>"
            "<p><strong>Close this tab, click Sign in again, and make sure both "
            "checkboxes stay checked on the Google consent screen.</strong></p>"
            f"<p><a href='{_frontend_origin()}' "
            "style='color:#2563eb'>Back to the app</a></p>"
            "</body></html>",
            status_code=400,
        )

    session_key = request.cookies.get(OAUTH_SESSION_COOKIE) or secrets.token_urlsafe(32)
    form_store.set_oauth_token(token, key=session_key)

    # Close the popup and notify the opener window. We pin the targetOrigin
    # to our frontend origin rather than using '*' so a malicious opener
    # cannot intercept the message. If there is no opener (popup blocked or
    # same-tab flow on iOS/Safari), fall back to a direct redirect so the
    # user lands back on the app instead of being stranded on the backend
    # URL seeing "Sign-in successful".
    #
    # We also hand the session key back to the frontend explicitly (via
    # postMessage for the popup flow, and via a URL fragment for the same-tab
    # redirect). Safari's ITP commonly drops third-party cookies on
    # cross-site XHRs, so the frontend persists this key to localStorage and
    # forwards it as `X-Session-Key` on every request — bypassing the cookie
    # block. The key stays in the URL fragment (not the query), so it is
    # never sent to the server and never logged.
    frontend_origin = _frontend_origin()
    # JS-safe literal for the session key (secrets.token_urlsafe → [A-Za-z0-9_-]).
    session_key_js = json.dumps(session_key)

    html = (
        "<!doctype html><html><body>"
        "<script>"
        "(function(){"
        f"  var sk = {session_key_js};"
        f"  var origin = {frontend_origin!r};"
        "  try {"
        "    if (window.opener && !window.opener.closed) {"
        "      window.opener.postMessage({ type: 'oauth-success', sessionKey: sk }, origin);"
        "      window.close();"
        "      setTimeout(function(){"
        "        if (!window.closed) window.location.replace(origin + '/#om_session=' + encodeURIComponent(sk));"
        "      }, 300);"
        "      return;"
        "    }"
        "  } catch (e) {}"
        "  window.location.replace(origin + '/#om_session=' + encodeURIComponent(sk));"
        "})();"
        "</script>"
        "<p>Sign-in successful. Redirecting…</p>"
        "</body></html>"
    )

    response = HTMLResponse(html)
    _set_session_cookie(response, request, session_key)
    # Clear the state cookie now that the flow is complete.
    response.delete_cookie(_STATE_COOKIE_NAME, path="/api/auth")
    return response
