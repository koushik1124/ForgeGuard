from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TaskInfo:
    """Task details returned by ForgeGuard API."""

    task_id: str
    description: str
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    iteration_count: int | None = None
    tool_call_count: int | None = None
    budget_summary: dict[str, Any] | None = None
    cancellation_status: str | None = None
    recovery_status: str | None = None
    error_summary: str | None = None


@dataclass
class TaskResult:
    """Final result of a task execution."""

    task_id: str
    status: str
    completed: bool
    final_response: str | None = None
    outputs: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    iterations: int = 0
    tool_call_count: int = 0
    duration_seconds: float = 0.0


@dataclass
class TaskCancelInfo:
    """Cancellation response information."""

    task_id: str
    status: str
    cancelled: bool
    message: str


@dataclass
class TaskResumeInfo:
    """Resume response information."""

    task_id: str
    status: str
    resumed: bool
    message: str
    completed_calls: list[str] = field(default_factory=list)


@dataclass
class WorkspaceInfo:
    """Registered workspace details."""

    workspace_id: str
    name: str
    root_path: str
    created_at: str
    description: str = ""


@dataclass
class DiagnosticInfo:
    """Task execution diagnostics."""

    task_id: str
    trace_id: str | None = None
    timeline: list[dict[str, Any]] = field(default_factory=list)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    budget_snapshot: dict[str, Any] | None = None
    recovery_info: dict[str, Any] | None = None


@dataclass
class SSEEvent:
    """An event parsed from an SSE event stream."""

    event_id: str | None
    event_type: str
    data: dict[str, Any]
    raw: str = ""
