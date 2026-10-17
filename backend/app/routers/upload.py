from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from app.services import form_store, session_context
from app.services.sheets_client import _oauth_credentials, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])

# Hard limits for uploads: 25 MB handles typical photos/receipts/PDFs/documents.
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# MIME allowlist — media and document types users can reasonably attach to forms.
_ALLOWED_MIME_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
})


def _build_oauth_credentials_for_key(oauth_key: str) -> Any | None:
    """Build and proactively refresh google-auth credentials for a given oauth_key."""
    token = form_store.get_oauth_token(oauth_key)
    if not token:
        return None
    settings = get_settings()
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        return None
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2.credentials import Credentials
        from app.routers.auth import SCOPES

        creds = Credentials(
            token=token.get("access_token"),
            refresh_token=token.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_oauth_client_id,
            client_secret=settings.google_oauth_client_secret,
            scopes=SCOPES,
        )
        if creds.refresh_token and (
            not creds.token or not creds.valid or creds.expired
        ):
            creds.refresh(GoogleRequest())
            refreshed = dict(token)
            refreshed["access_token"] = creds.token
            if getattr(creds, "expiry", None):
                refreshed["expires_at"] = int(creds.expiry.timestamp())
            form_store.set_oauth_token(refreshed, key=oauth_key)
        return creds
    except Exception as exc:
        logger.warning("oauth.build_credentials_failed for key %s: %s", oauth_key, exc)
        return None


def get_drive_service(form_id: str | None = None) -> tuple[Any, dict[str, Any] | None]:
    """Build the Google Drive API service.

    Priority:
    1. Form owner's OAuth token if form_id is provided (uploads go directly to the form owner's Drive)
    2. Active session OAuth token from session context
    3. Stored OAuth credentials
    4. Service account credentials fallback
    """
    form_record: dict[str, Any] | None = None
    if form_id:
        try:
            form_record = form_store.get_form(form_id)
            if form_record and form_record.get("oauth_key"):
                creds = _build_oauth_credentials_for_key(form_record["oauth_key"])
                if creds:
                    logger.info("drive.service: using form owner oauth credentials for form_id=%s", form_id)
                    return build("drive", "v3", credentials=creds, cache_discovery=False), form_record
        except Exception as exc:
            logger.warning("drive.get_form_owner_creds_failed: %s", exc)

    session_key = session_context.get_current_oauth_session_key()
    if session_key:
        creds = _build_oauth_credentials_for_key(session_key)
        if creds:
            logger.info("drive.service: using session oauth credentials key=%s", session_key)
            return build("drive", "v3", credentials=creds, cache_discovery=False), form_record

    oauth_creds = _oauth_credentials()
    if oauth_creds is not None:
        return build("drive", "v3", credentials=oauth_creds, cache_discovery=False), form_record

    settings = get_settings()

    if settings.google_service_account_json:
        import json
        from google.oauth2.service_account import Credentials

        try:
            credentials_dict = json.loads(settings.google_service_account_json)
            scopes = ["https://www.googleapis.com/auth/drive.file"]
            creds = Credentials.from_service_account_info(
                credentials_dict, scopes=scopes
            )
            return build("drive", "v3", credentials=creds, cache_discovery=False), form_record
        except Exception as e:
            logger.error("drive.service_account_load_failed: %s", e)
            raise HTTPException(
                status_code=500, detail="Invalid service account configuration"
            )

    if settings.google_service_account_file:
        from google.oauth2.service_account import Credentials

        scopes = ["https://www.googleapis.com/auth/drive.file"]
        creds = Credentials.from_service_account_file(
            settings.google_service_account_file, scopes=scopes
        )
        return build("drive", "v3", credentials=creds, cache_discovery=False), form_record

    raise HTTPException(
        status_code=500,
        detail="No Google credentials available for uploading files.",
    )


def _safe_filename(original: str | None) -> str:
    """Strip directory components and bad characters from an uploaded filename."""
    if not original:
        return "upload"
    base = original.replace("\\", "/").rsplit("/", 1)[-1]
    safe = "".join(c for c in base if c.isalnum() or c in (".", "-", "_", " "))
    safe = safe.strip().lstrip(".")[:100]
    return safe or "upload"


def _safe_folder_name(name: str | None) -> str:
    """Sanitize a folder name for Google Drive, removing characters that break queries."""
    if not name:
        return "OfficeMobile Uploads"
    cleaned = name.replace("'", "").replace('"', "").replace("\\", "")
    safe = "".join(c for c in cleaned if c.isalnum() or c in (" ", "-", "_", "."))
    safe = safe.strip()[:100]
    return safe or "OfficeMobile Uploads"


def _get_or_create_folder(service, folder_name: str) -> str:
    """Find an existing folder by name or create a new one on Google Drive. Returns folder ID."""
    safe_name = _safe_folder_name(folder_name)

    query = (
        f"name = '{safe_name}' and "
        "mimeType = 'application/vnd.google-apps.folder' and "
        "trashed = false"
    )
    try:
        results = (
            service.files()
            .list(q=query, spaces="drive", fields="files(id, name)", pageSize=1)
            .execute()
        )
        files = results.get("files", [])
        if files:
            return files[0]["id"]
    except Exception as exc:
        logger.warning("drive.folder_list_failed for %s: %s", safe_name, exc)

    # Create the folder in Google Drive
    folder_metadata = {
        "name": safe_name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    folder = (
        service.files()
        .create(body=folder_metadata, fields="id")
        .execute()
    )
    return folder["id"]


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_name: str | None = Form(default=None),
    form_id: str | None = Form(default=None),
):
    """Upload a file to Google Drive and return a shareable link.

    Files are stored in the form owner's Google Drive inside a folder named after the sheet/form.
    """
    content_type = (file.content_type or "").lower().strip()
    if not content_type or content_type == "application/octet-stream":
        import mimetypes
        guessed, _ = mimetypes.guess_type(file.filename or "")
        if guessed:
            content_type = guessed.lower()

    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Allowed: images (JPG, PNG, GIF, WEBP), PDF, Word (.docx, .doc), text files.",
        )

    try:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
    except Exception:
        size = 0

    if size > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File is too large. Maximum size is 15 MB.",
        )

    try:
        service, form_record = get_drive_service(form_id=form_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("drive.service_init_failed")
        raise HTTPException(status_code=500, detail="Upload service unavailable") from exc

    # Determine folder name: Form owner's sheet title / form title takes precedence
    target_folder_name = folder_name
    if form_record:
        target_folder_name = form_record.get("form_title") or folder_name or form_record.get("worksheet_name")
    if not target_folder_name:
        target_folder_name = "OfficeMobile Uploads"

    safe_name = _safe_filename(file.filename)
    # Store with clean original filename on user's Google Drive (no branding prefix)
    file_metadata: dict[str, Any] = {"name": safe_name}

    try:
        def _do_upload():
            folder_id = _get_or_create_folder(service, target_folder_name)
            file_metadata["parents"] = [folder_id]

            media = MediaIoBaseUpload(file.file, mimetype=content_type, resumable=True)
            uploaded_file = (
                service.files()
                .create(body=file_metadata, media_body=media, fields="id, webViewLink, webContentLink")
                .execute()
            )
            file_id = uploaded_file.get("id")

            # Make the file publicly viewable via link so anyone with the sheet link can view it
            try:
                service.permissions().create(
                    fileId=file_id,
                    body={"type": "anyone", "role": "reader"},
                ).execute()
            except Exception as perm_err:
                logger.warning("drive.permission_set_failed: %s", perm_err)

            return uploaded_file

        uploaded_file = await asyncio.to_thread(_do_upload)
        file_url = uploaded_file.get("webViewLink") or uploaded_file.get("webContentLink") or ""
        return {"success": True, "url": file_url, "file_name": safe_name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("drive.upload_failed")
        raise HTTPException(
            status_code=502, detail=f"Failed to upload file to Google Drive: {exc}"
        ) from exc
