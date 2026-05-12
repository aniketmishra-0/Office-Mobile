"""
Integration tests for the FastAPI routers (health + forms).

Strategy
--------
* Use fastapi.testclient.TestClient (synchronous) — no async plumbing needed.
* Mock `read_headers` and `append_form_row` at the point they are *used*
  (i.e. `app.routers.forms.*`) so the real Google Sheets API is never called.
* A module-scoped `sample_form` fixture creates one form in the shared SQLite
  DB and returns its CreateFormResponse dict for reuse across tests.
* Submit tests are intentionally ordered *before* the update test so the
  form still has its original required 'email' field when they run.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ---------------------------------------------------------------------------
# Constants shared across the test module
# ---------------------------------------------------------------------------

SPREADSHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit"

# Two-field schema used when creating the sample form:
#   - full_name  (text,  not required)
#   - email      (email, required)   ← drives the required-field-missing test
SAMPLE_FIELDS = [
    {
        "key": "full_name",
        "source_header": "Full Name",
        "label": "Full Name",
        "type": "text",
        "required": False,
        "order": 0,
        "column_index": 0,
        "placeholder": "Enter full name",
    },
    {
        "key": "email",
        "source_header": "Email*",
        "label": "Email",
        "type": "email",
        "required": True,
        "order": 1,
        "column_index": 1,
        "placeholder": "Enter email",
    },
]


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    """
    Yield a TestClient that triggers the app lifespan (init_db is called).
    The underlying SQLite DB is created in ./data/forms.db relative to the
    pytest working directory and is shared for the entire module run.
    """
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def sample_form(client):
    """
    Create one form in the DB for use across multiple tests.
    Returns the JSON body of POST /api/forms (id, edit_token, form_url, edit_url).
    """
    payload = {
        "sheet_url": SHEET_URL,
        "spreadsheet_id": SPREADSHEET_ID,
        "worksheet_name": "Sheet1",
        "form_title": "Router Test Form",
        "fields": SAMPLE_FIELDS,
        "custom_keywords": [],
    }
    response = client.post("/api/forms", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


# ===========================================================================
# 1. Health
# ===========================================================================


class TestHealth:
    def test_get_health_returns_ok(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


# ===========================================================================
# 2. Sheet preview
# ===========================================================================


class TestPreview:
    def test_invalid_url_returns_400(self, client):
        """A URL that can't be parsed as a Google Sheets link → 400."""
        response = client.post(
            "/api/sheet/preview",
            json={
                "sheet_url": "https://example.com/not-a-sheet",
                "custom_keywords": [],
            },
        )
        assert response.status_code == 400

    def test_valid_headers_return_correct_field_schema(self, client):
        """
        When read_headers is mocked, the endpoint must:
        - Return the spreadsheet_id, title, worksheet_name.
        - Apply custom_keywords when inferring field types.
        - Mark headers ending with * as required.
        """
        mock_headers = ["Full Name", "Aadhaar Number", "Email*"]
        mock_return = ("Test Spreadsheet", "Sheet1", mock_headers)

        with patch("app.routers.forms.read_headers", return_value=mock_return):
            response = client.post(
                "/api/sheet/preview",
                json={
                    "sheet_url": SHEET_URL,
                    "worksheet_name": None,
                    "custom_keywords": [{"keyword": "aadhaar", "type": "number"}],
                },
            )

        assert response.status_code == 200
        data = response.json()

        assert data["spreadsheet_id"] == SPREADSHEET_ID
        assert data["spreadsheet_title"] == "Test Spreadsheet"
        assert data["worksheet_name"] == "Sheet1"

        fields = data["fields"]
        assert len(fields) == 3

        # Custom keyword 'aadhaar' → 'number' must be applied
        aadhaar_field = next(f for f in fields if "aadhaar" in f["label"].lower())
        assert aadhaar_field["type"] == "number"

        # Email* must be required and typed as 'email'
        email_field = next(f for f in fields if f["key"] == "email")
        assert email_field["required"] is True
        assert email_field["type"] == "email"

        # Custom keywords echo back in the response
        assert len(data["custom_keywords"]) == 1
        assert data["custom_keywords"][0]["keyword"] == "aadhaar"


# ===========================================================================
# 3. Create form
# ===========================================================================


class TestCreateForm:
    def test_returns_id_edit_token_form_url_and_edit_url(self, client, sample_form):
        """The create response must carry all four envelope fields."""
        assert "id" in sample_form
        assert "edit_token" in sample_form

        form_id = sample_form["id"]
        assert sample_form["form_url"] == f"/f/{form_id}"
        assert sample_form["edit_url"].startswith(f"/edit/{form_id}?token=")


# ===========================================================================
# 4. Get public form
# ===========================================================================


class TestGetPublicForm:
    def test_returns_public_form_data(self, client, sample_form):
        form_id = sample_form["id"]
        response = client.get(f"/api/forms/{form_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == form_id
        assert data["form_title"] == "Router Test Form"
        assert len(data["fields"]) == 2

    def test_unknown_id_returns_404(self, client):
        response = client.get("/api/forms/doesnotexist000")
        assert response.status_code == 404


# ===========================================================================
# 5. Get edit form
# ===========================================================================


class TestGetEditForm:
    def test_correct_token_returns_full_edit_data(self, client, sample_form):
        form_id = sample_form["id"]
        token = sample_form["edit_token"]
        response = client.get(f"/api/forms/{form_id}/edit?token={token}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == form_id
        assert data["sheet_url"] == SHEET_URL
        assert data["spreadsheet_id"] == SPREADSHEET_ID
        assert data["worksheet_name"] == "Sheet1"
        assert data["form_title"] == "Router Test Form"
        assert len(data["fields"]) == 2

    def test_wrong_token_returns_403(self, client, sample_form):
        form_id = sample_form["id"]
        # Token is long enough to pass Query(min_length=16) but wrong value
        response = client.get(f"/api/forms/{form_id}/edit?token=wrongtokenwrongtoken")
        assert response.status_code == 403


# ===========================================================================
# 6. Submit form   (ordered BEFORE update so the required email field exists)
# ===========================================================================


class TestSubmitForm:
    def test_valid_submission_returns_success(self, client, sample_form):
        form_id = sample_form["id"]

        with patch("app.routers.forms.append_form_row", return_value="Sheet1!A2:B2"):
            response = client.post(
                f"/api/forms/{form_id}/submit",
                json={"values": {"full_name": "Jane Doe", "email": "jane@example.com"}},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["updated_range"] == "Sheet1!A2:B2"
        assert "timestamp" in data

    def test_unknown_field_key_returns_400(self, client, sample_form):
        """Submitting a key that is not in the form schema must be rejected."""
        form_id = sample_form["id"]

        response = client.post(
            f"/api/forms/{form_id}/submit",
            json={"values": {"nonexistent_field": "some value"}},
        )

        assert response.status_code == 400
        assert "unknown field key" in response.json()["detail"].lower()

    def test_required_field_missing_returns_400(self, client, sample_form):
        """Omitting a required field must return 400 with the field label in the detail."""
        form_id = sample_form["id"]

        # 'email' is required but not supplied
        response = client.post(
            f"/api/forms/{form_id}/submit",
            json={"values": {"full_name": "Jane Doe"}},
        )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "required" in detail.lower()
        # The field label ("Email") must appear in the message
        assert "email" in detail.lower()


# ===========================================================================
# 7. Update form   (ordered LAST to avoid mutating state consumed by earlier tests)
# ===========================================================================


class TestUpdateForm:
    def test_update_title_and_fields_returns_success(self, client, sample_form):
        form_id = sample_form["id"]
        token = sample_form["edit_token"]

        # Keep both fields so that the DB record stays consistent for any
        # future assertions; only the title is changed.
        payload = {
            "edit_token": token,
            "form_title": "Updated Form Title",
            "fields": SAMPLE_FIELDS,
            "custom_keywords": [],
        }
        response = client.put(f"/api/forms/{form_id}", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["id"] == form_id

    def test_update_persists_new_title(self, client, sample_form):
        """Verify the updated title is visible via the public endpoint."""
        form_id = sample_form["id"]
        get_response = client.get(f"/api/forms/{form_id}")
        assert get_response.status_code == 200
        assert get_response.json()["form_title"] == "Updated Form Title"

    def test_wrong_token_returns_403(self, client, sample_form):
        form_id = sample_form["id"]
        payload = {
            "edit_token": "wrongtokenwrongtoken",  # 20 chars, meets min_length=16
            "form_title": "Should Not Save",
            "fields": SAMPLE_FIELDS,
            "custom_keywords": [],
        }
        response = client.put(f"/api/forms/{form_id}", json=payload)
        assert response.status_code == 403
