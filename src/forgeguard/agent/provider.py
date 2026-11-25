from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from forgeguard.agent.models import AgentDecision


@dataclass
class TokenUsage:
    """Token consumption statistics for an LLM provider request."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
        }


@dataclass
class ProviderResponse:
    """Structured response from an LLM provider completion request."""

    content: str
    decision: AgentDecision
    raw_json: dict[str, Any] = field(default_factory=dict)
    usage: TokenUsage = field(default_factory=TokenUsage)
    latency_seconds: float = 0.0
    model: str = ""


class BaseLLMProvider(ABC):
    """Abstract interface for LLM provider integrations.

    Decouples the agent orchestration loop from specific LLM vendors.
    """

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the configured model."""
        ...

    @abstractmethod
    async def complete(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        """Send conversation messages and available tools to the LLM.

        Returns a validated ProviderResponse containing a typed AgentDecision.
        """
        ...
