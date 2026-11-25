from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import StreamingResponse

from forgeguard.api.auth import verify_api_key
from forgeguard.api.dependencies import get_runtime_service
from forgeguard.api.schemas import (
    TaskCancelResponse,
    TaskDiagnosticsResponse,
    TaskListResponse,
    TaskResponse,
    TaskResultResponse,
    TaskResumeResponse,
    TaskSubmitRequest,
)
from forgeguard.runtime.service import RuntimeService

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"], dependencies=[Depends(verify_api_key)])


@router.post("", response_model=TaskResponse, status_code=202)
async def submit_task(
    request: TaskSubmitRequest,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    x_idempotency_key: str | None = Header(None, alias="X-Idempotency-Key"),
) -> TaskResponse:
    """Submit a governed execution task."""
    effective_key = idempotency_key or x_idempotency_key
    return await service.submit_task(request, idempotency_key=effective_key)


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
    status: str | None = Query(None, description="Filter tasks by status"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
) -> TaskListResponse:
    """List tasks with status filtering and pagination."""
    return await service.list_tasks(status=status, limit=limit, offset=offset)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> TaskResponse:
    """Retrieve detailed state and lifecycle information for a task."""
    return await service.get_task(task_id)


@router.get("/{task_id}/result", response_model=TaskResultResponse)
async def get_task_result(
    task_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> TaskResultResponse:
    """Retrieve terminal outputs and results for a completed or failed task."""
    return await service.get_task_result(task_id)


@router.post("/{task_id}/cancel", response_model=TaskCancelResponse)
async def cancel_task(
    task_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> TaskCancelResponse:
    """Safely request cancellation of an active task."""
    return await service.cancel_task(task_id)


@router.post("/{task_id}/resume", response_model=TaskResumeResponse)
async def resume_task(
    task_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> TaskResumeResponse:
    """Resume execution of an interrupted or failed task from checkpoints."""
    return await service.resume_task(task_id)


@router.get("/{task_id}/diagnostics", response_model=TaskDiagnosticsResponse)
async def get_task_diagnostics(
    task_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> TaskDiagnosticsResponse:
    """Retrieve bounded diagnostics, execution timeline, and trace info."""
    return await service.get_task_diagnostics(task_id)


@router.get("/{task_id}/events")
async def stream_task_events(
    task_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
    query_last_event_id: str | None = Query(None, alias="last_event_id"),
) -> StreamingResponse:
    """Stream real-time SSE execution events with replay support."""
    effective_last_id = last_event_id or query_last_event_id
    generator = service.stream_task_events(task_id=task_id, last_event_id=effective_last_id)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
