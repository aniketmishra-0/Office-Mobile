from typing import Optional
import os
import asyncio
import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL")

_pool: Optional[asyncpg.pool.Pool] = None


async def init_pool():
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL not set")
        _pool = await asyncpg.create_pool(DATABASE_URL)
    return _pool


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def execute(query: str, *args):
    pool = await init_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args):
    pool = await init_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args):
    pool = await init_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)
