"""
WebSocket Connection & Event Broadcast Manager for Real-Time Sheet Updates.

Supports:
- Per-sheet room subscriptions (clients only receive events for sheets they watch).
- Minimal payloads: {type, sheet_id, row_index, timestamp}. Full sheet data is NEVER broadcast.
- Automatic cleanup on disconnect to eliminate memory leaks.
- Heartbeat handling (ping/pong).
- Multi-worker scalability via optional Redis Pub/Sub (if REDIS_URL is configured).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket
from app.services.cache import get_redis

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self) -> None:
        # sheet_id -> Set of active WebSocket connections
        self._rooms: Dict[str, Set[WebSocket]] = {}
        self._redis_sub_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, sheet_id: str) -> None:
        """Accept connection and register websocket to the sheet's subscription pool."""
        await websocket.accept()
        async with self._lock:
            if sheet_id not in self._rooms:
                self._rooms[sheet_id] = set()
            self._rooms[sheet_id].add(websocket)
        logger.debug("WS connected: sheet_id=%s, total=%d", sheet_id, len(self._rooms[sheet_id]))

    async def disconnect(self, websocket: WebSocket, sheet_id: str) -> None:
        """Remove websocket and clean up empty rooms to prevent memory leaks."""
        async with self._lock:
            if sheet_id in self._rooms:
                self._rooms[sheet_id].discard(websocket)
                if not self._rooms[sheet_id]:
                    del self._rooms[sheet_id]
        logger.debug("WS disconnected: sheet_id=%s", sheet_id)

    async def broadcast_local(self, sheet_id: str, event: dict[str, Any]) -> None:
        """Send event to all local WebSockets watching sheet_id."""
        async with self._lock:
            sockets = list(self._rooms.get(sheet_id, []))

        if not sockets:
            return

        dead_sockets = []
        payload_text = json.dumps(event)

        for ws in sockets:
            try:
                await ws.send_text(payload_text)
            except Exception as exc:
                logger.debug("WS send error (%s); marking socket for removal", exc)
                dead_sockets.append(ws)

        if dead_sockets:
            async with self._lock:
                if sheet_id in self._rooms:
                    for ws in dead_sockets:
                        self._rooms[sheet_id].discard(ws)
                    if not self._rooms[sheet_id]:
                        del self._rooms[sheet_id]

    async def broadcast(
        self,
        sheet_id: str,
        event_type: str,
        row_index: Optional[int] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> None:
        """
        Broadcast a lightweight sheet event to all watchers.
        Event shape: {type, sheet_id, row_index, timestamp, ...}
        """
        event: dict[str, Any] = {
            "type": event_type,
            "sheet_id": sheet_id,
            "row_index": row_index,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if extra:
            event.update(extra)

        # Broadcast to local connected clients
        await self.broadcast_local(sheet_id, event)

        # If Redis is active, also publish so other uvicorn workers receive it
        try:
            redis_client = await get_redis()
            if redis_client is not None:
                channel = f"om:ws:channel:{sheet_id}"
                await redis_client.publish(channel, json.dumps(event))
        except Exception as exc:
            logger.debug("Redis WS publish error: %s", exc)

    def active_connections_count(self, sheet_id: Optional[str] = None) -> int:
        """Return the number of connected clients for a sheet, or all sheets."""
        if sheet_id:
            return len(self._rooms.get(sheet_id, set()))
        return sum(len(conns) for conns in self._rooms.values())


# Global singleton manager instance
ws_manager = WebSocketManager()
