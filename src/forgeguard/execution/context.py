from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from forgeguard.core.task import Task

if TYPE_CHECKING:
    from forgeguard.budgets.tracker import BudgetTracker


@dataclass
class ExecutionContext:
    task: Task
    outputs: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    tracker: BudgetTracker | None = None
