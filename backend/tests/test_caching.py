"""
Unit tests for the optional Redis caching layer, user/sheet isolation, and write invalidations.
"""
import pytest
from unittest.mock import AsyncMock, patch
from starlette.testclient import TestClient

from app.main import app
from app.config import get_settings
from app.services import cache


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.anyio
async def test_cache_fallback_when_redis_disabled(monkeypatch):
    """When REDIS_URL is not configured, cache operations safely return None/False without error."""
    settings = get_settings()
    monkeypatch.setattr(settings, "redis_url", None)

    # All cache operations should gracefully no-op
    res = await cache.get_json("om:test:key")
    assert res is None

    set_res = await cache.set_json("om:test:key", {"hello": "world"})
    assert set_res is False

    del_res = await cache.delete_key("om:test:key")
    assert del_res is False

    pat_res = await cache.delete_pattern("om:test:*")
    assert pat_res == 0


@pytest.mark.anyio
async def test_cache_set_and_get_with_mock_redis():
    """Verify that get_json and set_json properly serialize and deserialize data."""
    store = {}

    mock_redis = AsyncMock()
    async def fake_get(key):
        return store.get(key)
    async def fake_set(key, value, ex=None):
        store[key] = value
        return True

    mock_redis.get.side_effect = fake_get
    mock_redis.set.side_effect = fake_set

    with patch("app.services.cache.get_redis", return_value=mock_redis):
        data = {"title": "Test Form", "rows": [1, 2, 3]}
        success = await cache.set_json("om:test:key", data, ttl=60)
        assert success is True

        cached = await cache.get_json("om:test:key")
        assert cached == data
        mock_redis.get.assert_called_once_with("om:test:key")


def test_user_and_sheet_isolation():
    """Verify cache keys strictly isolate different users and different sheet IDs."""
    user_a_key = cache.make_history_key("userA", "sheet_123", "Tab1")
    user_b_key = cache.make_history_key("userB", "sheet_123", "Tab1")
    different_sheet_key = cache.make_history_key("userA", "sheet_456", "Tab1")

    assert user_a_key != user_b_key
    assert user_a_key != different_sheet_key
    assert "userA" in user_a_key
    assert "userB" in user_b_key
    assert "sheet_123" in user_a_key
    assert "sheet_456" in different_sheet_key


@pytest.mark.anyio
async def test_redis_down_resilience():
    """If Redis raises unexpected connection errors, operations swallow errors safely."""
    mock_redis = AsyncMock()
    mock_redis.get.side_effect = ConnectionError("Redis server connection refused")
    mock_redis.set.side_effect = ConnectionError("Redis server connection refused")
    mock_redis.delete.side_effect = ConnectionError("Redis server connection refused")
    mock_redis.scan.side_effect = ConnectionError("Redis server connection refused")

    with patch("app.services.cache.get_redis", return_value=mock_redis):
        assert await cache.get_json("om:any:key") is None
        assert await cache.set_json("om:any:key", {"a": 1}) is False
        assert await cache.delete_key("om:any:key") is False
        assert await cache.delete_pattern("om:*") == 0


@pytest.mark.anyio
async def test_library_cache_hit_bypasses_db(client):
    """When forms library is in cache, the cached payload is returned directly."""
    cached_payload = {
        "items": [
            {
                "id": "cached_form_123",
                "form_title": "Cached Title",
                "sheet_url": "https://docs.google.com/spreadsheets/d/123/edit",
                "spreadsheet_id": "123",
                "field_count": 3,
                "submission_count": 5,
            }
        ]
    }

    with patch("app.routers.forms.get_json", AsyncMock(return_value=cached_payload)):
        with patch("app.services.form_store.list_forms") as mock_db_list:
            response = client.get("/api/forms/library")
            assert response.status_code == 200
            data = response.json()
            assert data["items"][0]["id"] == "cached_form_123"
            assert data["items"][0]["form_title"] == "Cached Title"
            mock_db_list.assert_not_called()


@pytest.mark.anyio
async def test_write_endpoints_trigger_cache_invalidation():
    """Verify that invalidate_sheet_cache and invalidate_library_cache call delete_pattern."""
    mock_delete_pattern = AsyncMock(return_value=2)
    with patch("app.services.cache.delete_pattern", mock_delete_pattern):
        await cache.invalidate_sheet_cache("sheet_abc_123")
        mock_delete_pattern.assert_called_once_with("om:u:*:sheet:sheet_abc_123:*")

    mock_delete_key = AsyncMock(return_value=True)
    with patch("app.services.cache.delete_key", mock_delete_key):
        await cache.invalidate_library_cache("user_session_456")
        mock_delete_key.assert_called_once_with("om:u:user_session_456:forms:library")
