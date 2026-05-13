from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import auth, forms, health, upload
from app.services.session_context import OAUTH_SESSION_COOKIE, reset_oauth_session_key, set_oauth_session_key
from app.services.form_store import init_db
from app.db import close_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        yield
    finally:
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
    title="AllinForm API",
    description="Convert Google Sheets into mobile-first data entry forms.",
    version="0.1.0",
    lifespan=lifespan,
)

# Reject oversized request bodies at the edge. 2 MB is well above any
# legitimate form submission and blocks memory-exhaustion attacks.
_MAX_BODY_BYTES = 2 * 1024 * 1024
# Upload endpoint needs more headroom for multipart file uploads.
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


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
                content={"detail": "Payload too large"},
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

app.include_router(health.router)
app.include_router(forms.router)
app.include_router(auth.router)
app.include_router(upload.router)
