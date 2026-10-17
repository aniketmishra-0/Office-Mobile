"""
Tests for Pydantic input validation and payload size caps.
"""
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.models.form import (
    MAX_FIELDS_PER_SUBMISSION,
    MAX_STRING_VALUE_LENGTH,
    SubmitFormRequest,
    UpdateRowRequest,
    BatchAppendRequest,
)


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def test_submit_form_request_too_many_fields():
    """SubmitFormRequest rejects payloads with > 200 fields."""
    oversized = {f"field_{i}": "val" for i in range(MAX_FIELDS_PER_SUBMISSION + 1)}
    with pytest.raises(ValueError, match="Too many fields"):
        SubmitFormRequest(values=oversized)


def test_submit_form_request_string_too_long():
    """SubmitFormRequest rejects string fields exceeding 10,000 characters."""
    oversized = {"comment": "x" * (MAX_STRING_VALUE_LENGTH + 1)}
    with pytest.raises(ValueError, match="character limit"):
        SubmitFormRequest(values=oversized)


def test_update_row_request_validation():
    """UpdateRowRequest enforces field count and string length caps."""
    oversized_fields = {f"col_{i}": "v" for i in range(MAX_FIELDS_PER_SUBMISSION + 1)}
    with pytest.raises(ValueError, match="Too many fields"):
        UpdateRowRequest(
            sheet_url="https://docs.google.com/spreadsheets/d/1234567890/edit",
            row_index=2,
            values=oversized_fields,
        )

    oversized_val = {"col_1": "a" * (MAX_STRING_VALUE_LENGTH + 1)}
    with pytest.raises(ValueError, match="character limit"):
        UpdateRowRequest(
            sheet_url="https://docs.google.com/spreadsheets/d/1234567890/edit",
            row_index=2,
            values=oversized_val,
        )


def test_batch_append_row_limit():
    """BatchAppendRequest rejects more than 200 rows."""
    too_many_rows = [{"col": "val"} for _ in range(201)]
    with pytest.raises(ValueError):
        BatchAppendRequest(
            sheet_url="https://docs.google.com/spreadsheets/d/1234567890/edit",
            rows=too_many_rows,
        )


def test_payload_exceeding_2mb_returns_413(client):
    """The 2MB request body middleware returns 413 for oversized payloads."""
    # Build payload larger than 2 * 1024 * 1024 bytes (~2.1 MB)
    large_payload = b"x" * (2 * 1024 * 1024 + 500)
    response = client.post(
        "/api/sheet/batch-append",
        content=large_payload,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json().get("detail") == "Payload too large"
    assert response.json().get("error_code") == "PAYLOAD_TOO_LARGE"
