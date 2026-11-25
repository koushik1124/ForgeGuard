from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import BaseModel, ConfigDict

from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import (
    TaskRecord,
    ToolExecutionRecord,
    ToolExecutionStatus,
)
from forgeguard.persistence.recovery import RecoveryEngine
from forgeguard.persistence.repository import serialize_json
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry
from forgeguard.tools.tool import Tool


class ValueInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    val: int


@pytest.fixture
def crash_db_path(tmp_path: Path) -> Path:
    return tmp_path / "crash_sim.db"


@pytest.mark.asyncio
async def test_crash_during_tool_execution(crash_db_path: Path) -> None:
    """Boundary 5 & 6: Tool is marked RUNNING, process terminates mid-execution."""
    manager1 = PersistenceManager(db_path=crash_db_path)
    await manager1.initialize()
    task = Task(description="Crash mid-tool", task_id="t-crash-mid")

    await manager1.on_task_start(task)
    await manager1.on_tool_intent(
        task.task_id,
        ToolCall(tool_name="side_effect", arguments={"val": 42}, call_id="c-mid"),
        step=0,
    )
    await manager1.on_tool_started(
        task_id=task.task_id,
        tool_call_id="c-mid",
        step=0,
        tool_name="side_effect",
        effective_timeout=30.0,
    )

    await manager1.close()

    # Second process restarts: open fresh persistence layer
    manager2 = PersistenceManager(db_path=crash_db_path)
    recovery = RecoveryEngine(manager2)
    report = await recovery.recover_task("t-crash-mid")

    assert "c-mid" in report.uncertain_calls
    assert report.can_resume_safely is False

    await manager2.close()


@pytest.mark.asyncio
async def test_crash_after_tool_completion_and_checkpoint(crash_db_path: Path) -> None:
    """Boundary 8 & 10: Tool 0 completed, checkpoint saved, process dies before Tool 1."""
    executed_tools: list[str] = []

    def tool_a(val: int) -> int:
        executed_tools.append("tool_a")
        return val * 2

    def tool_b(val: int) -> int:
        executed_tools.append("tool_b")
        return val + 10

    registry = ToolRegistry()
    registry.register(Tool(name="tool_a", description="A", handler=tool_a, input_model=ValueInput))
    registry.register(Tool(name="tool_b", description="B", handler=tool_b, input_model=ValueInput))

    policy = Policy(allowed_tools=frozenset({"tool_a", "tool_b"}))

    # Process 1: task is started, tool_a executes and checkpoint is written, then crash happens
    manager1 = PersistenceManager(db_path=crash_db_path)
    task = Task(description="Multi-step crash", task_id="t-multi-crash")
    call_a = ToolCall(tool_name="tool_a", arguments={"val": 5}, call_id="call-a")
    call_b = ToolCall(tool_name="tool_b", arguments={"val": 10}, call_id="call-b")

    await manager1.on_task_start(task)
    await manager1.on_tool_intent(task.task_id, call_a, 0)
    await manager1.on_tool_started(task.task_id, "call-a", 0, "tool_a", 30.0)
    out_a = tool_a(5)
    await manager1.on_tool_completed(
        task=task,
        tool_call_id="call-a",
        step=0,
        tool_name="tool_a",
        output=out_a,
        duration_seconds=0.01,
        budget_snapshot={"remaining_tool_calls": 5, "remaining_seconds": 30.0},
        partial_outputs={"step_0": out_a},
        completed_call_ids=["call-a"],
    )

    # Abruptly terminate Process 1 (no task_completed, task status in DB is RUNNING)
    await manager1.close()

    # Process 2: restarts, recovers task, and resumes with both tool_a and tool_b
    manager2 = PersistenceManager(db_path=crash_db_path)
    engine2 = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(policy),
        persistence=manager2,
    )

    res_resumed = await engine2.resume("t-multi-crash", [call_a, call_b])

    # Tool A must NOT have been executed a second time
    assert executed_tools == ["tool_a", "tool_b"]
    assert res_resumed.status == TaskStatus.COMPLETED
    assert res_resumed.outputs["step_0"] == 10
    assert res_resumed.outputs["step_1"] == 20

    await manager2.close()


@pytest.mark.asyncio
async def test_crash_after_task_completion_persistence(crash_db_path: Path) -> None:
    """Boundary 12: Process dies after task was completed in persistent storage."""
    manager1 = PersistenceManager(db_path=crash_db_path)
    registry = ToolRegistry()
    registry.register(
        Tool(name="t", description="T", handler=lambda val: val, input_model=ValueInput)
    )

    engine1 = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(Policy(allowed_tools=frozenset({"t"}))),
        persistence=manager1,
    )
    task = Task(description="Already done", task_id="t-done")
    call = ToolCall(tool_name="t", arguments={"val": 1}, call_id="c-done")

    res = await engine1.execute(task, [call])
    assert res.status == TaskStatus.COMPLETED
    await manager1.close()

    # Process 2 resumes already completed task
    manager2 = PersistenceManager(db_path=crash_db_path)
    recovery = RecoveryEngine(manager2)
    report = await recovery.recover_task("t-done")

    assert report.previous_status == TaskStatus.COMPLETED.value
    # A completed task cannot be resumed
    assert report.can_resume_safely is False

    await manager2.close()


@pytest.mark.asyncio
async def test_recovery_with_checkpoint_fallback_to_records(crash_db_path: Path) -> None:
    """Boundary 9: Checkpoint write failed or was omitted; recovery uses tool execution records."""
    manager = PersistenceManager(db_path=crash_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-fallback",
            description="Fallback task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    # Tool call completed but NO checkpoint saved
    await repo.record_tool_intent(
        ToolExecutionRecord(
            task_id="t-fallback",
            tool_call_id="call-recovered",
            tool_name="add",
            sequence_number=0,
            arguments_json=serialize_json({"val": 99}),
            status=ToolExecutionStatus.COMPLETED.value,
            result_json=serialize_json(198),
            idempotency_key="t-fallback:call-recovered",
        )
    )

    recovery = RecoveryEngine(manager)
    report = await recovery.recover_task("t-fallback")

    # Successfully reconstructed from records alone
    assert report.can_resume_safely is True
    assert report.reconstructed_position == 1
    assert "call-recovered" in report.completed_calls
    assert report.partial_outputs["step_0"] == 198
    assert report.checkpoint_id is None

    await manager.close()
