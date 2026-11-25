from __future__ import annotations

import time
from typing import Any

from forgeguard.agent.models import AgentDecision, FinalAction, parse_agent_decision
from forgeguard.agent.provider import BaseLLMProvider, ProviderResponse, TokenUsage


class MockProvider(BaseLLMProvider):
    """Deterministic mock provider for offline testing of agent loops."""

    def __init__(
        self,
        responses: list[AgentDecision | dict[str, Any] | Exception] | None = None,
        default_decision: AgentDecision | None = None,
        model: str = "mock-model",
        simulated_latency: float = 0.001,
        tokens_per_call: int = 50,
    ) -> None:
        self._responses: list[AgentDecision | dict[str, Any] | Exception] = (
            list(responses) if responses is not None else []
        )
        self._default_decision = default_decision or FinalAction(
            action_type="final",
            final_response="Default mock answer",
            summary="Mock completed",
        )
        self._model = model
        self.simulated_latency = simulated_latency
        self.tokens_per_call = tokens_per_call
        self.call_history: list[dict[str, Any]] = []

    @property
    def model_name(self) -> str:
        return self._model

    def queue_response(self, response: AgentDecision | dict[str, Any] | Exception) -> None:
        """Enqueue an additional mock response or exception."""
        self._responses.append(response)

    async def complete(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        call_record = {
            "messages": messages,
            "tools": tools,
            "timestamp": time.time(),
        }
        self.call_history.append(call_record)

        if self._responses:
            item = self._responses.pop(0)
            if isinstance(item, Exception):
                raise item
            if isinstance(item, AgentDecision):
                decision = item
                content = decision.model_dump_json()
                raw_json = decision.model_dump()
            else:
                decision = parse_agent_decision(item)
                raw_json = item
                content = str(item)
        else:
            decision = self._default_decision
            content = decision.model_dump_json()
            raw_json = decision.model_dump()

        usage = TokenUsage(
            prompt_tokens=self.tokens_per_call // 2,
            completion_tokens=self.tokens_per_call // 2,
            total_tokens=self.tokens_per_call,
        )

        return ProviderResponse(
            content=content,
            decision=decision,
            raw_json=raw_json,
            usage=usage,
            latency_seconds=self.simulated_latency,
            model=self._model,
        )
