from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from forgeguard.core.enums import TaskStatus
from forgeguard.core.exceptions import InvalidStateTransitionError

_ALLOWED_TRANSITIONS = {
    TaskStatus.CREATED: {TaskStatus.RUNNING, TaskStatus.CANCELLED},
    TaskStatus.RUNNING: {
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.COMPLETED: set(),
    TaskStatus.FAILED: {TaskStatus.RUNNING},
    TaskStatus.CANCELLED: set(),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Task:
    description: str
    task_id: str = field(default_factory=lambda: str(uuid4()))
    status: TaskStatus = TaskStatus.CREATED
    created_at: datetime = field(default_factory=utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def transition(self, new_status: TaskStatus) -> None:
        allowed = _ALLOWED_TRANSITIONS[self.status]

        if new_status not in allowed:
            raise InvalidStateTransitionError(
                f"Cannot transition task from '{self.status.value}' to '{new_status.value}'."
            )

        self.status = new_status
        now = utc_now()

        if new_status == TaskStatus.RUNNING:
            if not self.started_at:
                self.started_at = now
            self.finished_at = None

        if new_status in {
            TaskStatus.COMPLETED,
            TaskStatus.FAILED,
            TaskStatus.CANCELLED,
        }:
            self.finished_at = now
