from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class SpanType(str, Enum):
    TASK_EXECUTION = "task_execution"
    TOOL_EXECUTION = "tool_execution"
    POLICY_EVALUATION = "policy_evaluation"
    BUDGET_CHECK = "budget_check"
    PERSISTENCE = "persistence"
    CHECKPOINT_CREATION = "checkpoint_creation"
    RECOVERY = "recovery"
    RESUME = "resume"
    AGENT_EXECUTION = "agent_execution"
    AGENT_ITERATION = "agent_iteration"


class MetricType(str, Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"


class DiagnosticSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class DiagnosticCategory(str, Enum):
    EXECUTION = "execution"
    TOOL = "tool"
    POLICY = "policy"
    BUDGET = "budget"
    TIMEOUT = "timeout"
    PERSISTENCE = "persistence"
    RECOVERY = "recovery"
    CANCELLATION = "cancellation"
    VALIDATION = "validation"
    IDEMPOTENCY = "idempotency"
    BEHAVIOR = "behavior"


@dataclass
class Span:
    span_id: str
    trace_id: str
    operation_name: str
    span_type: str
    start_time: str
    parent_span_id: str | None = None
    end_time: str | None = None
    duration_ms: float = 0.0
    status: str = "running"
    attributes: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Trace:
    trace_id: str
    task_id: str
    start_time: str
    root_span_id: str
    end_time: str | None = None
    duration_ms: float = 0.0
    status: str = "running"
    metadata: dict[str, Any] = field(default_factory=dict)
    events_count: int = 0
    spans_count: int = 0
    metrics_summary: dict[str, Any] = field(default_factory=dict)
    diagnostic_summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class MetricRecord:
    metric_name: str
    metric_type: MetricType
    value: float
    timestamp: str
    unit: str
    labels: dict[str, str] = field(default_factory=dict)
    task_id: str | None = None
    trace_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["metric_type"] = self.metric_type.value
        return data


@dataclass
class Diagnostic:
    diagnostic_id: str
    task_id: str
    trace_id: str
    severity: DiagnosticSeverity
    category: DiagnosticCategory
    code: str
    message: str
    timestamp: str
    tool_call_id: str | None = None
    span_id: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    suggested_action: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["severity"] = self.severity.value
        data["category"] = self.category.value
        return data


@dataclass
class TimelineEntry:
    sequence_number: int
    timestamp: str
    event_type: str
    category: str
    task_id: str
    trace_id: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    duration_ms: float | None = None
    status: str = "success"
    summary: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionReport:
    task_id: str
    trace_id: str
    description: str
    status: str
    start_time: str
    end_time: str | None = None
    duration_ms: float = 0.0
    timeline: list[TimelineEntry] = field(default_factory=list)
    tool_summaries: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    budget_summary: dict[str, Any] = field(default_factory=dict)
    policy_summary: dict[str, Any] = field(default_factory=dict)
    recovery_summary: dict[str, Any] | None = None
    diagnostics: list[Diagnostic] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "trace_id": self.trace_id,
            "description": self.description,
            "status": self.status,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
            "timeline": [entry.to_dict() for entry in self.timeline],
            "tool_summaries": self.tool_summaries,
            "metrics": self.metrics,
            "budget_summary": self.budget_summary,
            "policy_summary": self.policy_summary,
            "recovery_summary": self.recovery_summary,
            "diagnostics": [diag.to_dict() for diag in self.diagnostics],
            "error": self.error,
        }
