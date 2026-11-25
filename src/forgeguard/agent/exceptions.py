from __future__ import annotations

from forgeguard.core.exceptions import ForgeGuardError


class AgentException(ForgeGuardError):
    """Base exception for agent subsystem errors."""


class AgentConfigurationError(AgentException):
    """Raised when an agent is improperly configured."""


class AgentIterationLimitError(AgentException):
    """Raised when an agent reaches its maximum reasoning iterations."""


class AgentContextOverflowError(AgentException):
    """Raised when agent context exceeds the configured bounds."""


class InvalidAgentDecisionError(AgentException):
    """Raised when the LLM returns an invalid or unparseable action decision."""


class ProviderError(AgentException):
    """Base exception for LLM provider errors."""


class ProviderConfigurationError(ProviderError):
    """Raised when an LLM provider is improperly configured (e.g. missing API key)."""


class ProviderAuthenticationError(ProviderError):
    """Raised when LLM provider authentication fails (e.g. invalid or missing API key)."""


class ProviderRateLimitError(ProviderError):
    """Raised when LLM provider rate limits are exceeded (HTTP 429)."""


class ProviderTimeoutError(ProviderError):
    """Raised when an LLM provider request times out."""


class ProviderNetworkError(ProviderError):
    """Raised when network connectivity to an LLM provider fails."""


class ProviderResponseError(ProviderError):
    """Raised when an LLM provider returns a malformed or unexpected response."""


class ModelUnavailableError(ProviderError):
    """Raised when the requested model is not found or is currently unavailable."""
