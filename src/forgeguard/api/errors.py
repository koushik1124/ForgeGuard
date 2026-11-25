from __future__ import annotations

import contextvars
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

# Context variable for tracking request ID throughout the request lifecycle
request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default="req_unknown"
)


class APIErrorDetail(BaseModel):
    """Structured detail for API errors."""

    code: str = Field(description="Unique ForgeGuard error code (e.g., FG-TASK-404)")
    message: str = Field(description="Human-readable error description")
    request_id: str = Field(description="Correlation request ID")
    task_id: str | None = Field(default=None, description="Task ID if applicable")
    details: Any = Field(default=None, description="Optional safe detail object")


class APIErrorResponse(BaseModel):
    """Top-level error response envelope."""

    error: APIErrorDetail


class APIException(HTTPException):
    """Base HTTP exception conforming to ForgeGuard API error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        task_id: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.task_id = task_id
        self.details = details

    def to_envelope(self, request_id: str | None = None) -> APIErrorResponse:
        req_id = request_id or request_id_ctx.get()
        return APIErrorResponse(
            error=APIErrorDetail(
                code=self.code,
                message=self.message,
                request_id=req_id,
                task_id=self.task_id,
                details=self.details,
            )
        )
