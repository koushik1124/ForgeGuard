from __future__ import annotations

from forgeguard.core.exceptions import ForgeGuardError


class PersistenceError(ForgeGuardError):
    """Base exception for persistence errors in ForgeGuard."""


class DatabaseConnectionError(PersistenceError):
    """Raised when database connection fails or cannot be established."""


class RecordNotFoundError(PersistenceError):
    """Raised when a requested record is not found in persistent storage."""


class IdempotencyConflictError(PersistenceError):
    """Raised when a tool call ID is reused with conflicting arguments."""


class UnrecoverableTaskError(PersistenceError):
    """Raised when an interrupted task cannot be safely recovered or resumed."""


class CheckpointCorruptedError(PersistenceError):
    """Raised when checkpoint data is invalid or cannot be deserialized."""
