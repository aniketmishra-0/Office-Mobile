import re


# Google Sheets spreadsheet IDs are base64url-ish: letters, digits, - and _.
# Real IDs are 44 characters; we allow a conservative 20–80 range to be
# future-proof while rejecting obvious junk.
SHEET_ID_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9_-]{20,80})")
RAW_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{20,80}$")

# Upper bound on the URL we will even try to parse. Real URLs are well under
# 1 kB; anything larger is abuse or malformed input.
_MAX_URL_LENGTH = 2000


class InvalidGoogleSheetUrl(ValueError):
    pass


def extract_spreadsheet_id(sheet_url: str) -> str:
    value = (sheet_url or "").strip()
    if not value:
        raise InvalidGoogleSheetUrl("Google Sheet URL is required")
    if len(value) > _MAX_URL_LENGTH:
        raise InvalidGoogleSheetUrl("URL is too long to be a Google Sheet link")

    sheet_match = SHEET_ID_RE.search(value)
    if sheet_match:
        return sheet_match.group(1)

    if RAW_ID_RE.match(value):
        return value

    raise InvalidGoogleSheetUrl("Paste a valid Google Sheets URL or spreadsheet ID")
