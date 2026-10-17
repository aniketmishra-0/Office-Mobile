"""
Tests for error response formats and information leakage prevention.
"""
import pytest
from starlette.testclient import TestClient
from unittest.mock import patch
from gspread.exceptions import APIError

from app.main import app
from app.config import get_settings
from app.services.sheets_client import map_sheet_exception


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def test_not_found_error_format(client):
    """404 errors include detail and error_code without stack traces."""
    response = client.get("/api/forms/non-existent-id-xyz")
    assert response.status_code == 404
    data = response.json()
    assert data.get("detail") == "Form not found"
    assert data.get("error_code") == "NOT_FOUND"
    assert "traceback" not in data


def test_validation_error_format(client):
    """422 errors include validation details and error_code."""
    response = client.post("/api/forms", json={})
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert data.get("error_code") == "VALIDATION_ERROR"


def test_internal_error_does_not_leak_details(client):
    """500 responses return generic message without server tracebacks."""
    with patch("app.services.form_store.get_form", side_effect=RuntimeError("Secret database error")):
        response = client.get("/api/forms/some-form-id")
        assert response.status_code in (500, 404)
        data = response.json()
        assert "Secret database error" not in str(data)
        assert "RuntimeError" not in str(data)


def test_google_sheet_exception_sanitizer():
    """map_sheet_exception does not leak raw Google API JSON or internals."""
    class DummyResponse:
        status_code = 400
        text = '{"error": {"code": 400, "message": "Secret internal cell range error"}}'
        def json(self):
            return {"error": {"code": 400, "message": "Secret internal cell range error"}}

    api_err = APIError(DummyResponse())
    status_code, msg = map_sheet_exception(api_err)
    assert status_code == 400
    assert "Secret internal cell range error" not in msg
    assert "update range exceeds the sheet dimensions" in msg

    # Test 403
    class ForbiddenResponse:
        status_code = 403
        text = '{"error": {"code": 403, "message": "The caller does not have permission"}}'
        def json(self):
            return {"error": {"code": 403, "message": "The caller does not have permission"}}

    status_code, msg = map_sheet_exception(APIError(ForbiddenResponse()))
    assert status_code == 403
    assert "Permission denied" in msg or "permission" in msg.lower()


def test_debug_endpoint_disabled_by_default(client):
    """Debug endpoints return 404 when debug_mode is False."""
    settings = get_settings()
    assert settings.debug_mode is False
    
    response = client.get("/api/debug/form/test-id")
    assert response.status_code == 404
    assert response.json().get("detail") == "Not found"
