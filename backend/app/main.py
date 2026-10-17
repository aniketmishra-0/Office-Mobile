from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.limiter import limiter
from app.routers import auth, forms, health, jobs, preferences, saved_sheets, upload, websocket
from app.services.session_context import OAUTH_SESSION_COOKIE, reset_oauth_session_key, set_oauth_session_key
from app.services.form_store import init_db
from app.routers.saved_sheets import init_saved_sheets_table
from app.services.job_store import init_jobs_table
from app.db import close_pool
from app.utils.error_responses import ErrorCode
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


import asyncio
import logging

logger = logging.getLogger(__name__)



async def _periodic_queue_sweeper():
    """Periodically drain any pending submissions that were queued during rate limits."""
    from app.services import form_store
    from app.models.field import FieldSchema
    from app.services.session_context import DEFAULT_OAUTH_KEY, oauth_session_context
    from app.services.sheets_client import append_form_row

    while True:
        try:
            await asyncio.sleep(60)
            pending = await asyncio.to_thread(form_store.get_pending_sync_submissions, 10)
            if pending:
                logger.info("Found %d pending submissions to sync with Google Sheets", len(pending))
                for item in pending:
                    sub_id = item["id"]
                    try:
                        fields_raw = item.get("fields_json")
                        fields = [FieldSchema(**f) for f in form_store._coerce_json(fields_raw) or []]
                        values = form_store._coerce_json(item.get("values_json")) or {}
                        oauth_key = item.get("oauth_key") or DEFAULT_OAUTH_KEY

                        def _do_sync():
                            with oauth_session_context(oauth_key):
                                return append_form_row(
                                    spreadsheet_id=item["spreadsheet_id"],
                                    worksheet_name=item["worksheet_name"],
                                    fields=fields,
                                    values=values,
                                )

                        rng = await asyncio.to_thread(_do_sync)
                        if rng:
                            # Zero Space Mode: Remove from DB immediately once synced
                            await asyncio.to_thread(form_store.delete_submission, sub_id)
                            logger.info("Sweeper successfully synced and deleted submission %s from DB", sub_id)
                    except Exception as sweeper_exc:
                        logger.warning("Sweeper retry failed for %s: %s", sub_id, sweeper_exc)
                        await asyncio.to_thread(
                            form_store.increment_submission_retry, sub_id, str(sweeper_exc)[:300]
                        )
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug("periodic_queue_sweeper error: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_saved_sheets_table()
    init_jobs_table()
    sweeper_task = asyncio.create_task(_periodic_queue_sweeper())
    try:
        yield
    finally:
        sweeper_task.cancel()
        try:
            await sweeper_task
        except asyncio.CancelledError:
            pass
        from app.services.cache import close_redis
        await close_redis()
        close_pool()


settings = get_settings()

# Hard-fail on dangerous CORS configuration. A wildcard origin combined with
# allow_credentials=True would let any site make authenticated requests.
if "*" in settings.allowed_origins:
    raise RuntimeError(
        "ALLOWED_ORIGINS may not contain '*' when credentials are allowed. "
        "Set it to an explicit list of origins, e.g. https://app.example.com"
    )

app = FastAPI(
    title="Office Mobile API",
    description="Convert Google Sheets into mobile-first data entry forms.",
    version="0.1.0",
    lifespan=lifespan,
    # orjson serializes dict/list/datetime ~2-3x faster than the stdlib json
    # encoder FastAPI uses by default. Every route returning JSON benefits.
    default_response_class=ORJSONResponse,
)

# Attach the limiter so routers can import it and so the exception handler
# fires correctly.
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)



# Reject oversized request bodies at the edge. 2 MB is well above any
# legitimate form submission and blocks memory-exhaustion attacks.
_MAX_BODY_BYTES = 2 * 1024 * 1024
# Upload endpoint headroom for multipart file uploads (up to 25 MB).
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            size = int(content_length)
        except ValueError:
            size = 0
        limit = (
            _MAX_UPLOAD_BYTES
            if request.url.path.startswith("/api/upload")
            else _MAX_BODY_BYTES
        )
        if size > limit:
            return JSONResponse(
                status_code=413,
                content={"detail": "Payload too large", "error_code": "PAYLOAD_TOO_LARGE"},
            )
    return await call_next(request)


@app.middleware("http")
async def attach_oauth_session(request: Request, call_next):
    session_key = request.cookies.get(OAUTH_SESSION_COOKIE) or request.headers.get(
        "x-session-key"
    )
    token = set_oauth_session_key(session_key)
    try:
        response = await call_next(request)
    finally:
        reset_oauth_session_key(token)
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response


app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-Requested-With",
        "X-Session-Key",
    ],
    max_age=86400,
)


def _add_cors_headers(response: JSONResponse, request: Request) -> None:
    """Manually inject CORS headers so the browser can read error responses."""
    origin = request.headers.get("origin")
    if origin and origin in settings.allowed_origins:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
        response.headers["vary"] = "Origin"


# Rate-limit exceeded handler — returns a structured 429 with CORS headers.
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    response = JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please try again later.",
            "error_code": ErrorCode.RATE_LIMITED,
        },
    )
    _add_cors_headers(response, request)
    return response


# HTTP exception handler — standardizes error shapes and attaches CORS headers.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    error_code = getattr(exc, "error_code", None)
    if not error_code:
        code_map = {
            400: ErrorCode.BAD_REQUEST,
            401: ErrorCode.UNAUTHORIZED,
            403: ErrorCode.FORBIDDEN,
            404: ErrorCode.NOT_FOUND,
            413: ErrorCode.PAYLOAD_TOO_LARGE,
            429: ErrorCode.RATE_LIMITED,
            500: ErrorCode.INTERNAL_ERROR,
            502: ErrorCode.UPSTREAM_ERROR,
            503: ErrorCode.SERVICE_UNAVAILABLE,
        }
        error_code = code_map.get(exc.status_code, "ERROR")

    if isinstance(exc.detail, dict):
        content = dict(exc.detail)
        if "error_code" not in content:
            content["error_code"] = error_code
    else:
        content = {
            "detail": exc.detail,
            "error_code": error_code,
        }

    response = JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=getattr(exc, "headers", None),
    )
    _add_cors_headers(response, request)
    return response


# Validation error handler — returns 422 with structured errors and error_code.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    response = JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "error_code": ErrorCode.VALIDATION_ERROR,
        },
    )
    _add_cors_headers(response, request)
    return response


# Global exception handler — ensures CORS headers are present even on 500s.
# Without this, the browser blocks the response body and the frontend only
# sees "CORS error" instead of the actual error message.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger("app").exception("Unhandled error on %s %s", request.method, request.url.path)
    response = JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_code": ErrorCode.INTERNAL_ERROR,
        },
    )
    _add_cors_headers(response, request)
    return response

app.include_router(health.router)
app.include_router(forms.router)
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(preferences.router)
app.include_router(saved_sheets.router)
app.include_router(websocket.router)
app.include_router(jobs.router)
