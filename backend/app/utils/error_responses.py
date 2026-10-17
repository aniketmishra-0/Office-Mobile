"""
Consistent error response helpers.

All API errors should use this format so clients can rely on a stable shape:

    {
        "detail": "Human-readable message",
        "error_code": "MACHINE_READABLE_CODE"
    }

The ``detail`` field matches FastAPI's default HTTPException body, so existing
frontend code that reads ``response.data.detail`` keeps working.
"""
from __future__ import annotations

from fastapi.responses import JSONResponse


# Common error codes used across the app.
class ErrorCode:
    INTERNAL_ERROR = "INTERNAL_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    FORBIDDEN = "FORBIDDEN"
    UNAUTHORIZED = "UNAUTHORIZED"
    BAD_REQUEST = "BAD_REQUEST"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    SHEETS_ERROR = "SHEETS_ERROR"
    UPLOAD_ERROR = "UPLOAD_ERROR"
    UPSTREAM_ERROR = "UPSTREAM_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


def error_response(
    status_code: int,
    detail: str,
    error_code: str = ErrorCode.INTERNAL_ERROR,
) -> JSONResponse:
    """Build a JSON error response with the standard shape."""
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "error_code": error_code},
    )
