class ForgeGuardError(Exception):
    """Base exception for ForgeGuard."""


class InvalidStateTransitionError(ForgeGuardError):
    """Raised when a task attempts an illegal state transition."""


class ToolNotFoundError(ForgeGuardError):
    """Raised when an unknown tool is requested."""


class ToolExecutionError(ForgeGuardError):
    """Raised when a tool fails during execution."""


class DuplicateToolError(ForgeGuardError):
    """Raised when a tool name is already registered."""


class InvalidToolInputError(ForgeGuardError):
    """Raised when tool input fails validation."""
