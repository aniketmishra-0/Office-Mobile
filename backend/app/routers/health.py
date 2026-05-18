from fastapi import APIRouter


router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "2026-05-18-v2"}


@router.get("/debug/form/{form_id}")
def debug_form(form_id: str) -> dict:
    """Temporary debug endpoint to diagnose form loading issues."""
    from app.services import form_store
    from app.db import fetchone
    import traceback

    try:
        row = fetchone("SELECT id, form_title, fields_json, ui_config_json FROM forms WHERE id = %s", (form_id,))
        if row is None:
            return {"error": "not found"}

        # Try to parse fields
        fields_raw = row.get("fields_json")
        fields_type = type(fields_raw).__name__

        try:
            record = form_store.get_form(form_id)
            fields_parsed = True
            fields_count = len(record["fields"]) if record else 0
        except Exception as e:
            fields_parsed = False
            fields_count = 0
            fields_error = f"{type(e).__name__}: {str(e)[:300]}"
            return {
                "form_id": form_id,
                "form_title": row.get("form_title"),
                "fields_type": fields_type,
                "fields_parsed": False,
                "parse_error": fields_error,
                "traceback": traceback.format_exc()[-500:],
            }

        return {
            "form_id": form_id,
            "form_title": row.get("form_title"),
            "fields_type": fields_type,
            "fields_parsed": True,
            "fields_count": fields_count,
            "ui_config_type": type(row.get("ui_config_json")).__name__,
        }
    except Exception as e:
        return {"error": f"{type(e).__name__}: {str(e)[:300]}", "traceback": traceback.format_exc()[-500:]}
