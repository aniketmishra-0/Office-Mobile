"""
Tests for WebSocket endpoint /ws/sheet/{sheet_id}, authentication, heartbeats, and event broadcasts.
"""
import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.services.websocket_manager import ws_manager


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def test_websocket_unauthorized_rejected(client):
    """Connecting without session cookie or token should be rejected with 1008 Policy Violation."""
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/sheet/sheet_unauth_123"):
            pass
    assert exc.value.code == 1008


def test_websocket_authorized_connection_and_subscription(client):
    """Connecting with a valid session receives the subscribed confirmation event."""
    session_key = "test_valid_session_key_12345"
    with client.websocket_connect(
        "/ws/sheet/sheet_test_123",
        cookies={"om_session": session_key},
    ) as websocket:
        data = websocket.receive_json()
        assert data["type"] == "subscribed"
        assert data["sheet_id"] == "sheet_test_123"
        assert "timestamp" in data


def test_websocket_heartbeat_ping_pong(client):
    """Client sending ping receives pong response."""
    session_key = "test_valid_session_key_12345"
    with client.websocket_connect(
        "/ws/sheet/sheet_heartbeat_123",
        cookies={"om_session": session_key},
    ) as websocket:
        init_data = websocket.receive_json()
        assert init_data["type"] == "subscribed"

        websocket.send_json({"type": "ping"})
        pong_data = websocket.receive_json()
        assert pong_data["type"] == "pong"
        assert "timestamp" in pong_data


@pytest.mark.anyio
async def test_websocket_broadcast_delivery(client):
    """Verify that ws_manager.broadcast sends small events to watching clients."""
    sheet_id = "sheet_broadcast_test_456"
    session_key = "test_valid_session_key_12345"

    with client.websocket_connect(
        f"/ws/sheet/{sheet_id}",
        cookies={"om_session": session_key},
    ) as websocket:
        # Receive subscribe confirmation
        init_msg = websocket.receive_json()
        assert init_msg["type"] == "subscribed"

        # Broadcast row_updated event
        await ws_manager.broadcast(
            sheet_id=sheet_id,
            event_type="row_updated",
            row_index=4,
        )

        event = websocket.receive_json()
        assert event["type"] == "row_updated"
        assert event["sheet_id"] == sheet_id
        assert event["row_index"] == 4
        assert "timestamp" in event
        # Ensure minimal payload: full sheet data must NOT be present
        assert "rows" not in event
        assert "fields" not in event


@pytest.mark.anyio
async def test_websocket_room_isolation(client):
    """Clients watching sheet A must not receive events for sheet B."""
    sheet_a = "sheet_room_A_111"
    sheet_b = "sheet_room_B_222"
    session_key = "test_valid_session_key_12345"

    with client.websocket_connect(
        f"/ws/sheet/{sheet_a}",
        cookies={"om_session": session_key},
    ) as ws_a:
        assert ws_a.receive_json()["type"] == "subscribed"

        # Broadcast to sheet B only
        await ws_manager.broadcast(
            sheet_id=sheet_b,
            event_type="row_updated",
            row_index=10,
        )

        # Broadcast to sheet A
        await ws_manager.broadcast(
            sheet_id=sheet_a,
            event_type="row_appended",
            row_index=None,
        )

        # ws_a should receive sheet A's event, skipping sheet B's
        event = ws_a.receive_json()
        assert event["sheet_id"] == sheet_a
        assert event["type"] == "row_appended"


def test_websocket_disconnect_cleanup(client):
    """Closing websocket removes it from manager room and frees memory."""
    sheet_id = "sheet_cleanup_test_789"
    session_key = "test_valid_session_key_12345"

    with client.websocket_connect(
        f"/ws/sheet/{sheet_id}",
        cookies={"om_session": session_key},
    ) as websocket:
        _ = websocket.receive_json()
        assert ws_manager.active_connections_count(sheet_id) == 1

    # After exiting context manager, client is disconnected
    assert ws_manager.active_connections_count(sheet_id) == 0
