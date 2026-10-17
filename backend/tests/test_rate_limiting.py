"""
Tests for rate limiting on auth, submit, and batch endpoints.
"""
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.limiter import limiter


@pytest.fixture
def client():
    # Clear limiter storage before each test to prevent cross-test pollution
    limiter.reset()
    return TestClient(app, raise_server_exceptions=False)


def test_auth_rate_limiting(client):
    """Ensure that exceeding rate limits returns 429 with RATE_LIMITED error code and CORS."""
    headers = {"Origin": "https://officemobile.org"}
    # The default auth rate limit is 15/minute. Sending 18 requests ensures we trigger 429.
    responses = [client.get("/api/auth/status", headers=headers) for _ in range(18)]
    
    status_codes = [r.status_code for r in responses]
    assert 200 in status_codes
    assert 429 in status_codes
    
    # Check the 429 response structure
    rate_limited_resp = next(r for r in responses if r.status_code == 429)
    data = rate_limited_resp.json()
    assert data.get("error_code") == "RATE_LIMITED"
    assert "Rate limit exceeded" in data.get("detail", "")
    assert rate_limited_resp.headers.get("access-control-allow-origin") == "https://officemobile.org"


def test_cors_preflight_on_rate_limited_origins(client):
    """OPTIONS preflight must pass for allowed origins."""
    headers = {
        "Origin": "https://officemobile.org",
        "Access-Control-Request-Method": "POST",
    }
    resp = client.options("/api/forms/test-form/submit", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://officemobile.org"
