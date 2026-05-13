import json
import gspread
from gspread.exceptions import APIError
from app.services.sheets_client import get_client

try:
    client = get_client()
    # Try a fake ID
    client.open_by_key("1nOm-fmhl1VauKu2pytySjQ9V4xZ1H_Z")
except Exception as e:
    print(f"Exception type: {type(e)}")
    print(f"Exception: {e}")
    if isinstance(e, APIError):
        print("Response:", getattr(e, "response", None))
        try:
            print("Status code:", e.response.status_code)
        except:
            print("No status_code attribute on response")
