from dataclasses import dataclass, field
from typing import Any

from forgeguard.core.task import Task


@dataclass
class ExecutionContext:
    task: Task
    outputs: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
