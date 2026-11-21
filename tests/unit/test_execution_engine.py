
from __future__ import annotations

import asyncio

import pytest
from pydantic import BaseModel, ConfigDict

from forgeguard.core.enums import TaskStatus
from forgeguard.core.exceptions import DuplicateToolError, ToolNotFoundError
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry
from forgeguard.tools.tool import Tool


class EchoInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    text: str


class AddInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    a: int
    b: int


class MultiplyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    a: int
    b: int


def build_engine() -> ExecutionEngine:
    registry = ToolRegistry()

    registry.register(
        Tool(
            name="echo",
            description="Echo text",
            handler=lambda text: text,
            input_model=EchoInput,
        )
    )

    registry.register(
        Tool(
            name="add",
            description="Add two numbers",
            handler=lambda a, b: a + b,
            input_model=AddInput,
        )
    )

    registry.register(
        Tool(
            name="multiply",
            description="Multiply two numbers",
            handler=lambda a, b: a * b,
            input_model=MultiplyInput,
        )
    )

    policy_engine = PolicyEngine(
        Policy(
            allowed_tools=frozenset({"echo", "add", "multiply"}),
            default_allow=False,
        )
    )

    return ExecutionEngine(registry, policy_engine=policy_engine)


@pytest.mark.asyncio
async def test_single_tool_execution() -> None:
    engine = build_engine()
    task = Task(description="Echo")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="echo", arguments={"text": "hello"})],
    )

    assert result.status == TaskStatus.COMPLETED
    assert result.outputs["step_0"] == "hello"
    assert result.error is None


@pytest.mark.asyncio
async def test_multiple_sequential_tools() -> None:
    engine = build_engine()
    task = Task(description="Calculate")

    calls = [
        ToolCall(tool_name="add", arguments={"a": 2, "b": 3}),
        ToolCall(tool_name="multiply", arguments={"a": 4, "b": 5}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.COMPLETED
    assert result.outputs["step_0"] == 5
    assert result.outputs["step_1"] == 20


@pytest.mark.asyncio
async def test_async_handler_execution() -> None:
    registry = ToolRegistry()

    async def async_handler(text: str) -> str:
        await asyncio.sleep(0.01)
        return f"async:{text}"

    registry.register(
        Tool(
            name="async_echo",
            description="Async echo",
            handler=async_handler,
            input_model=EchoInput,
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"async_echo"}))),
    )

    task = Task(description="Async execution")

    result = await engine.execute(
        task,
        [
            ToolCall(
                tool_name="async_echo",
                arguments={"text": "hello"},
            )
        ],
    )

    assert result.status == TaskStatus.COMPLETED
    assert result.outputs["step_0"] == "async:hello"


@pytest.mark.asyncio
async def test_sync_handler_does_not_block_event_loop() -> None:
    registry = ToolRegistry()

    registry.register(
        Tool(
            name="slow",
            description="Blocking tool",
            handler=lambda: asyncio.sleep(0.15, result="finished"),
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"slow"}))),
    )

    task = Task(description="Event loop test")

    heartbeat = False

    async def mark_heartbeat() -> None:
        nonlocal heartbeat
        await asyncio.sleep(0.02)
        heartbeat = True

    execution = asyncio.create_task(
        engine.execute(
            task,
            [ToolCall(tool_name="slow", arguments={})],
        )
    )

    await mark_heartbeat()
    result = await execution

    assert heartbeat is True
    assert result.status == TaskStatus.COMPLETED
    assert result.outputs["step_0"] == "finished"


@pytest.mark.asyncio
async def test_invalid_input_missing_required_field() -> None:
    engine = build_engine()
    task = Task(description="Invalid input")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="echo", arguments={})],
    )

    assert result.status == TaskStatus.FAILED
    assert result.outputs == {}
    assert "ValidationError" in (result.error or "")


@pytest.mark.asyncio
async def test_invalid_input_wrong_type() -> None:
    engine = build_engine()
    task = Task(description="Wrong input type")

    result = await engine.execute(
        task,
        [
            ToolCall(
                tool_name="add",
                arguments={"a": "2", "b": 3},
            )
        ],
    )

    assert result.status == TaskStatus.FAILED
    assert "ValidationError" in (result.error or "")


@pytest.mark.asyncio
async def test_invalid_input_extra_field() -> None:
    engine = build_engine()
    task = Task(description="Extra input")

    result = await engine.execute(
        task,
        [
            ToolCall(
                tool_name="echo",
                arguments={
                    "text": "hello",
                    "unexpected": "value",
                },
            )
        ],
    )

    assert result.status == TaskStatus.FAILED
    assert "ValidationError" in (result.error or "")


@pytest.mark.asyncio
async def test_invalid_tool_never_executes_handler() -> None:
    registry = ToolRegistry()
    executed = False

    def handler(text: str) -> str:
        nonlocal executed
        executed = True
        return text

    registry.register(
        Tool(
            name="protected",
            description="Protected tool",
            handler=handler,
            input_model=EchoInput,
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"protected"}))),
    )

    task = Task(description="Validate before execution")

    result = await engine.execute(
        task,
        [
            ToolCall(
                tool_name="protected",
                arguments={"unexpected": "value"},
            )
        ],
    )

    assert result.status == TaskStatus.FAILED
    assert executed is False


@pytest.mark.asyncio
async def test_unknown_tool_fails_task() -> None:
    engine = build_engine()
    task = Task(description="Unknown tool")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="missing", arguments={})],
    )

    assert result.status == TaskStatus.FAILED
    assert "ToolNotFoundError" in (result.error or "")


@pytest.mark.asyncio
async def test_handler_exception_fails_task() -> None:
    registry = ToolRegistry()

    def broken_handler(text: str) -> str:
        raise RuntimeError("tool exploded")

    registry.register(
        Tool(
            name="broken",
            description="Broken tool",
            handler=broken_handler,
            input_model=EchoInput,
        )
    )

    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"broken"}))),
    )

    task = Task(description="Broken execution")

    result = await engine.execute(
        task,
        [
            ToolCall(
                tool_name="broken",
                arguments={"text": "hello"},
            )
        ],
    )

    assert result.status == TaskStatus.FAILED
    assert "tool exploded" in (result.error or "")


@pytest.mark.asyncio
async def test_partial_outputs_preserved_after_failure() -> None:
    engine = build_engine()
    task = Task(description="Partial execution")

    calls = [
        ToolCall(tool_name="add", arguments={"a": 1, "b": 2}),
        ToolCall(tool_name="missing", arguments={}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert result.outputs["step_0"] == 3
    assert "step_1" not in result.outputs

@pytest.mark.asyncio
async def test_execution_events_have_failure_record() -> None:
    engine = build_engine()
    task = Task(description="Event test")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="missing", arguments={})],
    )

    event_types = [event.event_type for event in result.events]

    assert "task_started" in event_types
    assert "task_failed" in event_types
    assert "tool_call_started" not in event_types

def test_registry_rejects_duplicate_tools() -> None:
    registry = ToolRegistry()

    tool = Tool(
        name="echo",
        description="Echo",
        handler=lambda text: text,
        input_model=EchoInput,
    )

    registry.register(tool)

    with pytest.raises(DuplicateToolError):
        registry.register(tool)


def test_registry_missing_tool() -> None:
    registry = ToolRegistry()

    with pytest.raises(ToolNotFoundError):
        registry.get("missing")
