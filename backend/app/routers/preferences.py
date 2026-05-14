"""
User preferences API — persists per-user settings (font, font size, theme, etc.)
keyed by the OAuth session key.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from typing import Optional

from app.services import form_store
from app.services.session_context import OAUTH_SESSION_COOKIE

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

ALLOWED_FONTS = [
    "system",
    "newsreader",
    "plex-mono",
    "inter",
    "georgia",
    "merriweather",
]

ALLOWED_FONT_SIZES = ["xs", "sm", "md", "lg", "xl"]


class UserPreferences(BaseModel):
    """All user-customisable preferences. Every field is optional — only
    provided fields are updated (PATCH semantics)."""

    theme: Optional[str] = Field(None, pattern="^(light|dark)$")
    font_family: Optional[str] = None
    font_size: Optional[str] = None
    line_height: Optional[str] = Field(None, pattern="^(compact|normal|relaxed)$")
    border_radius: Optional[str] = Field(None, pattern="^(none|sm|md|lg)$")
    # Editorial copy overrides
    hero_title: Optional[str] = None
    hero_sub: Optional[str] = None
    submit_label: Optional[str] = None
    success_title: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_session_key(request: Request) -> str:
    session_key = request.cookies.get(OAUTH_SESSION_COOKIE) or request.headers.get(
        "x-session-key"
    )
    if not session_key:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session_key


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
def get_preferences(request: Request) -> dict:
    """Return the current user's saved preferences."""
    session_key = _get_session_key(request)
    prefs = form_store.get_user_preferences(session_key)
    return {"preferences": prefs}


@router.put("")
def save_preferences(request: Request, body: UserPreferences) -> dict:
    """Save (overwrite) the user's preferences."""
    session_key = _get_session_key(request)

    # Validate font_family if provided
    if body.font_family and body.font_family not in ALLOWED_FONTS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid font_family. Allowed: {', '.join(ALLOWED_FONTS)}",
        )

    # Validate font_size if provided
    if body.font_size and body.font_size not in ALLOWED_FONT_SIZES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid font_size. Allowed: {', '.join(ALLOWED_FONT_SIZES)}",
        )

    # Build the prefs dict, only including non-None values
    prefs = {k: v for k, v in body.model_dump().items() if v is not None}
    saved = form_store.set_user_preferences(session_key, prefs)
    return {"preferences": saved}


@router.patch("")
def patch_preferences(request: Request, body: UserPreferences) -> dict:
    """Merge partial updates into the user's existing preferences."""
    session_key = _get_session_key(request)

    # Validate font_family if provided
    if body.font_family and body.font_family not in ALLOWED_FONTS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid font_family. Allowed: {', '.join(ALLOWED_FONTS)}",
        )

    # Validate font_size if provided
    if body.font_size and body.font_size not in ALLOWED_FONT_SIZES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid font_size. Allowed: {', '.join(ALLOWED_FONT_SIZES)}",
        )

    existing = form_store.get_user_preferences(session_key)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    merged = {**existing, **patch}

    # Remove keys explicitly set to empty string (user wants to reset)
    merged = {k: v for k, v in merged.items() if v != ""}

    saved = form_store.set_user_preferences(session_key, merged)
    return {"preferences": saved}


@router.delete("")
def reset_preferences(request: Request) -> dict:
    """Reset all preferences to defaults (empty)."""
    session_key = _get_session_key(request)
    form_store.set_user_preferences(session_key, {})
    return {"preferences": {}}
