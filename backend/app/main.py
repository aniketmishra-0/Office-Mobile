from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, forms, health, upload
from app.services.form_store import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


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
    ],
    max_age=86400,
)

app.include_router(health.router)
app.include_router(forms.router)
app.include_router(auth.router)
app.include_router(upload.router)
