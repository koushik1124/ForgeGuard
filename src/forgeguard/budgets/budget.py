from __future__ import annotations

from dataclasses import dataclass

from forgeguard.budgets.exceptions import InvalidBudgetConfigError


@dataclass(frozen=True)
class ExecutionBudget:
    max_tool_calls: int = 20
    max_execution_seconds: float = 120.0
    max_consecutive_failures: int = 5
    max_output_bytes: int = 1_000_000
    max_tool_duration_seconds: float = 30.0

    def __post_init__(self) -> None:
        if (
            isinstance(self.max_tool_calls, bool)
            or not isinstance(self.max_tool_calls, int)
            or self.max_tool_calls <= 0
        ):
            raise InvalidBudgetConfigError("max_tool_calls must be a positive integer")

        if (
            isinstance(self.max_execution_seconds, bool)
            or not isinstance(self.max_execution_seconds, (int, float))
            or self.max_execution_seconds <= 0
        ):
            raise InvalidBudgetConfigError("max_execution_seconds must be a positive number")

        if (
            isinstance(self.max_consecutive_failures, bool)
            or not isinstance(self.max_consecutive_failures, int)
            or self.max_consecutive_failures <= 0
        ):
            raise InvalidBudgetConfigError("max_consecutive_failures must be a positive integer")

        if (
            isinstance(self.max_output_bytes, bool)
            or not isinstance(self.max_output_bytes, int)
            or self.max_output_bytes <= 0
        ):
            raise InvalidBudgetConfigError("max_output_bytes must be a positive integer")

        if (
            isinstance(self.max_tool_duration_seconds, bool)
            or not isinstance(self.max_tool_duration_seconds, (int, float))
            or self.max_tool_duration_seconds <= 0
        ):
            raise InvalidBudgetConfigError("max_tool_duration_seconds must be a positive number")
