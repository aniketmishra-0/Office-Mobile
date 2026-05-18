"""
Postgres connection pool (Neon).

We use psycopg 3 with its built-in ConnectionPool so the rest of the app
can stay synchronous. Functions here are safe to call from inside FastAPI
route handlers that are plain `def` (not `async def`).
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Iterator

from psycopg import Connection, OperationalError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

# Importing app.config loads backend/.env into os.environ so DATABASE_URL is
# picked up regardless of how this module is imported (uvicorn, pytest,
# one-off scripts, etc).
from app import config as _config  # noqa: F401

logger = logging.getLogger(__name__)


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. This app requires Neon/Postgres. "
            "Set DATABASE_URL in backend/.env (e.g. "
            "postgresql://user:pass@host/db?sslmode=require)."
        )
    return url


_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    """Lazily initialize and return the shared connection pool."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=_database_url(),
            min_size=2,
            max_size=15,
            kwargs={"row_factory": dict_row, "autocommit": False},
            # Open lazily so importing this module does not block on I/O.
            open=False,
            # Neon free-tier suspends after inactivity; allow extra time for
            # cold-start reconnections.
            reconnect_timeout=60,
            # Check connections before handing them out. Neon closes idle
            # connections aggressively; this ensures we never use a dead one.
            check=ConnectionPool.check_connection,
            max_idle=300,
        )
        _pool.open()
        _pool.wait(timeout=30)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def connection() -> Iterator[Connection]:
    """Yield a connection from the pool. Commits on success, rolls back on error."""
    pool = get_pool()
    with pool.connection(timeout=15) as conn:
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise


def _retry_on_connection_error(fn, *args, max_retries: int = 2):
    """Retry a database operation on transient connection errors (Neon cold start, etc.)."""
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return fn(*args)
        except (OperationalError, ConnectionError, OSError) as exc:
            last_exc = exc
            if attempt < max_retries:
                wait = 1.0 * (attempt + 1)
                logger.warning(
                    "db.retry attempt=%d/%d wait=%.1fs error=%s",
                    attempt + 1, max_retries, wait, str(exc)[:200],
                )
                time.sleep(wait)
            else:
                raise
    raise last_exc  # type: ignore[misc]


def execute(query: str, params: tuple | dict | None = None) -> None:
    def _do():
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
    _retry_on_connection_error(_do)


def fetchone(query: str, params: tuple | dict | None = None) -> dict[str, Any] | None:
    def _do():
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchone()
    return _retry_on_connection_error(_do)


def fetchall(query: str, params: tuple | dict | None = None) -> list[dict[str, Any]]:
    def _do():
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchall()
    return _retry_on_connection_error(_do)
