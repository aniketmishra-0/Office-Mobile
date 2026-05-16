from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from app.services.sheets_client import _oauth_credentials, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])

# Hard limits for uploads so a single request can't exhaust memory or Drive
# quota. 10 MB handles typical photos/receipts. Raise carefully if needed.
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# MIME allowlist — only media types users can reasonably attach to forms.
# Executable, archive, and script types are explicitly rejected.
_ALLOWED_MIME_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
})


def get_drive_service():
    """Build the Google Drive API service using available credentials."""
    oauth_creds = _oauth_credentials()
    if oauth_creds is not None:
        return build("drive", "v3", credentials=oauth_creds, cache_discovery=False)

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
            return build("drive", "v3", credentials=creds, cache_discovery=False)
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
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    raise HTTPException(
        status_code=500,
        detail="No Google credentials available for uploading files.",
    )


def _safe_filename(original: str | None) -> str:
    """Strip directory components and bad characters from an uploaded filename.

    We never trust the client-supplied name — the final stored name is a UUID
    prefix plus a sanitized basename, bounded in length.
    """
    if not original:
        return "upload"
    # Keep only the final component; drop any path parts a malicious client
    # might send (e.g. "../../etc/passwd").
    base = original.replace("\\", "/").rsplit("/", 1)[-1]
    # Remove control characters and anything outside a conservative allowlist.
    safe = "".join(c for c in base if c.isalnum() or c in (".", "-", "_", " "))
    safe = safe.strip().lstrip(".")[:100]  # cap length, forbid hidden-dot prefix
    return safe or "upload"


def _safe_folder_name(name: str | None) -> str:
    """Sanitize a folder name for Google Drive."""
    if not name:
        return "OfficeMobile Uploads"
    safe = "".join(c for c in name if c.isalnum() or c in (" ", "-", "_", "."))
    safe = safe.strip()[:100]
    return safe or "OfficeMobile Uploads"


def _get_or_create_folder(service, folder_name: str) -> str:
    """Find an existing folder by name or create a new one. Returns folder ID."""
    safe_name = _safe_folder_name(folder_name)

    # Search for existing folder with this name
    query = (
        f"name = '{safe_name}' and "
        "mimeType = 'application/vnd.google-apps.folder' and "
        "trashed = false"
    )
    results = (
        service.files()
        .list(q=query, spaces="drive", fields="files(id, name)", pageSize=1)
        .execute()
    )
    files = results.get("files", [])
    if files:
        return files[0]["id"]

    # Create the folder
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
):
    """Upload a file to Google Drive and return a shareable link.

    Files are organized into a folder named after the sheet/form title.

    Enforces:
      - strict MIME allowlist
      - size cap (10 MB)
      - sanitized filename (never trusts client input)
      - neutral error messages (internal details are logged, not returned)
    """
    # Validate MIME type before we touch the file contents.
    content_type = (file.content_type or "").lower().strip()
    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Only images and PDFs are allowed.",
        )

    # Peek at the first byte of the stream to compute the size without
    # loading the whole body into memory. UploadFile uses SpooledTemporaryFile
    # under the hood so .seek() is cheap.
    try:
        file.file.seek(0, 2)  # seek to end
        size = file.file.tell()
        file.file.seek(0)
    except Exception:
        size = 0

    if size > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File is too large. Maximum size is 10 MB.",
        )

    try:
        service = get_drive_service()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("drive.service_init_failed")
        raise HTTPException(status_code=500, detail="Upload service unavailable") from exc

    safe_name = _safe_filename(file.filename)
    unique_filename = f"officemobile_{uuid.uuid4().hex[:12]}_{safe_name}"

    # Create or find the folder for this sheet
    file_metadata: dict = {"name": unique_filename}

    try:
        def _do_upload():
            # Get or create folder named after the sheet
            if folder_name:
                folder_id = _get_or_create_folder(service, folder_name)
                file_metadata["parents"] = [folder_id]

            media = MediaIoBaseUpload(file.file, mimetype=content_type, resumable=True)
            uploaded_file = (
                service.files()
                .create(body=file_metadata, media_body=media, fields="id, webViewLink")
                .execute()
            )
            file_id = uploaded_file.get("id")

            # Make the file publicly viewable via link.
            service.permissions().create(
                fileId=file_id,
                body={"type": "anyone", "role": "reader"},
            ).execute()

            return uploaded_file

        uploaded_file = await asyncio.to_thread(_do_upload)
        return {"success": True, "url": uploaded_file.get("webViewLink")}
    except HTTPException:
        raise
    except Exception as exc:
        # Log the real exception for ops, but don't leak Google API internals.
        logger.exception("drive.upload_failed")
        raise HTTPException(
            status_code=502, detail="Failed to upload file to Google Drive"
        ) from exc
