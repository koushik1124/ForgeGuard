
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from forgeguard.api.dependencies import get_runtime_service
from forgeguard.api.errors import (
    APIErrorDetail,
    APIErrorResponse,
    APIException,
    request_id_ctx,
)
from forgeguard.api.routes import (
    evaluations_router,
    health_router,
    tasks_router,
    workspaces_router,
)
from forgeguard.config import ForgeGuardSettings, get_settings
from forgeguard.runtime.service import RuntimeService

logger = logging.getLogger("forgeguard.api")


class RequestIdAndSizeMiddleware(BaseHTTPMiddleware):
    """Middleware for request ID correlation and max payload size enforcement."""

    def __init__(self, app: ASGIApp, max_request_bytes: int = 1_000_000) -> None:
        super().__init__(app)
        self.max_request_bytes = max_request_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # 1. Establish request correlation ID
        req_id = request.headers.get("X-Request-ID") or f"req_{uuid4().hex[:12]}"
        token = request_id_ctx.set(req_id)

        try:
            # 2. Enforce maximum request payload size
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    size = int(content_length)
                    if size > self.max_request_bytes:
                        err = APIErrorResponse(
                            error=APIErrorDetail(
                                code="FG-REQ-413",
                                message=(
                                    f"Request entity too large: {size} bytes exceeds "
                                    f"maximum allowed limit of {self.max_request_bytes} bytes."
                                ),
                                request_id=req_id,
                            )
                        )
                        return JSONResponse(status_code=413, content=err.model_dump())
                except ValueError:
                    pass

            response = await call_next(request)
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_ctx.reset(token)


def create_app(
    settings: ForgeGuardSettings | None = None,
    runtime_service: RuntimeService | None = None,
) -> FastAPI:
    """Create and configure the production FastAPI application."""
    active_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        svc: RuntimeService = app.state.runtime_service
        await svc.initialize()
        yield
        await svc.close()

    app = FastAPI(
        title="ForgeGuard Runtime API",
        description="Governed execution runtime platform for reliable AI agents.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Attach runtime service to application state
    service = runtime_service or RuntimeService(settings=active_settings)
    app.state.runtime_service = service
    app.state.settings = active_settings

    # Dependency overrides to ensure active settings and service are provided
    app.dependency_overrides[get_settings] = lambda: active_settings
    app.dependency_overrides[get_runtime_service] = lambda: service

    # Middleware
    app.add_middleware(
        RequestIdAndSizeMiddleware,
        max_request_bytes=active_settings.max_request_bytes,
    )

    # CORS: Allow the local React dashboard to communicate with the API
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Exception Handlers
    @app.exception_handler(APIException)
    async def handle_api_exception(request: Request, exc: APIException) -> JSONResponse:
        req_id = request_id_ctx.get()
        envelope = exc.to_envelope(request_id=req_id)
        return JSONResponse(status_code=exc.status_code, content=envelope.model_dump())

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        req_id = request_id_ctx.get()
        envelope = APIErrorResponse(
            error=APIErrorDetail(
                code="FG-REQ-422",
                message="Request validation failed.",
                request_id=req_id,
                details=exc.errors(),
            )
        )
        return JSONResponse(status_code=422, content=envelope.model_dump())

    @app.exception_handler(Exception)
    async def handle_generic_exception(request: Request, exc: Exception) -> JSONResponse:
        req_id = request_id_ctx.get()
        logger.exception("Unhandled server exception [%s]: %s", req_id, exc)
        envelope = APIErrorResponse(
            error=APIErrorDetail(
                code="FG-INTERNAL-500",
                message="An internal runtime error occurred. Check server logs.",
                request_id=req_id,
            )
        )
        return JSONResponse(status_code=500, content=envelope.model_dump())

    # Include API Routers
    app.include_router(health_router)
    app.include_router(tasks_router)
    app.include_router(workspaces_router)
    app.include_router(evaluations_router)

    return app
