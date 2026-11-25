from __future__ import annotations

import asyncio
import time

import pytest
from pydantic import BaseModel, ConfigDict

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry
from forgeguard.tools.tool import Tool


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str


class MathInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    a: int
    b: int


def build_test_registry() -> ToolRegistry:
    registry = ToolRegistry()

    registry.register(
        Tool(
            name="echo",
            description="Echoes text input",
            handler=lambda text: text,
            input_model=TextInput,
        )
    )

    registry.register(
        Tool(
            name="add",
            description="Adds two numbers",
            handler=lambda a, b: a + b,
            input_model=MathInput,
        )
    )

    registry.register(
        Tool(
            name="fail_tool",
            description="Always raises an exception",
            handler=lambda: (_ for _ in ()).throw(RuntimeError("tool failure")),
        )
    )

    return registry


@pytest.mark.asyncio
async def test_execution_succeeds_within_budget() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"echo", "add"}))
    budget = ExecutionBudget(max_tool_calls=5, max_execution_seconds=10.0)

    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)
    task = Task(description="Within budget task")

    calls = [
        ToolCall(tool_name="echo", arguments={"text": "hello"}),
        ToolCall(tool_name="add", arguments={"a": 3, "b": 7}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.COMPLETED
    assert result.outputs["step_0"] == "hello"
    assert result.outputs["step_1"] == 10
    assert result.error is None

    # Check budget events
    event_types = [e.event_type for e in result.events]
    assert "budget_initialized" in event_types
    assert "budget_updated" in event_types
    assert "task_completed" in event_types


@pytest.mark.asyncio
async def test_tool_call_budget_blocks_subsequent_tool_execution() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"echo"}))
    # Limit max tool calls to 2
    budget = ExecutionBudget(max_tool_calls=2)

    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)
    task = Task(description="Exceed tool call limit")

    calls = [
        ToolCall(tool_name="echo", arguments={"text": "one"}),
        ToolCall(tool_name="echo", arguments={"text": "two"}),
        ToolCall(tool_name="echo", arguments={"text": "three"}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert result.outputs["step_0"] == "one"
    assert result.outputs["step_1"] == "two"
    assert "step_2" not in result.outputs
    assert "ToolCallLimitExceededError" in (result.error or "")

    event_types = [e.event_type for e in result.events]
    assert "budget_exceeded" in event_types
    assert "task_failed" in event_types

    budget_exceeded_events = [e for e in result.events if e.event_type == "budget_exceeded"]
    assert budget_exceeded_events[0].payload["limit"] == "max_tool_calls"


@pytest.mark.asyncio
async def test_tool_call_budget_is_consumed_before_execution() -> None:
    executed = False

    def monitored_handler(text: str) -> str:
        nonlocal executed
        executed = True
        return text

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="monitored",
            description="Monitored tool",
            handler=monitored_handler,
            input_model=TextInput,
        )
    )

    budget = ExecutionBudget(max_tool_calls=1)
    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"monitored"}))),
        budget=budget,
    )

    task = Task(description="Pre-execution reservation")
    calls = [
        ToolCall(tool_name="monitored", arguments={"text": "first"}),
        ToolCall(tool_name="monitored", arguments={"text": "second"}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert result.outputs["step_0"] == "first"
    # Second invocation should never execute
    assert "step_1" not in result.outputs


@pytest.mark.asyncio
async def test_tool_timeout() -> None:
    registry = ToolRegistry()

    async def slow_async_handler() -> str:
        await asyncio.sleep(0.2)
        return "slow done"

    registry.register(
        Tool(
            name="slow_tool",
            description="Slow async tool",
            handler=slow_async_handler,
        )
    )

    # 0.05 second tool timeout
    budget = ExecutionBudget(max_tool_duration_seconds=0.05, max_execution_seconds=5.0)
    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"slow_tool"}))),
        budget=budget,
    )

    task = Task(description="Tool timeout test")
    result = await engine.execute(
        task,
        [ToolCall(tool_name="slow_tool", arguments={})],
    )

    assert result.status == TaskStatus.FAILED
    assert result.outputs == {}
    assert "ToolTimeoutError" in (result.error or "")

    event_types = [e.event_type for e in result.events]
    assert "tool_timeout" in event_types
    assert "task_failed" in event_types


@pytest.mark.asyncio
async def test_total_task_deadline() -> None:
    registry = ToolRegistry()

    async def sleep_handler() -> str:
        await asyncio.sleep(0.04)
        return "awake"

    registry.register(
        Tool(
            name="sleep_tool",
            description="Sleeps",
            handler=sleep_handler,
        )
    )

    # Overall task deadline of 0.06s with 3 calls taking 0.04s each
    budget = ExecutionBudget(
        max_execution_seconds=0.06,
        max_tool_duration_seconds=1.0,
    )
    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"sleep_tool"}))),
        budget=budget,
    )

    task = Task(description="Total deadline test")
    calls = [
        ToolCall(tool_name="sleep_tool", arguments={}),
        ToolCall(tool_name="sleep_tool", arguments={}),
        ToolCall(tool_name="sleep_tool", arguments={}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert "ExecutionTimeoutError" in (result.error or "")
    assert "step_0" in result.outputs

    event_types = [e.event_type for e in result.events]
    assert "budget_exceeded" in event_types
    budget_exceeded_events = [e for e in result.events if e.event_type == "budget_exceeded"]
    assert budget_exceeded_events[0].payload["limit"] == "max_execution_seconds"


@pytest.mark.asyncio
async def test_output_budget_exhaustion() -> None:
    registry = ToolRegistry()

    registry.register(
        Tool(
            name="large_output",
            description="Generates output",
            handler=lambda text: text,
            input_model=TextInput,
        )
    )

    # Max output budget: 20 bytes
    budget = ExecutionBudget(max_output_bytes=20)
    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"large_output"}))),
        budget=budget,
    )

    task = Task(description="Output budget test")
    calls = [
        # 10 bytes: fits
        ToolCall(tool_name="large_output", arguments={"text": "1234567890"}),
        # 15 bytes: exceeds remaining 10 bytes
        ToolCall(tool_name="large_output", arguments={"text": "abcdefghijklmno"}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert result.outputs["step_0"] == "1234567890"
    # Oversized output must not be retained in task outputs
    assert "step_1" not in result.outputs
    assert "OutputSizeExceededError" in (result.error or "")

    event_types = [e.event_type for e in result.events]
    assert "budget_exceeded" in event_types
    budget_exceeded_events = [e for e in result.events if e.event_type == "budget_exceeded"]
    assert budget_exceeded_events[0].payload["limit"] == "max_output_bytes"


@pytest.mark.asyncio
async def test_failure_threshold_stops_task() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"fail_tool", "echo"}))
    # Allow 2 consecutive failures
    budget = ExecutionBudget(max_consecutive_failures=2)

    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)
    task = Task(description="Failure threshold test")

    calls = [
        ToolCall(tool_name="fail_tool", arguments={}),
        ToolCall(tool_name="fail_tool", arguments={}),
        ToolCall(tool_name="echo", arguments={"text": "never called"}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert "ConsecutiveFailuresExceededError" in (result.error or "")
    assert "step_2" not in result.outputs

    event_types = [e.event_type for e in result.events]
    assert "budget_exceeded" in event_types
    budget_exceeded_events = [e for e in result.events if e.event_type == "budget_exceeded"]
    assert budget_exceeded_events[0].payload["limit"] == "max_consecutive_failures"


@pytest.mark.asyncio
async def test_successful_tool_resets_failure_streak() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"fail_tool", "echo"}))
    # Threshold is 2
    budget = ExecutionBudget(max_consecutive_failures=2)

    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)
    task = Task(description="Failure streak reset")

    # Sequence: fail (streak 1), success (resets to 0), fail (streak 1)
    calls = [
        ToolCall(tool_name="fail_tool", arguments={}),
        ToolCall(tool_name="echo", arguments={"text": "recovered"}),
        ToolCall(tool_name="fail_tool", arguments={}),
    ]

    result = await engine.execute(task, calls)

    # All tools ran because streak never reached 2; task finishes FAILED because some steps failed
    assert result.status == TaskStatus.FAILED
    assert result.outputs["step_1"] == "recovered"

    # ConsecutiveFailuresExceededError should NOT have been raised
    assert "ConsecutiveFailuresExceededError" not in (result.error or "")


@pytest.mark.asyncio
async def test_partial_outputs_survive_failure() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"echo", "fail_tool"}))
    budget = ExecutionBudget(max_consecutive_failures=1)

    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)
    task = Task(description="Partial outputs survive")

    calls = [
        ToolCall(tool_name="echo", arguments={"text": "step 0 works"}),
        ToolCall(tool_name="fail_tool", arguments={}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert result.outputs["step_0"] == "step 0 works"
    assert "step_1" not in result.outputs


@pytest.mark.asyncio
async def test_budget_events_emitted() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"echo"}))

    engine = ExecutionEngine(registry, PolicyEngine(policy))
    task = Task(description="Event emission test")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="echo", arguments={"text": "test"})],
    )

    event_types = [e.event_type for e in result.events]
    assert "task_started" in event_types
    assert "budget_initialized" in event_types
    assert "tool_call_started" in event_types
    assert "tool_call_completed" in event_types
    assert "budget_updated" in event_types
    assert "task_completed" in event_types

    # Inspect budget_updated payload
    budget_updates = [e for e in result.events if e.event_type == "budget_updated"]
    assert len(budget_updates) == 1
    update_payload = budget_updates[0].payload
    assert update_payload["consumed_tool_calls"] == 1
    assert update_payload["output_bytes_consumed"] == len("test")
    assert "remaining_seconds" in update_payload


@pytest.mark.asyncio
async def test_policy_denial_does_not_consume_tool_call_budget() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"echo"}))  # 'add' is not allowed
    budget = ExecutionBudget(max_tool_calls=1)

    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)
    task = Task(description="Policy denial does not consume call budget")

    calls = [
        ToolCall(tool_name="add", arguments={"a": 1, "b": 2}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.FAILED
    assert "PermissionError" in (result.error or "")

    # Tool call was rejected before reservation, so no budget_updated for tool execution
    event_types = [e.event_type for e in result.events]
    assert "tool_call_rejected" in event_types
    assert "tool_call_started" not in event_types


@pytest.mark.asyncio
async def test_unauthorized_calls_do_not_execute() -> None:
    executed = False

    def restricted_handler() -> str:
        nonlocal executed
        executed = True
        return "unauthorized"

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="restricted",
            description="Restricted tool",
            handler=restricted_handler,
        )
    )

    # Default deny policy
    engine = ExecutionEngine(registry, PolicyEngine(Policy(default_allow=False)))
    task = Task(description="Unauthorized execution attempt")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="restricted", arguments={})],
    )

    assert result.status == TaskStatus.FAILED
    assert executed is False
    assert "PermissionError" in (result.error or "")


@pytest.mark.asyncio
async def test_unknown_tool_handling_remains_correct() -> None:
    registry = build_test_registry()
    engine = ExecutionEngine(registry)
    task = Task(description="Unknown tool test")

    result = await engine.execute(
        task,
        [ToolCall(tool_name="nonexistent_tool", arguments={})],
    )

    assert result.status == TaskStatus.FAILED
    assert "ToolNotFoundError" in (result.error or "")


@pytest.mark.asyncio
async def test_async_handler_timeout() -> None:
    registry = ToolRegistry()

    async def hanging_handler() -> str:
        await asyncio.sleep(0.5)
        return "done"

    registry.register(
        Tool(
            name="hang",
            description="Hanging async tool",
            handler=hanging_handler,
        )
    )

    budget = ExecutionBudget(max_tool_duration_seconds=0.03)
    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"hang"}))),
        budget=budget,
    )

    task = Task(description="Async timeout")
    start = time.monotonic()
    result = await engine.execute(task, [ToolCall(tool_name="hang", arguments={})])
    duration = time.monotonic() - start

    assert duration < 0.2
    assert result.status == TaskStatus.FAILED
    assert "ToolTimeoutError" in (result.error or "")


@pytest.mark.asyncio
async def test_sync_handler_behavior_under_timeout() -> None:
    registry = ToolRegistry()

    def sync_slow_handler() -> str:
        time.sleep(0.08)
        return "sync done"

    registry.register(
        Tool(
            name="sync_slow",
            description="Sync slow tool",
            handler=sync_slow_handler,
        )
    )

    budget = ExecutionBudget(max_tool_duration_seconds=0.02)
    engine = ExecutionEngine(
        registry,
        PolicyEngine(Policy(allowed_tools=frozenset({"sync_slow"}))),
        budget=budget,
    )

    task = Task(description="Sync timeout test")
    start = time.monotonic()
    result = await engine.execute(task, [ToolCall(tool_name="sync_slow", arguments={})])
    duration = time.monotonic() - start

    # The runtime cancels the await and returns without waiting for the full 0.08s sync sleep
    assert duration < 0.06
    assert result.status == TaskStatus.FAILED
    assert "ToolTimeoutError" in (result.error or "")
    assert task.status == TaskStatus.FAILED


@pytest.mark.asyncio
async def test_empty_tool_call_task_behavior() -> None:
    registry = build_test_registry()
    engine = ExecutionEngine(registry)
    task = Task(description="Empty calls")

    result = await engine.execute(task, [])

    assert result.status == TaskStatus.COMPLETED
    assert result.outputs == {}
    assert result.error is None
    event_types = [e.event_type for e in result.events]
    assert "task_started" in event_types
    assert "budget_initialized" in event_types
    assert "task_completed" in event_types


@pytest.mark.asyncio
async def test_concurrent_executions_do_not_share_tracker_state() -> None:
    registry = build_test_registry()
    policy = Policy(allowed_tools=frozenset({"echo"}))
    budget = ExecutionBudget(max_tool_calls=2)
    engine = ExecutionEngine(registry, PolicyEngine(policy), budget=budget)

    task1 = Task(description="Concurrent task 1")
    task2 = Task(description="Concurrent task 2")

    calls1 = [
        ToolCall(tool_name="echo", arguments={"text": "task1_step0"}),
        ToolCall(tool_name="echo", arguments={"text": "task1_step1"}),
    ]
    calls2 = [
        ToolCall(tool_name="echo", arguments={"text": "task2_step0"}),
        ToolCall(tool_name="echo", arguments={"text": "task2_step1"}),
    ]

    res1, res2 = await asyncio.gather(
        engine.execute(task1, calls1),
        engine.execute(task2, calls2),
    )

    # If tracker state was shared, total tool calls would be 4 and exceed max_tool_calls=2
    # Both tasks must complete successfully due to isolated tracker instances
    assert res1.status == TaskStatus.COMPLETED
    assert res2.status == TaskStatus.COMPLETED
    assert res1.outputs["step_0"] == "task1_step0"
    assert res2.outputs["step_0"] == "task2_step0"
