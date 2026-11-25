from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ToolExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class TaskRecord:
    task_id: str
    description: str
    status: str
    created_at: str
    last_updated_at: str
    started_at: str | None = None
    finished_at: str | None = None
    metadata_json: str = "{}"
    current_position: int = 0
    recovery_status: str | None = None


@dataclass(frozen=True)
class ToolExecutionRecord:
    task_id: str
    tool_call_id: str
    tool_name: str
    sequence_number: int
    arguments_json: str
    status: str
    idempotency_key: str
    id: int | None = None
    start_time: str | None = None
    completion_time: str | None = None
    result_json: str | None = None
    error_text: str | None = None
    duration_seconds: float | None = None
    recovery_classification: str | None = None


@dataclass(frozen=True)
class JournalEventRecord:
    event_id: str
    task_id: str
    sequence_number: int
    event_type: str
    timestamp: str
    payload_json: str = "{}"
    id: int | None = None


@dataclass(frozen=True)
class CheckpointRecord:
    checkpoint_id: str
    task_id: str
    sequence_number: int
    timestamp: str
    execution_position: int
    completed_calls_json: str = "[]"
    partial_outputs_json: str = "{}"
    budget_state_json: str = "{}"
    task_state_json: str = "{}"
    recovery_metadata_json: str = "{}"


@dataclass(frozen=True)
class RecoveryReport:
    task_id: str
    previous_status: str
    reconstructed_position: int
    completed_calls: list[str] = field(default_factory=list)
    pending_calls: list[str] = field(default_factory=list)
    failed_calls: list[str] = field(default_factory=list)
    uncertain_calls: list[str] = field(default_factory=list)
    checkpoint_id: str | None = None
    partial_outputs: dict[str, Any] = field(default_factory=dict)
    budget_snapshot: dict[str, Any] | None = None
    warnings: list[str] = field(default_factory=list)
    can_resume_safely: bool = True


@dataclass(frozen=True)
class TaskIdempotencyRecord:
    idempotency_key: str
    task_id: str
    request_hash: str
    created_at: str


@dataclass(frozen=True)
class WorkspaceRecord:
    workspace_id: str
    name: str
    root_path: str
    created_at: str
    description: str = ""
