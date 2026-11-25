from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from forgeguard.agent.models import AgentDecision
from forgeguard.persistence.repository import serialize_json


@dataclass
class ContextEntry:
    """A single record of agent deliberation, action, or tool outcome."""

    entry_type: str  # "assistant_action", "tool_result", "policy_denial", "system_notice"
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "entry_type": self.entry_type,
            "content": self.content,
            "metadata": self.metadata,
        }


class AgentContext:
    """Bounded chronological context manager for agent reasoning.

    Maintains the user prompt, system instructions, decisions, and tool outputs
    while preventing unbounded memory growth through observable pruning.
    """

    def __init__(
        self,
        user_task: str,
        system_prompt: str,
        max_history_entries: int = 20,
    ) -> None:
        self.user_task = user_task
        self.system_prompt = system_prompt
        self.max_history_entries = max_history_entries
        self.entries: list[ContextEntry] = []
        self.truncation_count: int = 0

    def add_assistant_decision(self, decision: AgentDecision) -> None:
        """Record an LLM-generated decision."""
        content = decision.model_dump_json()
        self.entries.append(
            ContextEntry(
                entry_type="assistant_action",
                content=content,
                metadata={"action_type": decision.action_type},
            )
        )
        self._prune_if_needed()

    def add_tool_result(
        self,
        tool_name: str,
        call_id: str,
        output: Any,
        is_error: bool = False,
    ) -> None:
        """Record a tool execution outcome."""
        serialized_output = output if isinstance(output, str) else serialize_json(output)
        status_label = "ERROR" if is_error else "SUCCESS"
        content = (
            f"[{status_label}] Tool '{tool_name}' (call_id: {call_id}) returned:\n"
            f"{serialized_output}"
        )

        self.entries.append(
            ContextEntry(
                entry_type="tool_result",
                content=content,
                metadata={
                    "tool_name": tool_name,
                    "call_id": call_id,
                    "is_error": is_error,
                },
            )
        )
        self._prune_if_needed()

    def add_policy_denial(self, tool_name: str, reason: str) -> None:
        """Record an authorization policy rejection."""
        content = f"[POLICY_DENIED] Tool '{tool_name}' was blocked by ForgeGuard policy: {reason}"
        self.entries.append(
            ContextEntry(
                entry_type="policy_denial",
                content=content,
                metadata={"tool_name": tool_name, "reason": reason},
            )
        )
        self._prune_if_needed()

    def add_system_notice(self, notice: str) -> None:
        """Record an execution notice or budget warning."""
        content = f"[SYSTEM_NOTICE] {notice}"
        self.entries.append(
            ContextEntry(
                entry_type="system_notice",
                content=content,
                metadata={},
            )
        )
        self._prune_if_needed()

    def _prune_if_needed(self) -> None:
        """Observable context trimming: prunes older entries when capacity is exceeded."""
        if len(self.entries) > self.max_history_entries:
            overflow = len(self.entries) - self.max_history_entries
            # Retain the most recent entries
            self.entries = self.entries[overflow:]
            self.truncation_count += 1

    def to_messages(self) -> list[dict[str, str]]:
        """Format the bounded context into provider chat completion messages."""
        messages: list[dict[str, str]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"Task: {self.user_task}"},
        ]

        if self.truncation_count > 0:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        f"[NOTE: Prior history was trimmed ({self.truncation_count} times) "
                        "to stay within bounded context limits. Focus on recent results above.]"
                    ),
                }
            )

        for entry in self.entries:
            if entry.entry_type == "assistant_action":
                messages.append({"role": "assistant", "content": entry.content})
            else:
                # Tool outcomes, denials, and notices presented as user observations
                messages.append({"role": "user", "content": entry.content})

        return messages

    def get_history_summary(self) -> list[dict[str, Any]]:
        return [entry.to_dict() for entry in self.entries]
