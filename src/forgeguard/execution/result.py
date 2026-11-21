from dataclasses import dataclass, field
from typing import Any

from forgeguard.core.enums import TaskStatus
from forgeguard.events.event import ExecutionEvent


@dataclass
class ExecutionResult:
    task_id: str
    status: TaskStatus
    outputs: dict[str, Any] = field(default_factory=dict)
    events: list[ExecutionEvent] = field(default_factory=list)
    error: str | None = None
