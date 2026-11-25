from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from forgeguard.api.dependencies import get_runtime_service
from forgeguard.api.schemas import HealthResponse, ReadinessResponse
from forgeguard.persistence.repository import utc_iso_now
from forgeguard.runtime.service import RuntimeService

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Basic health check indicating that the API service is alive."""
    return HealthResponse(status="ok", timestamp=utc_iso_now(), version="0.1.0")


@router.get("/health/ready", response_model=ReadinessResponse)
async def get_readiness(
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> ReadinessResponse:
    """Readiness probe checking persistence and execution engine availability."""
    db_ok = True
    try:
        await service.persistence.repository.db.fetchone("SELECT 1")
    except Exception:
        db_ok = False

    return ReadinessResponse(
        status="ready" if db_ok else "not_ready",
        database=db_ok,
        engine=True,
        timestamp=utc_iso_now(),
    )
