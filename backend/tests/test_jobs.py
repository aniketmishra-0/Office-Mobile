"""
Tests for Phase 4: Background Jobs
Validates job lifecycle, chunked execution, progress tracking, crash resilience,
and REST endpoints under /api/jobs.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.jobs import (
    _execute_batch_append_worker,
    _execute_bulk_delete_worker,
    _execute_duplicate_scan_worker,
)
from app.services import job_store

SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit"


@pytest.fixture(scope="module", autouse=True)
def setup_jobs_table():
    job_store.init_jobs_table()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_job_store_crud():
    """Verify create, get, progress update, complete, and fail in job_store."""
    job = job_store.create_job(
        job_type="test_job",
        user_key="user_123",
        sheet_id=SPREADSHEET_ID,
        total_count=100,
        params={"foo": "bar"},
    )
    job_id = job["id"]
    assert job["status"] == "queued"
    assert job["progress_pct"] == 0
    assert job["processed_count"] == 0
    assert job["total_count"] == 100
    assert job["params"] == {"foo": "bar"}

    # Update progress to 50%
    job_store.update_job_progress(job_id, processed_count=50, total_count=100, status="running")
    updated = job_store.get_job(job_id)
    assert updated is not None
    assert updated["status"] == "running"
    assert updated["progress_pct"] == 50
    assert updated["processed_count"] == 50

    # Complete job
    job_store.complete_job(job_id, result={"done": True}, processed_count=100)
    completed = job_store.get_job(job_id)
    assert completed is not None
    assert completed["status"] == "completed"
    assert completed["progress_pct"] == 100
    assert completed["result"] == {"done": True}

    # Fail another job
    fail_job = job_store.create_job(job_type="fail_test", total_count=10)
    job_store.fail_job(fail_job["id"], "Google Sheets API quota exceeded")
    failed = job_store.get_job(fail_job["id"])
    assert failed is not None
    assert failed["status"] == "failed"
    assert "quota exceeded" in (failed["error"] or "")


def test_get_job_404(client):
    """GET /api/jobs/{job_id} returns 404 for unknown job ID."""
    resp = client.get("/api/jobs/nonexistent_job_xyz_999")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_get_job_success(client):
    """GET /api/jobs/{job_id} returns job details."""
    job = job_store.create_job(
        job_type="status_check",
        sheet_id=SPREADSHEET_ID,
        total_count=20,
    )
    resp = client.get(f"/api/jobs/{job['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == job["id"]
    assert data["job_type"] == "status_check"
    assert data["status"] == "queued"
    assert data["progress_pct"] == 0
    assert data["processed_count"] == 0
    assert data["total_count"] == 20


def test_enqueue_batch_append(client):
    """POST /api/jobs/batch-append returns 202 Accepted with poll URL."""
    rows = [{"Name": f"User {i}", "Score": str(i)} for i in range(10)]
    payload = {
        "sheet_url": SHEET_URL,
        "worksheet_name": "Sheet1",
        "rows": rows,
    }

    with patch("app.routers.jobs._has_credentials", return_value=True):
        resp = client.post("/api/jobs/batch-append", json=payload)
        assert resp.status_code == 202
        body = resp.json()
        assert "job_id" in body
        assert body["status"] == "queued"
        assert body["poll_url"] == f"/api/jobs/{body['job_id']}"

        # Check job in DB
        job = job_store.get_job(body["job_id"])
        assert job is not None
        assert job["job_type"] == "batch_append"
        assert job["total_count"] == 10


def test_enqueue_bulk_delete(client):
    """POST /api/jobs/bulk-delete returns 202 Accepted."""
    payload = {
        "sheet_url": SHEET_URL,
        "worksheet_name": "Sheet1",
        "row_indices": [5, 6, 7, 8],
    }

    with patch("app.routers.jobs._has_credentials", return_value=True):
        resp = client.post("/api/jobs/bulk-delete", json=payload)
        assert resp.status_code == 202
        body = resp.json()
        assert "job_id" in body
        assert body["status"] == "queued"


def test_enqueue_duplicate_scan(client):
    """POST /api/jobs/duplicate-scan returns 202 Accepted."""
    payload = {
        "sheet_url": SHEET_URL,
        "worksheet_name": "Sheet1",
        "key_columns": ["Email"],
    }

    with patch("app.routers.jobs._has_credentials", return_value=True):
        resp = client.post("/api/jobs/duplicate-scan", json=payload)
        assert resp.status_code == 202
        body = resp.json()
        assert "job_id" in body
        assert body["status"] == "queued"


def test_batch_append_worker_chunking_and_progress():
    """Worker processes 115 rows in chunks of 50 (50, 50, 15) and marks complete."""
    total_rows = 115
    rows = [{"ColA": f"val_{i}"} for i in range(total_rows)]
    job = job_store.create_job(
        job_type="batch_append",
        sheet_id=SPREADSHEET_ID,
        total_count=total_rows,
    )
    job_id = job["id"]

    mock_append = MagicMock(return_value={"success": True, "appended_count": 50})

    with patch("app.routers.jobs.batch_append_rows", mock_append), \
         patch("app.routers.jobs.invalidate_sheet_cache"), \
         patch("app.routers.jobs.ws_manager.broadcast"):

        _execute_batch_append_worker(
            job_id=job_id,
            spreadsheet_id=SPREADSHEET_ID,
            worksheet_name="Sheet1",
            rows=rows,
            oauth_key=None,
        )

    # 115 rows / 50 chunk_size = 3 chunks (50, 50, 15)
    assert mock_append.call_count == 3
    final_job = job_store.get_job(job_id)
    assert final_job is not None
    assert final_job["status"] == "completed"
    assert final_job["progress_pct"] == 100
    assert final_job["processed_count"] == 115
    assert final_job["result"]["appended_count"] == 115


def test_batch_append_worker_crash_resilience():
    """If chunk 2 fails, job is marked 'failed' and processed_count preserves chunk 1 progress."""
    total_rows = 100
    rows = [{"ColA": f"val_{i}"} for i in range(total_rows)]
    job = job_store.create_job(
        job_type="batch_append",
        sheet_id=SPREADSHEET_ID,
        total_count=total_rows,
    )
    job_id = job["id"]

    # First chunk succeeds, second chunk fails
    call_count = 0
    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"success": True, "appended_count": 50}
        raise RuntimeError("Google Sheets 503 Service Unavailable")

    with patch("app.routers.jobs.batch_append_rows", side_effect=side_effect):
        _execute_batch_append_worker(
            job_id=job_id,
            spreadsheet_id=SPREADSHEET_ID,
            worksheet_name="Sheet1",
            rows=rows,
            oauth_key=None,
        )

    failed_job = job_store.get_job(job_id)
    assert failed_job is not None
    assert failed_job["status"] == "failed"
    # Processed count accurately records the 50 rows written before the failure
    assert failed_job["processed_count"] == 50
    assert failed_job["progress_pct"] == 50
    assert "503 Service Unavailable" in (failed_job["error"] or "")


def test_bulk_delete_worker():
    """Worker deletes rows in descending order and completes."""
    job = job_store.create_job(
        job_type="bulk_delete",
        sheet_id=SPREADSHEET_ID,
        total_count=3,
    )
    job_id = job["id"]

    mock_delete = MagicMock(return_value=3)

    with patch("app.routers.jobs.batch_delete_rows", mock_delete), \
         patch("app.routers.jobs.invalidate_sheet_cache"), \
         patch("app.routers.jobs.ws_manager.broadcast"):

        _execute_bulk_delete_worker(
            job_id=job_id,
            spreadsheet_id=SPREADSHEET_ID,
            worksheet_name="Sheet1",
            row_indices=[10, 4, 15],
            oauth_key=None,
        )

    mock_delete.assert_called_once()
    # Check that row indices were sorted descending [15, 10, 4]
    call_kwargs = mock_delete.call_args[1]
    assert call_kwargs["row_indices"] == [15, 10, 4]

    final_job = job_store.get_job(job_id)
    assert final_job is not None
    assert final_job["status"] == "completed"
    assert final_job["processed_count"] == 3


def test_duplicate_scan_worker():
    """Worker detects duplicate rows based on key columns."""
    job = job_store.create_job(
        job_type="duplicate_scan",
        sheet_id=SPREADSHEET_ID,
        total_count=0,
    )
    job_id = job["id"]

    fake_history = {
        "headers": ["Name", "Email"],
        "rows": [
            {"Name": "Alice", "Email": "alice@example.com"},
            {"Name": "Bob", "Email": "bob@example.com"},
            {"Name": "Alice Duplicate", "Email": "alice@example.com"},  # duplicate email
            {"Name": "Charlie", "Email": "charlie@example.com"},
        ],
    }

    with patch("app.routers.jobs.read_sheet_history_authenticated", return_value=fake_history):
        _execute_duplicate_scan_worker(
            job_id=job_id,
            spreadsheet_id=SPREADSHEET_ID,
            worksheet_name="Sheet1",
            key_columns=["Email"],
            oauth_key=None,
        )

    completed_job = job_store.get_job(job_id)
    assert completed_job is not None
    assert completed_job["status"] == "completed"
    result = completed_job["result"]
    assert result["total_rows_scanned"] == 4
    assert result["duplicate_count"] == 1
    dup = result["duplicates"][0]
    assert dup["row_index"] == 4  # row 1=header, Alice=2, Bob=3, Alice Duplicate=4
    assert dup["duplicate_of_row"] == 2
