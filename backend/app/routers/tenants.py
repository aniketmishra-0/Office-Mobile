"""
Tenants and workspace management router for Phase 5 Multi-tenancy.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.limiter import limiter
from app.services import tenant_store
from app.services.session_context import get_current_oauth_session_key

router = APIRouter(prefix="/api/tenants", tags=["Tenants"])


class CreateTenantRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: Optional[str] = Field(default=None, max_length=50)

    model_config = {"extra": "ignore"}


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    role: Optional[str] = None
    created_at: str
    updated_at: str


class AddMemberRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=200)
    role: str = Field(default="member", pattern="^(owner|admin|editor|viewer|member)$")

    model_config = {"extra": "ignore"}


class MemberResponse(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    role: str
    joined_at: str


@router.get("", response_model=list[TenantResponse])
async def list_tenants(request: Request):
    """List all workspace tenants accessible to the current user."""
    oauth_key = get_current_oauth_session_key() or "default"
    # Ensure user has at least their personal workspace
    tenant_store.get_or_create_personal_tenant(oauth_key)
    tenants = tenant_store.list_user_tenants(oauth_key)
    return [TenantResponse(**t) for t in tenants]


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_new_tenant(request: Request, payload: CreateTenantRequest = Body(...)):
    """Create a new team/organization workspace."""
    oauth_key = get_current_oauth_session_key() or "default"
    tenant = tenant_store.create_tenant(
        name=payload.name,
        slug=payload.slug,
        owner_email=oauth_key,
    )
    tenant["role"] = "owner"
    return TenantResponse(**tenant)


@router.get("/{tenant_id}/members", response_model=list[MemberResponse])
async def list_members(tenant_id: str, request: Request):
    """List all members of a tenant workspace."""
    tenant = tenant_store.get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found")

    members = tenant_store.list_tenant_members(tenant_id)
    return [MemberResponse(**m) for m in members]


@router.post("/{tenant_id}/members", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def add_member(tenant_id: str, request: Request, payload: AddMemberRequest = Body(...)):
    """Add a member with a role to a tenant workspace."""
    tenant = tenant_store.get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found")

    result = tenant_store.add_tenant_member(
        tenant_id=tenant_id,
        email=payload.email,
        role=payload.role,
    )
    return {"success": True, "member": result}


@router.delete("/{tenant_id}/members/{email}")
async def remove_member(tenant_id: str, email: str, request: Request):
    """Remove a member from a tenant workspace."""
    tenant = tenant_store.get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found")

    removed = tenant_store.remove_tenant_member(tenant_id=tenant_id, email=email)
    if not removed:
        raise HTTPException(status_code=404, detail="Member not found in tenant")
    return {"success": True, "message": f"Member '{email}' removed from workspace"}
