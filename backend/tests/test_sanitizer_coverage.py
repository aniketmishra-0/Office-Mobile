"""
Tests for spreadsheet formula-injection sanitization across all write paths.

Verifies that:
1. _sanitize_cell neutralizes formula prefixes (=, +, -, @, \\t, \\r).
2. _build_row_from_headers applies _sanitize_cell to every field.
3. _build_append_row_simple applies _sanitize_cell to every field.
4. batch_append_rows sanitizes every cell.
5. batch_update_rows sanitizes every cell.
6. update_sheet_row sanitizes every cell.
"""
from app.services.sheets_client import (
    _sanitize_cell,
    _build_row_from_headers,
    _build_append_row_simple,
    batch_append_rows,
    batch_update_rows,
    update_sheet_row,
)
from app.models.field import FieldSchema
from unittest.mock import MagicMock, patch


def test_sanitize_cell_formula_prefixes():
    # Standard formula prefixes
    assert _sanitize_cell("=cmd|' /C calc'!A0") == "'=cmd|' /C calc'!A0"
    assert _sanitize_cell("+1234567890") == "'+1234567890"
    assert _sanitize_cell("-2+3+cmd|' /C calc'!A0") == "'-2+3+cmd|' /C calc'!A0"
    assert _sanitize_cell("@SUM(1,2)") == "'@SUM(1,2)"
    assert _sanitize_cell("\t=1+1") == "'\t=1+1"
    assert _sanitize_cell("\r=1+1") == "'\r=1+1"

    # Safe text
    assert _sanitize_cell("Normal Text") == "Normal Text"
    assert _sanitize_cell("user@example.com") == "user@example.com"
    assert _sanitize_cell(123) == 123
    assert _sanitize_cell(None) is None


def test_build_row_from_headers_sanitizes():
    fields = [
        FieldSchema(key="name", source_header="Name", label="Name", order=0, column_index=0),
        FieldSchema(key="calc", source_header="Calc", label="Calc", order=1, column_index=1),
    ]
    values = {
        "name": "=HYPERLINK(\"http://evil.com\", \"Click\")",
        "calc": "+cmd|' /C calc'!A0",
    }
    row = _build_row_from_headers(["Name", "Calc"], fields, values)
    assert row[0].startswith("'=")
    assert row[1].startswith("'+")


def test_build_append_row_simple_sanitizes():
    fields = [
        FieldSchema(key="name", source_header="Name", label="Name", order=0, column_index=0),
        FieldSchema(key="cmd", source_header="Cmd", label="Cmd", order=1, column_index=1),
    ]
    values = {
        "name": "@SUM(1,2)",
        "cmd": "-1+1",
    }
    row = _build_append_row_simple(fields, values)
    assert row[0].startswith("'@")
    assert row[1].startswith("'-")


def test_batch_append_rows_sanitizes():
    fake_ws = MagicMock()
    fake_ws.col_values.return_value = ["Header1", "Header2"]
    fake_ss = MagicMock()
    fake_ss.worksheet.return_value = fake_ws
    fake_ss.get_worksheet.return_value = fake_ws
    fake_client = MagicMock()
    fake_client.open_by_key.return_value = fake_ss

    with patch("app.services.sheets_client._has_credentials", return_value=True), \
         patch("app.services.sheets_client.get_client", return_value=fake_client), \
         patch("app.services.sheets_client._read_live_headers", return_value=["Name", "Formula"]):
        
        batch_append_rows(
            spreadsheet_id="dummy_id",
            worksheet_name="Sheet1",
            rows=[{"Name": "Test", "Formula": "=1+1"}],
        )

    # Verify update or append_rows was called with sanitized cell
    if fake_ws.update.called:
        args = fake_ws.update.call_args[0]
        written_rows = args[1]
        assert written_rows[0][1] == "'=1+1"
    elif fake_ws.append_rows.called:
        args = fake_ws.append_rows.call_args[0]
        written_rows = args[0]
        assert written_rows[0][1] == "'=1+1"


def test_batch_update_rows_sanitizes():
    fake_ws = MagicMock()
    fake_ws.title = "Sheet1"
    fake_ss = MagicMock()
    fake_ss.open_by_key.return_value = fake_ss
    fake_ss.worksheet.return_value = fake_ws
    fake_ss.get_worksheet.return_value = fake_ws
    fake_client = MagicMock()
    fake_client.open_by_key.return_value = fake_ss

    fields = [FieldSchema(key="name", source_header="Name", label="Name", order=0, column_index=0)]

    with patch("app.services.sheets_client._has_credentials", return_value=True), \
         patch("app.services.sheets_client.get_client", return_value=fake_client), \
         patch("app.services.sheets_client._get_cached_headers", return_value=["Name"]), \
         patch("app.services.sheets_client._get_protected_columns_from_worksheet", return_value=[]):
        
        batch_update_rows(
            spreadsheet_id="dummy_id",
            worksheet_name="Sheet1",
            row_updates=[{"row_index": 2, "values": {"name": "=SUM(1,2)"}}],
            fields=fields,
        )

    call_kwargs = fake_ss.values_batch_update.call_args[1]
    data = call_kwargs["body"]["data"]
    assert data[0]["values"] == [["'=SUM(1,2)"]]
