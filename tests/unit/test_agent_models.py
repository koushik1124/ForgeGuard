from __future__ import annotations

import pytest

from forgeguard.agent.exceptions import InvalidAgentDecisionError
from forgeguard.agent.models import (
    AgentResult,
    AgentStatus,
    FinalAction,
    ToolAction,
    parse_agent_decision,
)


def test_valid_tool_action_and_serialization() -> None:
    action = ToolAction(
        action_type="tool",
        tool_name="calculator",
        arguments={"expression": "12 + 34"},
        rationale="Need to compute sum",
    )
    assert action.action_type == "tool"
    assert action.tool_name == "calculator"
    assert action.arguments == {"expression": "12 + 34"}
    assert action.rationale == "Need to compute sum"

    data = action.model_dump()
    assert data["action_type"] == "tool"

    parsed = parse_agent_decision(data)
    assert isinstance(parsed, ToolAction)
    assert parsed.tool_name == "calculator"


def test_valid_final_action_and_serialization() -> None:
    action = FinalAction(
        action_type="final",
        final_response="The answer is 46.",
        summary="Computed sum using calculator",
    )
    assert action.action_type == "final"
    assert action.final_response == "The answer is 46."
    assert action.summary == "Computed sum using calculator"

    parsed = parse_agent_decision(action.model_dump())
    assert isinstance(parsed, FinalAction)
    assert parsed.final_response == "The answer is 46."


def test_parse_markdown_wrapped_json() -> None:
    raw_markdown = """```json
    {
        "action_type": "tool",
        "tool_name": "text_analysis",
        "arguments": {"text": "hello world"},
        "rationale": "Counting words"
    }
    ```"""
    parsed = parse_agent_decision(raw_markdown)
    assert isinstance(parsed, ToolAction)
    assert parsed.tool_name == "text_analysis"


def test_parse_invalid_json_raises_error() -> None:
    with pytest.raises(InvalidAgentDecisionError, match="not valid JSON"):
        parse_agent_decision("NOT A JSON STRING")


def test_parse_missing_action_type() -> None:
    with pytest.raises(InvalidAgentDecisionError, match="Missing required field 'action_type'"):
        parse_agent_decision({"tool_name": "calculator"})


def test_parse_invalid_action_type() -> None:
    with pytest.raises(InvalidAgentDecisionError, match="Invalid action_type 'unknown_action'"):
        parse_agent_decision({"action_type": "unknown_action", "payload": 123})


def test_parse_extra_field_forbidden() -> None:
    with pytest.raises(InvalidAgentDecisionError, match="extra"):
        parse_agent_decision(
            {
                "action_type": "tool",
                "tool_name": "calculator",
                "arguments": {},
                "rationale": "reason",
                "forbidden_extra_field": "illegal",
            }
        )


def test_agent_result_serialization() -> None:
    result = AgentResult(
        task_id="t-001",
        trace_id="tr-001",
        status=AgentStatus.COMPLETED,
        final_response="Done",
        iterations=2,
        tool_call_count=1,
        successful_tool_count=1,
        failed_tool_count=0,
        policy_denial_count=0,
        budget_summary={"consumed_tool_calls": 1},
        duration_seconds=0.45,
        errors=[],
        history=[],
        usage={"total_tokens": 120},
    )

    data = result.to_dict()
    assert data["task_id"] == "t-001"
    assert data["status"] == "completed"
    assert data["iterations"] == 2

    json_str = result.to_json()
    assert "t-001" in json_str
    assert "completed" in json_str
