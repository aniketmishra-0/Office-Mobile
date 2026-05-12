import re


SHEET_ID_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")
RAW_ID_RE = re.compile(r"^[a-zA-Z0-9-_]{20,}$")


class InvalidGoogleSheetUrl(ValueError):
    pass


def extract_spreadsheet_id(sheet_url: str) -> str:
    value = sheet_url.strip()
    if not value:
        raise InvalidGoogleSheetUrl("Google Sheet URL is required")

    sheet_match = SHEET_ID_RE.search(value)
    if sheet_match:
        return sheet_match.group(1)

    if RAW_ID_RE.match(value):
        return value

    raise InvalidGoogleSheetUrl("Paste a valid Google Sheets URL or spreadsheet ID")
