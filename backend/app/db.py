"""
Postgres connection pool (Neon).

We use psycopg 3 with its built-in ConnectionPool so the rest of the app
can stay synchronous. Functions here are safe to call from inside FastAPI
route handlers that are plain `def` (not `async def`).
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

# Importing app.config loads backend/.env into os.environ so DATABASE_URL is
# picked up regardless of how this module is imported (uvicorn, pytest,
# one-off scripts, etc).
from app import config as _config  # noqa: F401


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
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row, "autocommit": False},
            # Open lazily so importing this module does not block on I/O.
            open=False,
        )
        _pool.open()
        _pool.wait(timeout=10)
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
    with pool.connection() as conn:
        try:
            yield conn
            # psycopg's pool context manager commits on successful exit by default,
            # but we make intent explicit here.
        except Exception:
            conn.rollback()
            raise


def execute(query: str, params: tuple | dict | None = None) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)


def fetchone(query: str, params: tuple | dict | None = None) -> dict[str, Any] | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()


def fetchall(query: str, params: tuple | dict | None = None) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
