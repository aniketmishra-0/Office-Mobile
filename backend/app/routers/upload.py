from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from app.services.sheets_client import _oauth_credentials, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])


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
            creds = Credentials.from_service_account_info(credentials_dict, scopes=scopes)
            return build("drive", "v3", credentials=creds, cache_discovery=False)
        except Exception as e:
            logger.error(f"Failed to load service account JSON for Drive: {e}")
            raise HTTPException(status_code=500, detail="Invalid service account configuration")

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


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Uploads a file to Google Drive and makes it publicly viewable.
    Returns the webViewLink (shareable link).
    """
    try:
        service = get_drive_service()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        # Give the file a unique name to avoid conflicts
        unique_filename = f"office_mobile_upload_{uuid.uuid4().hex[:8]}_{file.filename}"
        
        file_metadata = {
            "name": unique_filename,
        }

        # Use MediaIoBaseUpload with the spooled file object
        media = MediaIoBaseUpload(file.file, mimetype=file.content_type, resumable=True)

        # Upload the file
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, webViewLink",
        ).execute()

        file_id = uploaded_file.get("id")
        
        # Make the file publicly viewable so it can be seen by anyone with the link
        permission = {
            "type": "anyone",
            "role": "reader",
        }
        service.permissions().create(
            fileId=file_id,
            body=permission,
        ).execute()

        return {
            "success": True,
            "url": uploaded_file.get("webViewLink")
        }

    except Exception as exc:
        logger.error(f"Error uploading file to Drive: {exc}")
        raise HTTPException(status_code=500, detail="Failed to upload file to Google Drive")
