
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class Policy:
    allowed_tools: frozenset[str] = field(default_factory=frozenset)
    denied_tools: frozenset[str] = field(default_factory=frozenset)
    default_allow: bool = False

    def __post_init__(self) -> None:
        if any(not name.strip() for name in self.allowed_tools):
            raise ValueError("Allowed tool names cannot be empty")
        if any(not name.strip() for name in self.denied_tools):
            raise ValueError("Denied tool names cannot be empty")


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    tool_name: str
    reason: str
    matched_rule: str
    timestamp: datetime
    metadata: dict[str, Any] = field(default_factory=dict)


class PolicyEngine:
    def __init__(self, policy: Policy | None = None) -> None:
        # Fail closed when no policy has been configured.
        self.policy = policy or Policy()

    def evaluate(self, tool_name: str, metadata: dict[str, Any] | None = None) -> PolicyDecision:
        timestamp = datetime.now(timezone.utc)
        metadata = metadata or {}

        # Explicit denials always take precedence.
        if tool_name in self.policy.denied_tools:
            return PolicyDecision(
                allowed=False,
                tool_name=tool_name,
                reason=f"Tool '{tool_name}' is explicitly denied",
                matched_rule="explicit_deny",
                timestamp=timestamp,
                metadata=metadata,
            )

        if tool_name in self.policy.allowed_tools:
            return PolicyDecision(
                allowed=True,
                tool_name=tool_name,
                reason=f"Tool '{tool_name}' is explicitly allowed",
                matched_rule="explicit_allow",
                timestamp=timestamp,
                metadata=metadata,
            )

        if self.policy.default_allow:
            return PolicyDecision(
                allowed=True,
                tool_name=tool_name,
                reason=f"Tool '{tool_name}' is allowed by default policy",
                matched_rule="default_allow",
                timestamp=timestamp,
                metadata=metadata,
            )

        return PolicyDecision(
            allowed=False,
            tool_name=tool_name,
            reason=f"Tool '{tool_name}' is not allowlisted",
            matched_rule="default_deny",
            timestamp=timestamp,
            metadata=metadata,
        )
