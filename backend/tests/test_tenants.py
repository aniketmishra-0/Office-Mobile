"""
Tests for Phase 5: Multi-Tenancy
Validates tenant CRUD, personal workspace provisioning, member role management,
and tenant REST endpoints under /api/tenants.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import tenant_store


@pytest.fixture(scope="module", autouse=True)
def setup_tenants_table():
    tenant_store.init_tenants_tables()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_tenant_store_lifecycle():
    """Verify create, get, list, and member management in tenant_store."""
    owner_email = "owner@example.com"
    tenant = tenant_store.create_tenant(
        name="Acme Corp",
        slug="acme-test",
        owner_email=owner_email,
    )
    assert tenant["id"] is not None
    assert tenant["name"] == "Acme Corp"
    assert tenant["slug"].startswith("acme-test")

    # Fetch tenant
    fetched = tenant_store.get_tenant(tenant["id"])
    assert fetched is not None
    assert fetched["name"] == "Acme Corp"

    # Add member
    member_email = "teammate@example.com"
    added = tenant_store.add_tenant_member(
        tenant_id=tenant["id"],
        email=member_email,
        role="editor",
    )
    assert added["role"] == "editor"
    assert added["email"] == member_email

    # List members
    members = tenant_store.list_tenant_members(tenant["id"])
    member_emails = [m["email"] for m in members]
    assert owner_email in member_emails
    assert member_email in member_emails

    # List user's tenants
    user_tenants = tenant_store.list_user_tenants(owner_email)
    assert any(t["id"] == tenant["id"] for t in user_tenants)

    # Remove member
    removed = tenant_store.remove_tenant_member(tenant["id"], member_email)
    assert removed is True
    remaining_members = tenant_store.list_tenant_members(tenant["id"])
    assert member_email not in [m["email"] for m in remaining_members]


def test_get_or_create_personal_tenant():
    """Verify default personal workspace creation for users."""
    email = "solouser@example.com"
    tenant1 = tenant_store.get_or_create_personal_tenant(email)
    assert tenant1 is not None
    assert "solouser" in tenant1["name"].lower()

    # Calling again returns the same personal tenant
    tenant2 = tenant_store.get_or_create_personal_tenant(email)
    assert tenant1["id"] == tenant2["id"]


def test_list_tenants_api(client):
    """GET /api/tenants returns the user's workspaces."""
    resp = client.get("/api/tenants")
    assert resp.status_code == 200
    tenants = resp.json()
    assert isinstance(tenants, list)
    assert len(tenants) >= 1


def test_create_tenant_api(client):
    """POST /api/tenants creates a new organization workspace."""
    payload = {"name": "Design Studio", "slug": "design-studio"}
    resp = client.post("/api/tenants", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Design Studio"
    assert "design-studio" in data["slug"]
    assert data["role"] == "owner"


def test_tenant_member_endpoints(client):
    """Test member listing, adding, and removing via API."""
    # Create tenant
    create_resp = client.post("/api/tenants", json={"name": "Sales Team"})
    tenant_id = create_resp.json()["id"]

    # Add member
    add_resp = client.post(
        f"/api/tenants/{tenant_id}/members",
        json={"email": "sales_lead@example.com", "role": "admin"},
    )
    assert add_resp.status_code == 201
    assert add_resp.json()["success"] is True

    # List members
    list_resp = client.get(f"/api/tenants/{tenant_id}/members")
    assert list_resp.status_code == 200
    members = list_resp.json()
    assert any(m["email"] == "sales_lead@example.com" and m["role"] == "admin" for m in members)

    # Delete member
    del_resp = client.delete(f"/api/tenants/{tenant_id}/members/sales_lead@example.com")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True
