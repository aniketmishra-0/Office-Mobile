from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Iterator

OAUTH_SESSION_COOKIE = "om_session"
OAUTH_SESSION_MAX_AGE = 60 * 60 * 24 * 30
DEFAULT_OAUTH_KEY = "default"

UNSET = object()
_oauth_session_key: ContextVar[object | str | None] = ContextVar(
    "oauth_session_key", default=UNSET
)


def get_oauth_session_key_raw() -> object | str | None:
    return _oauth_session_key.get()


def get_current_oauth_session_key() -> str | None:
    key = _oauth_session_key.get()
    if key is UNSET or not key:
        return None
    return str(key)


def set_oauth_session_key(key: str | None) -> Token:
    return _oauth_session_key.set(key)


def reset_oauth_session_key(token: Token) -> None:
    _oauth_session_key.reset(token)


@contextmanager
def oauth_session_context(key: str | None) -> Iterator[None]:
    token = set_oauth_session_key(key)
    try:
        yield
    finally:
        reset_oauth_session_key(token)


TENANT_HEADER = "x-tenant-id"
_tenant_id_context: ContextVar[str | None] = ContextVar("tenant_id_context", default=None)


def get_current_tenant_id() -> str | None:
    return _tenant_id_context.get()


def set_tenant_id(tenant_id: str | None) -> Token:
    return _tenant_id_context.set(tenant_id)


def reset_tenant_id(token: Token) -> None:
    _tenant_id_context.reset(token)


@contextmanager
def tenant_context(tenant_id: str | None) -> Iterator[None]:
    token = set_tenant_id(tenant_id)
    try:
        yield
    finally:
        reset_tenant_id(token)
