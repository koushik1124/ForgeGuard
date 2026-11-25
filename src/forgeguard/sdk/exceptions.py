from __future__ import annotations

from typing import Any


class ForgeGuardSDKError(Exception):
    """Base exception for all ForgeGuard Python SDK errors."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details


class APIConnectionError(ForgeGuardSDKError):
    """Raised when failing to communicate with the ForgeGuard server."""


class AuthenticationError(ForgeGuardSDKError):
    """Raised when API key is missing, invalid, or unauthorized."""


class NotFoundError(ForgeGuardSDKError):
    """Raised when a requested task, workspace, or resource is not found."""


class ConflictError(ForgeGuardSDKError):
    """Raised when an operation conflicts with current state or idempotency."""


class PolicyViolationAPIError(ForgeGuardSDKError):
    """Raised when an action is denied by runtime security policy."""


class BudgetExceededAPIError(ForgeGuardSDKError):
    """Raised when an execution exhausts runtime budgets."""


class UnrecoverableTaskAPIError(ForgeGuardSDKError):
    """Raised when a task cannot be safely recovered."""
