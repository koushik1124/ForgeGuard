from __future__ import annotations

from forgeguard.core.exceptions import ForgeGuardError


class BudgetError(ForgeGuardError):
    """Base exception for budget-related errors in ForgeGuard."""


class InvalidBudgetConfigError(BudgetError, ValueError):
    """Raised when an ExecutionBudget configuration has invalid values."""


class BudgetExceededError(BudgetError):
    """Base exception when an execution budget limit is exceeded."""


class ToolCallLimitExceededError(BudgetExceededError):
    """Raised when the maximum number of tool calls is exceeded."""


class ExecutionTimeoutError(BudgetExceededError):
    """Raised when the total task execution duration is exceeded."""


class ToolTimeoutError(BudgetError):
    """Raised when an individual tool invocation exceeds its timeout."""


class ConsecutiveFailuresExceededError(BudgetExceededError):
    """Raised when consecutive tool failures reach or exceed the threshold."""


class OutputSizeExceededError(BudgetExceededError):
    """Raised when tool output exceeds the cumulative output size budget."""
