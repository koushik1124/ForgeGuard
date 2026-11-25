from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    from forgeguard.evaluation.service import EvaluationRunnerService
    from forgeguard.runtime.service import RuntimeService


def get_runtime_service(request: Request) -> RuntimeService:
    """Retrieve shared RuntimeService instance from FastAPI application state."""
    service: RuntimeService = request.app.state.runtime_service
    return service


def get_evaluation_runner_service(request: Request) -> EvaluationRunnerService:
    """Retrieve shared EvaluationRunnerService instance from FastAPI application state."""
    service: RuntimeService = request.app.state.runtime_service
    return service.evaluation_runner
