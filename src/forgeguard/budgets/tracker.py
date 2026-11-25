from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.budgets.exceptions import (
    OutputSizeExceededError,
    ToolCallLimitExceededError,
)


def calculate_output_bytes(output: Any) -> int:
    """Calculate the deterministic UTF-8 byte size of a tool output.

    Handles strings, numbers, booleans, None, lists, dicts, and nested structures.
    Uses UTF-8 encoding deterministically and avoids crashing on edge cases.
    """
    if output is None:
        return 0
    if isinstance(output, (bytes, bytearray)):
        return len(output)
    if isinstance(output, str):
        return len(output.encode("utf-8"))
    try:
        serialized = json.dumps(
            output,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        )
        return len(serialized.encode("utf-8"))
    except Exception:
        return len(str(output).encode("utf-8"))


class BudgetTracker:
    """Per-task execution budget tracker.

    Tracks tool calls, execution elapsed time, consecutive failures,
    and cumulative output bytes. Isolated per task execution.
    """

    def __init__(
        self,
        budget: ExecutionBudget,
        time_provider: Callable[[], float] = time.monotonic,
    ) -> None:
        self.budget = budget
        self._time_provider = time_provider
        self.tool_calls_reserved: int = 0
        self.successful_tool_calls: int = 0
        self.failed_tool_calls: int = 0
        self.consecutive_failures: int = 0
        self.cumulative_output_bytes: int = 0
        self.start_time: float | None = None
        self.timed_out_tool_calls: int = 0

    def start(self) -> None:
        """Mark the beginning of execution time tracking."""
        if self.start_time is None:
            self.start_time = self._time_provider()

    def restore_from_snapshot(self, snapshot: dict[str, Any]) -> None:
        """Restore tracker accounting state from a persisted snapshot."""
        self.tool_calls_reserved = int(
            snapshot.get("tool_calls_reserved", self.tool_calls_reserved)
        )
        self.successful_tool_calls = int(
            snapshot.get("successful_tool_calls", self.successful_tool_calls)
        )
        self.failed_tool_calls = int(snapshot.get("failed_tool_calls", self.failed_tool_calls))
        self.consecutive_failures = int(
            snapshot.get("consecutive_failures", self.consecutive_failures)
        )
        self.cumulative_output_bytes = int(
            snapshot.get("cumulative_output_bytes", self.cumulative_output_bytes)
        )
        self.timed_out_tool_calls = int(
            snapshot.get("timed_out_tool_calls", self.timed_out_tool_calls)
        )
        elapsed = float(snapshot.get("elapsed_seconds", 0.0))
        # Offset start_time so monotonic elapsed time calculations preserve previous duration
        self.start_time = self._time_provider() - elapsed

    @property
    def elapsed_seconds(self) -> float:
        """Return the monotonic elapsed seconds since tracking started."""
        if self.start_time is None:
            return 0.0
        return max(0.0, self._time_provider() - self.start_time)

    @property
    def remaining_seconds(self) -> float:
        """Return the remaining execution time before total task deadline."""
        return max(0.0, self.budget.max_execution_seconds - self.elapsed_seconds)

    def is_deadline_exceeded(self) -> bool:
        """Check whether the overall task execution deadline has expired."""
        if self.start_time is None:
            return False
        return self.elapsed_seconds >= self.budget.max_execution_seconds

    @property
    def remaining_tool_calls(self) -> int:
        """Return remaining number of permitted tool calls."""
        return max(0, self.budget.max_tool_calls - self.tool_calls_reserved)

    @property
    def remaining_output_bytes(self) -> int:
        """Return remaining cumulative output byte capacity."""
        return max(0, self.budget.max_output_bytes - self.cumulative_output_bytes)

    def can_reserve_tool_call(self) -> bool:
        """Check if an additional tool call can be reserved within budget."""
        return self.tool_calls_reserved < self.budget.max_tool_calls

    def reserve_tool_call(self) -> None:
        """Reserve a tool call from the budget.

        Raises ToolCallLimitExceededError if the tool call budget is already exhausted.
        """
        if not self.can_reserve_tool_call():
            raise ToolCallLimitExceededError(
                f"Tool call limit reached: "
                f"{self.tool_calls_reserved} >= {self.budget.max_tool_calls}"
            )
        self.tool_calls_reserved += 1

    def get_effective_tool_timeout(self) -> float:
        """Return the effective timeout for the next tool invocation.

        This is the minimum of individual tool duration limit and remaining task execution time.
        """
        return min(self.budget.max_tool_duration_seconds, self.remaining_seconds)

    def record_tool_success(self, output_bytes: int) -> None:
        """Record a successful tool invocation, reset failure streak, and add output bytes."""
        self.successful_tool_calls += 1
        self.consecutive_failures = 0
        self.cumulative_output_bytes += output_bytes

    def record_tool_failure(self, is_timeout: bool = False) -> None:
        """Record a failed tool invocation and increment consecutive failure count."""
        self.failed_tool_calls += 1
        self.consecutive_failures += 1
        if is_timeout:
            self.timed_out_tool_calls += 1

    def is_consecutive_failures_exceeded(self) -> bool:
        """Check if consecutive failures have reached or exceeded the configured limit."""
        return self.consecutive_failures >= self.budget.max_consecutive_failures

    def validate_output_size(self, output_bytes: int) -> None:
        """Validate whether an output of given size fits within remaining output budget.

        Raises OutputSizeExceededError if output exceeds remaining budget.
        """
        if self.cumulative_output_bytes + output_bytes > self.budget.max_output_bytes:
            raise OutputSizeExceededError(
                f"Output size budget exceeded: adding {output_bytes} bytes to "
                f"{self.cumulative_output_bytes} bytes exceeds maximum of "
                f"{self.budget.max_output_bytes} bytes"
            )

    def snapshot(self) -> dict[str, Any]:
        """Return a structured, serializable snapshot of the current budget metrics."""
        return {
            "max_tool_calls": self.budget.max_tool_calls,
            "tool_calls_reserved": self.tool_calls_reserved,
            "remaining_tool_calls": self.remaining_tool_calls,
            "successful_tool_calls": self.successful_tool_calls,
            "failed_tool_calls": self.failed_tool_calls,
            "consecutive_failures": self.consecutive_failures,
            "max_consecutive_failures": self.budget.max_consecutive_failures,
            "max_execution_seconds": self.budget.max_execution_seconds,
            "elapsed_seconds": round(self.elapsed_seconds, 6),
            "remaining_seconds": round(self.remaining_seconds, 6),
            "max_output_bytes": self.budget.max_output_bytes,
            "cumulative_output_bytes": self.cumulative_output_bytes,
            "remaining_output_bytes": self.remaining_output_bytes,
            "max_tool_duration_seconds": self.budget.max_tool_duration_seconds,
            "timed_out_tool_calls": self.timed_out_tool_calls,
        }
