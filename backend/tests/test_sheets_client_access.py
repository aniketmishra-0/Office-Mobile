from __future__ import annotations

from unittest.mock import Mock

from app.services import sheets_client


def test_read_headers_prefers_public_access(monkeypatch):
    public_result = ("Public Title", "Sheet1", ["Name", "Email"])

    public_mock = Mock(return_value=public_result)
    auth_mock = Mock(side_effect=AssertionError("authenticated path should not be used"))

    monkeypatch.setattr(sheets_client, "_has_credentials", lambda: True)
    monkeypatch.setattr(sheets_client, "read_headers_public", public_mock)
    monkeypatch.setattr(sheets_client, "read_headers_authenticated", auth_mock)

    assert sheets_client.read_headers("spreadsheet-id", "Sheet1") == public_result
    assert public_mock.call_count == 1


def test_read_headers_falls_back_to_authenticated_when_public_fails(monkeypatch):
    public_mock = Mock(side_effect=sheets_client.PublicSheetError("not public"))
    auth_result = ("Private Title", "Sheet2", ["A", "B"])
    auth_mock = Mock(return_value=auth_result)

    monkeypatch.setattr(sheets_client, "_has_credentials", lambda: True)
    monkeypatch.setattr(sheets_client, "read_headers_public", public_mock)
    monkeypatch.setattr(sheets_client, "read_headers_authenticated", auth_mock)

    assert sheets_client.read_headers("spreadsheet-id", "Sheet2") == auth_result
    assert public_mock.call_count == 1
    assert auth_mock.call_count == 1


def test_list_worksheet_names_prefers_public_export(monkeypatch):
    public_mock = Mock(return_value=["Sheet1", "Sheet2"])

    monkeypatch.setattr(sheets_client, "_read_public_sheet_names", public_mock)
    monkeypatch.setattr(sheets_client, "_has_credentials", lambda: True)

    assert sheets_client.list_worksheet_names("spreadsheet-id") == ["Sheet1", "Sheet2"]


def test_check_sheet_access_keeps_public_read_even_without_auth(monkeypatch):
    sheets_client._ACCESS_CACHE.clear()
    monkeypatch.setattr(sheets_client, "_fetch_gviz_json", lambda _sid, _ws: {"table": {"cols": []}})
    monkeypatch.setattr(sheets_client, "_has_credentials", lambda: False)
    monkeypatch.setattr(sheets_client.form_store, "get_cached_sheet_access", lambda _sid, _sk: None)
    monkeypatch.setattr(sheets_client.form_store, "set_cached_sheet_access", lambda *a, **kw: None)

    assert sheets_client.check_sheet_access("spreadsheet-id") == {"read": True, "edit": False}


def test_check_sheet_access_reports_authenticated_edit_when_public_read_exists(monkeypatch):
    sheets_client._ACCESS_CACHE.clear()
    monkeypatch.setattr(sheets_client, "_fetch_gviz_json", lambda _sid, _ws: {"table": {"cols": []}})
    monkeypatch.setattr(sheets_client, "_has_credentials", lambda: True)
    monkeypatch.setattr(
        sheets_client,
        "_authenticated_sheet_access",
        lambda _sid: {"read": True, "edit": True},
    )
    monkeypatch.setattr(sheets_client.form_store, "get_cached_sheet_access", lambda _sid, _sk: None)
    monkeypatch.setattr(sheets_client.form_store, "set_cached_sheet_access", lambda *a, **kw: None)

    assert sheets_client.check_sheet_access("spreadsheet-id") == {"read": True, "edit": True}


def test_check_sheet_access_uses_db_cache_without_calling_google(monkeypatch):
    sheets_client._ACCESS_CACHE.clear()
    # Mock DB returning cached edit access
    monkeypatch.setattr(
        sheets_client.form_store,
        "get_cached_sheet_access",
        lambda _sid, _sk: {"read": True, "edit": True},
    )
    # If Google API were called, this would raise
    monkeypatch.setattr(
        sheets_client,
        "_fetch_gviz_json",
        Mock(side_effect=AssertionError("Google API should not be called when DB cached")),
    )
    monkeypatch.setattr(
        sheets_client,
        "_authenticated_sheet_access",
        Mock(side_effect=AssertionError("Google API should not be called when DB cached")),
    )

    result = sheets_client.check_sheet_access("cached-sheet-id")
    assert result == {"read": True, "edit": True}


def test_check_sheet_access_force_refresh_bypasses_db_cache(monkeypatch):
    sheets_client._ACCESS_CACHE.clear()
    monkeypatch.setattr(
        sheets_client.form_store,
        "get_cached_sheet_access",
        lambda _sid, _sk: {"read": True, "edit": False},
    )
    monkeypatch.setattr(sheets_client, "_fetch_gviz_json", lambda _sid, _ws: {"table": {"cols": []}})
    monkeypatch.setattr(sheets_client, "_has_credentials", lambda: True)
    monkeypatch.setattr(
        sheets_client,
        "_authenticated_sheet_access",
        lambda _sid: {"read": True, "edit": True},
    )
    saved_mock = Mock()
    monkeypatch.setattr(sheets_client.form_store, "set_cached_sheet_access", saved_mock)

    result = sheets_client.check_sheet_access("cached-sheet-id", force_refresh=True)
    assert result == {"read": True, "edit": True}
    assert saved_mock.call_count == 1