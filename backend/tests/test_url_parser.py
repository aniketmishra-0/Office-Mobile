"""
Tests for app.utils.url_parser.extract_spreadsheet_id
"""
import pytest

from app.utils.url_parser import InvalidGoogleSheetUrl, extract_spreadsheet_id

# A real-looking spreadsheet ID: 44 alphanumeric + hyphens/underscores, >= 20 chars
VALID_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"


class TestExtractSpreadsheetId:
    # ------------------------------------------------------------------
    # Happy-path cases
    # ------------------------------------------------------------------

    def test_valid_full_url_with_gid_fragment(self):
        """Full Google Sheets URL including /edit#gid=0 fragment."""
        url = f"https://docs.google.com/spreadsheets/d/{VALID_ID}/edit#gid=0"
        assert extract_spreadsheet_id(url) == VALID_ID

    def test_valid_url_without_trailing_path(self):
        """URL that stops right after the spreadsheet ID, no /edit suffix."""
        url = f"https://docs.google.com/spreadsheets/d/{VALID_ID}"
        assert extract_spreadsheet_id(url) == VALID_ID

    def test_raw_spreadsheet_id_passthrough(self):
        """A bare spreadsheet ID (>= 20 alphanumeric chars) is returned as-is."""
        assert extract_spreadsheet_id(VALID_ID) == VALID_ID

    # ------------------------------------------------------------------
    # Error cases
    # ------------------------------------------------------------------

    def test_invalid_url_raises_invalid_google_sheet_url(self):
        """A non-Google-Sheets URL must raise InvalidGoogleSheetUrl."""
        with pytest.raises(InvalidGoogleSheetUrl):
            extract_spreadsheet_id("https://example.com/not-a-sheet")

    def test_empty_string_raises_invalid_google_sheet_url(self):
        """An empty string must raise InvalidGoogleSheetUrl."""
        with pytest.raises(InvalidGoogleSheetUrl):
            extract_spreadsheet_id("")

    def test_whitespace_only_raises_invalid_google_sheet_url(self):
        """A whitespace-only string must raise InvalidGoogleSheetUrl (stripped to empty)."""
        with pytest.raises(InvalidGoogleSheetUrl):
            extract_spreadsheet_id("   ")
