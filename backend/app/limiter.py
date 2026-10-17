"""
Centralized slowapi Limiter instance.

Defined in its own module to avoid circular imports between app.main and routers.
"""
from __future__ import annotations

import functools
import types
from typing import Any, Callable

from slowapi import Limiter as _SlowAPILimiter
from slowapi.util import get_remote_address
from starlette.responses import Response

from app.config import get_settings


class Limiter(_SlowAPILimiter):
    """
    Subclass of slowapi Limiter that:
    1. Preserves FastAPI / Pydantic type annotation resolution when routes are
       decorated with @limiter.limit(...).
    2. Gracefully handles endpoints returning Pydantic models or dicts instead
       of Starlette Response instances without raising header-injection errors.
    """

    def _inject_headers(self, response: Any, current_limit: Any) -> Any:
        if not isinstance(response, Response):
            return response
        return super()._inject_headers(response, current_limit)

    def limit(self, *args: Any, **kwargs: Any) -> Callable:
        base_decorator = super().limit(*args, **kwargs)

        def decorator(func: Callable) -> Callable:
            wrapped = base_decorator(func)
            if hasattr(wrapped, "__code__") and hasattr(func, "__globals__"):
                combined_globals = dict(wrapped.__globals__)
                combined_globals.update(func.__globals__)
                new_wrapper = types.FunctionType(
                    wrapped.__code__,
                    combined_globals,
                    wrapped.__name__,
                    wrapped.__defaults__,
                    wrapped.__closure__,
                )
                new_wrapper = functools.update_wrapper(new_wrapper, func)
                new_wrapper.__kwdefaults__ = getattr(wrapped, "__kwdefaults__", None)
                for attr, val in wrapped.__dict__.items():
                    setattr(new_wrapper, attr, val)
                return new_wrapper
            return wrapped

        return decorator


settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default],
    headers_enabled=True,
)
