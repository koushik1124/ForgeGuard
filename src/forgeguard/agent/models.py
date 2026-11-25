from __future__ import annotations

import json
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forgeguard.agent.exceptions import InvalidAgentDecisionError
from forgeguard.persistence.repository import serialize_json


class AgentStatus(str, Enum):
    """Terminal or execution status of an agent run."""

    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    ITERATION_LIMIT_REACHED = "iteration_limit_reached"
    BUDGET_EXHAUSTED = "budget_exhausted"
    POLICY_BLOCKED = "policy_blocked"


class ToolAction(BaseModel):
    """Structured decision by the agent to execute a governed tool."""

    model_config = ConfigDict(extra="forbid")

    action_type: Literal["tool"] = "tool"
    tool_name: str = Field(..., min_length=1, description="Name of the registered tool to call")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Structured tool arguments")
    rationale: str = Field(
        ..., min_length=1, description="Reasoning and intent behind selecting this tool"
    )


class FinalAction(BaseModel):
    """Structured decision by the agent declaring task completion."""

    model_config = ConfigDict(extra="forbid")

    action_type: Literal["final"] = "final"
    final_response: str = Field(
        ..., min_length=1, description="Comprehensive final response to user task"
    )
    summary: str | None = Field(
        default=None, description="Optional concise summary of actions performed"
    )


AgentDecision = ToolAction | FinalAction


def parse_agent_decision(raw: str | dict[str, Any]) -> AgentDecision:
    """Parse and validate raw model output into a typed AgentDecision.

    Rejects malformed JSON, missing fields, invalid action types, and unexpected fields.
    """
    if isinstance(raw, str):
        cleaned = raw.strip()
        # Handle markdown-wrapped JSON ```json ... ``` or conversational preamble
        if "```" in cleaned:
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                cleaned = cleaned[first_brace : last_brace + 1]

        try:
            parsed_data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise InvalidAgentDecisionError(f"Model response is not valid JSON: {exc}") from exc
    elif isinstance(raw, dict):
        parsed_data = raw
    else:
        raise InvalidAgentDecisionError(
            f"Expected string or dict for agent decision, got {type(raw).__name__}"
        )

    if not isinstance(parsed_data, dict):
        raise InvalidAgentDecisionError("Agent decision payload must be a JSON object.")

    action_type = parsed_data.get("action_type")
    if not action_type:
        raise InvalidAgentDecisionError("Missing required field 'action_type' in agent decision.")

    try:
        if action_type == "tool":
            return ToolAction.model_validate(parsed_data)
        elif action_type == "final":
            return FinalAction.model_validate(parsed_data)
        else:
            raise InvalidAgentDecisionError(
                f"Invalid action_type '{action_type}'. Must be 'tool' or 'final'."
            )
    except ValidationError as exc:
        formatted_errs = [
            f"{'.'.join(str(loc_part) for loc_part in err['loc'])}: {err['msg']}"
            for err in exc.errors()
        ]
        errors_summary = "; ".join(formatted_errs)
        raise InvalidAgentDecisionError(
            f"Schema validation failed for '{action_type}' action: {errors_summary}"
        ) from exc


class AgentResult(BaseModel):
    """Comprehensive structured outcome of an agent execution."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    trace_id: str | None = None
    status: AgentStatus
    final_response: str | None = None
    iterations: int = 0
    tool_call_count: int = 0
    successful_tool_count: int = 0
    failed_tool_count: int = 0
    policy_denial_count: int = 0
    budget_summary: dict[str, Any] = Field(default_factory=dict)
    duration_seconds: float = 0.0
    errors: list[str] = Field(default_factory=list)
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()

    def to_json(self) -> str:
        return serialize_json(self.to_dict())
