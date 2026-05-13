import sys
sys.path.insert(0, ".")
from app.services.form_store import init_db, find_forms_by_spreadsheet
from app.services.sheets_client import list_worksheet_names

init_db()

# Spreadsheet ID derived from the screenshot URL
sid = "1KlKuORorQvUkNFNzG4LRK1AMJqNAqG5BvaSXlP98Mn4"

try:
    tabs = list_worksheet_names(sid)
    print("TABS:", tabs)
except Exception as e:
    print("ERR listing tabs:", type(e).__name__, str(e)[:200])

forms = find_forms_by_spreadsheet(sid)
print("Forms in DB for sheet:", len(forms))
for f in forms[:15]:
    ws = f.get("worksheet_name")
    print(" - ws=", repr(ws), "id=", f["id"])
