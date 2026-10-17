"""
Optional Redis cache layer using redis.asyncio.

Controlled by REDIS_URL. If REDIS_URL is not set or Redis is unavailable,
all cache operations gracefully fall back to no-op without raising errors.

Security & Isolation:
- Cache keys are strictly scoped per-user (OAuth session key) and per-sheet-id.
- Data from one user's OAuth scope is never served to another user.
- All write paths invalidate relevant cache entries.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis
from app.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None
_redis_disabled: bool = False


async def get_redis() -> Optional[aioredis.Redis]:
    """Return the active redis.asyncio client, or None if disabled/unreachable."""
    global _redis_client, _redis_disabled
    if _redis_disabled:
        return None

    settings = get_settings()
    if not settings.redis_url:
        return None

    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            # Ping to verify connection
            await _redis_client.ping()
            logger.info("Redis cache connected successfully")
        except Exception as exc:
            logger.warning("Redis cache connection failed (%s); falling back to no-op cache", exc)
            _redis_client = None
            # Do not permanently disable so transient restarts can recover
            return None

    return _redis_client


async def close_redis() -> None:
    """Close the redis connection pool on application shutdown."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception:
            pass
        _redis_client = None


# ---------------------------------------------------------------------------
# Key Helpers (strict user + sheet isolation)
# ---------------------------------------------------------------------------


def make_history_key(user_key: str, spreadsheet_id: str, worksheet_name: Optional[str]) -> str:
    ws = (worksheet_name or "_default_").strip().lower()
    return f"om:u:{user_key}:sheet:{spreadsheet_id}:hist:{ws}"


def make_worksheets_key(user_key: str, spreadsheet_id: str) -> str:
    return f"om:u:{user_key}:sheet:{spreadsheet_id}:worksheets"


def make_library_key(user_key: str) -> str:
    return f"om:u:{user_key}:forms:library"


# ---------------------------------------------------------------------------
# Cache Operations (Never raise exceptions on cache failure)
# ---------------------------------------------------------------------------


async def get_json(key: str) -> Optional[Any]:
    """Retrieve and deserialize a JSON object from cache."""
    try:
        client = await get_redis()
        if client is None:
            return None
        raw = await client.get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis get_json failed for key=%s: %s", key, exc)
    return None


async def set_json(key: str, data: Any, ttl: Optional[int] = None) -> bool:
    """Serialize and store an object in cache with a TTL (seconds)."""
    try:
        client = await get_redis()
        if client is None:
            return False
        if ttl is None:
            ttl = get_settings().cache_ttl_sheets
        payload = json.dumps(data)
        await client.set(key, payload, ex=ttl)
        return True
    except Exception as exc:
        logger.warning("Redis set_json failed for key=%s: %s", key, exc)
        return False


async def delete_key(key: str) -> bool:
    """Delete a single key from cache."""
    try:
        client = await get_redis()
        if client is None:
            return False
        await client.delete(key)
        return True
    except Exception as exc:
        logger.warning("Redis delete_key failed for key=%s: %s", key, exc)
        return False


async def delete_pattern(pattern: str) -> int:
    """Delete all keys matching pattern using SCAN to avoid blocking."""
    count = 0
    try:
        client = await get_redis()
        if client is None:
            return 0
        cursor = 0
        while True:
            cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                await client.delete(*keys)
                count += len(keys)
            if cursor == 0:
                break
    except Exception as exc:
        logger.warning("Redis delete_pattern failed for pattern=%s: %s", pattern, exc)
    return count


async def invalidate_sheet_cache(spreadsheet_id: str, user_key: Optional[str] = None) -> None:
    """
    Invalidate cached sheet reads (history, worksheets).
    If user_key is specified, invalidates for that user; otherwise invalidates
    across all user scopes for that sheet ID.
    """
    if user_key:
        pattern = f"om:u:{user_key}:sheet:{spreadsheet_id}:*"
    else:
        pattern = f"om:u:*:sheet:{spreadsheet_id}:*"
    await delete_pattern(pattern)


async def invalidate_library_cache(user_key: Optional[str] = None) -> None:
    """Invalidate cached forms library."""
    if user_key:
        await delete_key(make_library_key(user_key))
    else:
        await delete_pattern("om:u:*:forms:library")
