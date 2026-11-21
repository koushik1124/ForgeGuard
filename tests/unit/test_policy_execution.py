
from __future__ import annotations

import pytest
from pydantic import BaseModel, ConfigDict

from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry
from forgeguard.tools.tool import Tool


class FileInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    path: str


@pytest.mark.asyncio
async def test_allowed_tool_executes() -> None:
    executed = []

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="read_file",
            description="Read a file",
            handler=lambda path: executed.append(path) or "file contents",
            input_model=FileInput,
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(
            Policy(allowed_tools=frozenset({"read_file"}))
        ),
    )

    task = Task(description="Read a file")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="read_file", arguments={"path": "test.txt"})],
    )

    assert result.status == TaskStatus.COMPLETED
    assert executed == ["test.txt"]
    assert result.outputs["step_0"] == "file contents"


@pytest.mark.asyncio
async def test_denied_tool_never_executes() -> None:
    executed = []

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="delete_file",
            description="Delete a file",
            handler=lambda path: executed.append(path),
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(
            Policy(denied_tools=frozenset({"delete_file"}))
        ),
    )

    task = Task(description="Delete a file")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="delete_file", arguments={"path": "important.txt"})],
    )

    assert result.status == TaskStatus.FAILED
    assert executed == []
    assert result.error is not None
    assert "PermissionError" in result.error


@pytest.mark.asyncio
async def test_default_deny_prevents_execution() -> None:
    executed = []

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="send_email",
            description="Send an email",
            handler=lambda recipient: executed.append(recipient),
        )
    )

    engine = ExecutionEngine(registry)

    task = Task(description="Send an email")

    result = await engine.execute(
        task,
        [
            ToolCall(
                tool_name="send_email",
                arguments={"recipient": "test@example.com"},
            )
        ],
    )

    assert result.status == TaskStatus.FAILED
    assert executed == []
    assert "PermissionError" in (result.error or "")


@pytest.mark.asyncio
async def test_policy_denial_generates_audit_events() -> None:
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="dangerous_tool",
            description="Restricted tool",
            handler=lambda: "should never execute",
        )
    )

    engine = ExecutionEngine(registry)

    task = Task(description="Attempt restricted action")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="dangerous_tool", arguments={})],
    )

    event_types = [event.event_type for event in result.events]

    assert "policy_decision" in event_types
    assert "tool_call_rejected" in event_types
    assert "task_failed" in event_types

    decision_events = [
        event
        for event in result.events
        if event.event_type == "policy_decision"
    ]

    assert decision_events[0].payload["allowed"] is False
    assert decision_events[0].payload["matched_rule"] == "default_deny"


@pytest.mark.asyncio
async def test_denied_tool_does_not_run_later_tools() -> None:
    executed = []

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="safe_tool",
            description="Allowed tool",
            handler=lambda: executed.append("safe"),
        )
    )
    registry.register(
        Tool(
            name="blocked_tool",
            description="Blocked tool",
            handler=lambda: executed.append("blocked"),
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(
            Policy(allowed_tools=frozenset({"safe_tool"}))
        ),
    )

    task = Task(description="Run safe then blocked")

    result = await engine.execute(
        task,
        [
            ToolCall(tool_name="safe_tool", arguments={}),
            ToolCall(tool_name="blocked_tool", arguments={}),
            ToolCall(tool_name="safe_tool", arguments={}),
        ],
    )

    assert result.status == TaskStatus.FAILED
    assert executed == ["safe"]
    assert "step_0" in result.outputs
    assert "step_1" not in result.outputs
    assert "step_2" not in result.outputs
