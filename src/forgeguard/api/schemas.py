from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    """Basic health status response."""

    status: str = Field(default="ok")
    timestamp: str = Field(description="ISO 8601 UTC timestamp")
    version: str = Field(default="0.1.0")


class ReadinessResponse(BaseModel):
    """Runtime dependencies readiness check."""

    status: str = Field(default="ready")
    database: bool = Field(default=True)
    engine: bool = Field(default=True)
    timestamp: str = Field(description="ISO 8601 UTC timestamp")


class ToolCallSchema(BaseModel):
    """Schema for direct tool invocation requests."""

    model_config = ConfigDict(extra="forbid")

    tool_name: str = Field(..., min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)
    call_id: str | None = Field(default=None)


class BudgetOverrideSchema(BaseModel):
    """Optional client budget configuration (subject to server maxima)."""

    model_config = ConfigDict(extra="forbid")

    max_tool_calls: int | None = Field(default=None, ge=1, le=100)
    max_execution_seconds: float | None = Field(default=None, ge=1.0, le=600.0)
    max_output_bytes: int | None = Field(default=None, ge=1000, le=10_000_000)
    max_tool_duration_seconds: float | None = Field(default=None, ge=0.5, le=120.0)


class TaskSubmitRequest(BaseModel):
    """Strict request contract for governed task submission."""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=1, max_length=50_000, description="Task prompt or goal")
    workspace_id: str | None = Field(default=None, description="Optional registered workspace ID")
    execution_mode: str = Field(
        default="agent",
        description="Execution mode: 'agent' (model-driven loop) or 'tool_calls' (direct tools)",
    )
    tool_calls: list[ToolCallSchema] | None = Field(
        default=None,
        description="Optional explicit tool calls if execution_mode is 'tool_calls'",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)
    budget: BudgetOverrideSchema | None = Field(default=None)


class TaskResponse(BaseModel):
    """Safe structured view of a governed task."""

    task_id: str
    description: str
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    iteration_count: int | None = None
    tool_call_count: int | None = None
    budget_summary: dict[str, Any] | None = None
    cancellation_status: str | None = None
    recovery_status: str | None = None
    error_summary: str | None = None


class TaskListResponse(BaseModel):
    """Paginated list of tasks."""

    items: list[TaskResponse]
    total: int
    limit: int
    offset: int


class TaskResultResponse(BaseModel):
    """Terminal execution outcome of a governed task."""

    task_id: str
    status: str
    completed: bool
    final_response: str | None = None
    outputs: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    iterations: int = 0
    tool_call_count: int = 0
    duration_seconds: float = 0.0


class TaskCancelResponse(BaseModel):
    """Result of task cancellation request."""

    task_id: str
    status: str
    cancelled: bool
    message: str


class TaskResumeResponse(BaseModel):
    """Result of task recovery/resume request."""

    task_id: str
    status: str
    resumed: bool
    message: str
    completed_calls: list[str] = Field(default_factory=list)


class WorkspaceRegisterRequest(BaseModel):
    """Registration contract for an approved workspace directory."""

    model_config = ConfigDict(extra="forbid")

    workspace_id: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    root_path: str = Field(..., min_length=1, max_length=1024)
    description: str = Field(default="", max_length=512)


class WorkspaceResponse(BaseModel):
    """Approved workspace registration details."""

    workspace_id: str
    name: str
    root_path: str
    created_at: str
    description: str = ""


class WorkspaceListResponse(BaseModel):
    """List of registered workspaces."""

    workspaces: list[WorkspaceResponse]


class WorkspaceFileEntry(BaseModel):
    """Metadata for a single file or directory inside a workspace."""

    name: str
    relative_path: str
    is_directory: bool
    size_bytes: int | None = None
    extension: str = ""


class WorkspaceDirectoryResponse(BaseModel):
    """Directory listing for an approved workspace subpath."""

    workspace_id: str
    subpath: str
    total_entries: int
    entries: list[WorkspaceFileEntry]


class WorkspaceFilePreviewResponse(BaseModel):
    """Read-only preview content and metadata for a workspace file."""

    workspace_id: str
    relative_path: str
    name: str
    size_bytes: int
    read_bytes: int
    is_truncated: bool
    is_binary: bool
    content: str | None = None
    extension: str = ""
    mime_type: str = "text/plain"


class TaskDiagnosticsResponse(BaseModel):
    """Task execution diagnostics and timeline."""

    task_id: str
    trace_id: str | None = None
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)
    budget_snapshot: dict[str, Any] | None = None
    recovery_info: dict[str, Any] | None = None


class ScenarioCatalogItem(BaseModel):
    """Metadata for an individual registered evaluation scenario."""

    scenario_id: str
    name: str
    category: str
    severity: str
    description: str
    tags: list[str] = Field(default_factory=list)


class ScenarioCatalogResponse(BaseModel):
    """Catalog of all registered evaluation scenarios organized by suite."""

    total_scenarios: int
    suites: dict[str, list[ScenarioCatalogItem]]
    scenarios: list[ScenarioCatalogItem]


class EvaluationReportSummary(BaseModel):
    """Summary of an evaluation experiment report for historical run listings."""

    experiment_id: str
    name: str
    timestamp: str
    duration_ms: float
    total_scenarios: int
    passed: int
    failed: int
    errors: int
    skipped: int
    overall_status: str
    pass_rate_pct: float = 0.0


class EvaluationReportListResponse(BaseModel):
    """Historical evaluation reports listing."""

    total_reports: int
    reports: list[EvaluationReportSummary]


class EvaluationReportDetailResponse(BaseModel):
    """Detailed evaluation report including scenario results and benchmark metrics."""

    experiment_id: str
    name: str
    timestamp: str
    duration_ms: float
    total_scenarios: int
    passed: int
    failed: int
    errors: int
    skipped: int
    overall_status: str
    scenario_results: list[dict[str, Any]] = Field(default_factory=list)
    benchmarks: list[dict[str, Any]] = Field(default_factory=list)
    summary_metrics: dict[str, Any] = Field(default_factory=dict)
    environment_info: dict[str, Any] = Field(default_factory=dict)


class EvaluationRunSubmitRequest(BaseModel):
    """Request contract for starting a governed evaluation run."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="forgeguard_evaluation", max_length=100)
    suites: list[str] = Field(default_factory=list)
    scenario_ids: list[str] = Field(default_factory=list)


class EvaluationRunStateResponse(BaseModel):
    """Execution state and live progress of an evaluation run."""

    run_id: str
    experiment_id: str
    name: str
    status: str
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    selected_suites: list[str] = Field(default_factory=list)
    selected_scenario_ids: list[str] = Field(default_factory=list)
    total_scenarios: int = 0
    completed_scenarios: int = 0
    current_scenario_id: str | None = None
    current_scenario_name: str | None = None
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    overall_status: str | None = None
    duration_ms: float = 0.0
    error_summary: str | None = None
    report_id: str | None = None


class EvaluationRunListResponse(BaseModel):
    """List of active and recent in-memory evaluation runs."""

    total_runs: int
    active_run_id: str | None = None
    runs: list[EvaluationRunStateResponse] = Field(default_factory=list)
