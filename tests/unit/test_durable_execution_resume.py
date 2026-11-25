from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import BaseModel, ConfigDict

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import ToolExecutionRecord, ToolExecutionStatus
from forgeguard.persistence.repository import serialize_json
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


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    return tmp_path / "durable_exec.db"


@pytest.mark.asyncio
async def test_durable_execution_persists_state_and_journal(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="echo",
            description="Echo",
            handler=lambda text: f"echo:{text}",
            input_model=EchoInput,
        )
    )

    policy = Policy(allowed_tools=frozenset({"echo"}))
    engine = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(policy),
        persistence=manager,
    )

    task = Task(description="Durable task 1")
    calls = [
        ToolCall(tool_name="echo", arguments={"text": "hello"}),
    ]

    result = await engine.execute(task, calls)

    assert result.status == TaskStatus.COMPLETED
    assert result.outputs["step_0"] == "echo:hello"

    # Verify database persistence
    task_rec = await manager.repository.get_task(task.task_id)
    assert task_rec is not None
    assert task_rec.status == TaskStatus.COMPLETED.value
    assert task_rec.current_position == 1

    events = await manager.repository.get_events(task.task_id)
    event_types = [e.event_type for e in events]
    assert "task_started" in event_types
    assert "budget_initialized" in event_types
    assert "tool_call_started" in event_types
    assert "tool_call_completed" in event_types
    assert "task_completed" in event_types

    chks = await manager.repository.list_checkpoints(task.task_id)
    assert len(chks) == 1
    assert chks[0].execution_position == 1

    await manager.close()


@pytest.mark.asyncio
async def test_resume_skips_completed_tools_and_runs_remaining(temp_db_path: Path) -> None:
    executed_steps: list[str] = []

    def tool_step0(text: str) -> str:
        executed_steps.append("step0")
        return f"step0:{text}"

    def tool_step1(text: str) -> str:
        executed_steps.append("step1")
        return f"step1:{text}"

    manager = PersistenceManager(db_path=temp_db_path)
    registry = ToolRegistry()
    registry.register(
        Tool(name="step0_tool", description="Step 0", handler=tool_step0, input_model=EchoInput)
    )
    registry.register(
        Tool(name="step1_tool", description="Step 1", handler=tool_step1, input_model=EchoInput)
    )

    policy = Policy(allowed_tools=frozenset({"step0_tool", "step1_tool"}))

    task = Task(description="Resumable task")
    call0 = ToolCall(tool_name="step0_tool", arguments={"text": "data0"}, call_id="c0")
    call1 = ToolCall(tool_name="step1_tool", arguments={"text": "data1"}, call_id="c1")

    # Simulate task started and step 0 completed before interruption
    await manager.on_task_start(task)
    await manager.on_tool_intent(task.task_id, call0, 0)
    await manager.on_tool_started(task.task_id, "c0", 0, "step0_tool", 30.0)
    out0 = tool_step0("data0")
    await manager.on_tool_completed(
        task=task,
        tool_call_id="c0",
        step=0,
        tool_name="step0_tool",
        output=out0,
        duration_seconds=0.01,
        budget_snapshot={"remaining_tool_calls": 10, "remaining_seconds": 60.0},
        partial_outputs={"step_0": out0},
        completed_call_ids=["c0"],
    )

    # Process crashes: close manager
    await manager.close()

    # Process 2 restarts and resumes task
    manager2 = PersistenceManager(db_path=temp_db_path)
    engine2 = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(policy),
        persistence=manager2,
    )

    result_resumed = await engine2.resume(task.task_id, [call0, call1])

    assert result_resumed.status == TaskStatus.COMPLETED
    assert result_resumed.outputs["step_0"] == "step0:data0"
    assert result_resumed.outputs["step_1"] == "step1:data1"
    # step0 was executed only once; step1 was executed on resume
    assert executed_steps == ["step0", "step1"]

    await manager2.close()


@pytest.mark.asyncio
async def test_resume_enforces_security_policy_on_remaining_calls(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="safe_tool",
            description="Safe",
            handler=lambda text: text,
            input_model=EchoInput,
        )
    )
    registry.register(
        Tool(
            name="blocked_tool",
            description="Blocked",
            handler=lambda text: text,
            input_model=EchoInput,
        )
    )

    task = Task(description="Policy on resume")
    call0 = ToolCall(tool_name="safe_tool", arguments={"text": "ok"}, call_id="c0")
    call1 = ToolCall(tool_name="blocked_tool", arguments={"text": "no"}, call_id="c1")

    # Step 0 completes before crash
    await manager.on_task_start(task)
    await manager.on_tool_intent(task.task_id, call0, 0)
    await manager.on_tool_started(task.task_id, "c0", 0, "safe_tool", 30.0)
    await manager.on_tool_completed(
        task=task,
        tool_call_id="c0",
        step=0,
        tool_name="safe_tool",
        output="ok",
        duration_seconds=0.01,
        budget_snapshot={"remaining_tool_calls": 5, "remaining_seconds": 60.0},
        partial_outputs={"step_0": "ok"},
        completed_call_ids=["c0"],
    )
    await manager.close()

    # Reopen and resume with policy allowing only safe_tool
    manager2 = PersistenceManager(db_path=temp_db_path)
    engine2 = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(Policy(allowed_tools=frozenset({"safe_tool"}))),
        persistence=manager2,
    )

    result = await engine2.resume(task.task_id, [call0, call1])

    assert result.status == TaskStatus.FAILED
    assert "PermissionError" in (result.error or "")
    assert result.outputs["step_0"] == "ok"
    assert "step_1" not in result.outputs

    await manager2.close()


@pytest.mark.asyncio
async def test_resume_respects_and_enforces_budget_limits(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="echo",
            description="Echo",
            handler=lambda text: text,
            input_model=EchoInput,
        )
    )

    task = Task(description="Budget on resume")
    call0 = ToolCall(tool_name="echo", arguments={"text": "first"}, call_id="c0")
    call1 = ToolCall(tool_name="echo", arguments={"text": "second"}, call_id="c1")

    # Step 0 completed using 1 call
    await manager.on_task_start(task)
    await manager.on_tool_intent(task.task_id, call0, 0)
    await manager.on_tool_started(task.task_id, "c0", 0, "echo", 30.0)
    await manager.on_tool_completed(
        task=task,
        tool_call_id="c0",
        step=0,
        tool_name="echo",
        output="first",
        duration_seconds=0.01,
        budget_snapshot={
            "tool_calls_reserved": 1,
            "max_tool_calls": 1,
            "remaining_tool_calls": 0,
            "remaining_seconds": 60.0,
        },
        partial_outputs={"step_0": "first"},
        completed_call_ids=["c0"],
    )
    await manager.close()

    # Resume with max_tool_calls=1: budget is exhausted
    manager2 = PersistenceManager(db_path=temp_db_path)
    engine2 = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(Policy(allowed_tools=frozenset({"echo"}))),
        budget=ExecutionBudget(max_tool_calls=1),
        persistence=manager2,
    )

    res_resume = await engine2.resume(task.task_id, [call0, call1])

    assert res_resume.status == TaskStatus.FAILED
    assert "ToolCallLimitExceededError" in (res_resume.error or "")

    await manager2.close()


@pytest.mark.asyncio
async def test_resume_blocks_uncertain_interrupted_call(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="external_tool",
            description="External tool",
            handler=lambda text: text,
            input_model=EchoInput,
        )
    )

    task = Task(description="Uncertain task")
    await manager.on_task_start(task)
    await manager.repository.record_tool_intent(
        ToolExecutionRecord(
            task_id=task.task_id,
            tool_call_id="c-crashed",
            tool_name="external_tool",
            sequence_number=0,
            arguments_json=serialize_json({"text": "data"}),
            status=ToolExecutionStatus.RUNNING.value,
            idempotency_key=f"{task.task_id}:c-crashed",
        )
    )

    engine = ExecutionEngine(
        registry=registry,
        policy_engine=PolicyEngine(Policy(allowed_tools=frozenset({"external_tool"}))),
        persistence=manager,
    )

    result = await engine.resume(
        task.task_id,
        [ToolCall(tool_name="external_tool", arguments={"text": "data"}, call_id="c-crashed")],
    )

    assert result.status == TaskStatus.FAILED
    assert "UnrecoverableTaskError" in (result.error or "")
    assert "uncertain" in (result.error or "").lower()

    await manager.close()


@pytest.mark.asyncio
async def test_resume_cancelled_task_fails_safely(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    registry = ToolRegistry()

    task = Task(description="Cancelled task")
    await manager.on_task_start(task)
    await manager.on_task_cancelled(task)

    engine = ExecutionEngine(registry=registry, persistence=manager)
    result = await engine.resume(task.task_id, [])

    # Cancelled terminal tasks cannot be resumed and maintain their cancelled status
    assert result.status == TaskStatus.CANCELLED
    assert "UnrecoverableTaskError" in (result.error or "")
    assert "cancelled" in (result.error or "").lower()

    await manager.close()


@pytest.mark.asyncio
async def test_runtime_service_startup_reconciliation_and_resume(tmp_path: Path) -> None:
    from forgeguard.agent.models import FinalAction
    from forgeguard.agent.providers.mock import MockProvider
    from forgeguard.api.errors import APIException
    from forgeguard.config import ForgeGuardSettings
    from forgeguard.persistence.models import TaskRecord
    from forgeguard.persistence.repository import utc_iso_now
    from forgeguard.runtime.service import RuntimeService

    db_path = tmp_path / "reconciliation_test.db"
    settings = ForgeGuardSettings(db_path=str(db_path), auth_disabled=True)

    # 1. Simulate a prior process that left a task in RUNNING status
    prior_persistence = PersistenceManager(db_path=db_path)
    await prior_persistence.initialize()
    task_id = "task-interrupted-by-crash"
    await prior_persistence.repository.create_task(
        TaskRecord(
            task_id=task_id,
            description="Perform calculation after recovery",
            status=TaskStatus.RUNNING.value,
            created_at=utc_iso_now(),
            last_updated_at=utc_iso_now(),
        )
    )
    await prior_persistence.close()

    # 2. Boot up new RuntimeService (simulating restart)
    provider = MockProvider(
        responses=[
            FinalAction(
                action_type="final",
                final_response="Calculated answer is 42.",
                summary="Done after restart",
            )
        ]
    )
    service = RuntimeService(settings=settings, provider=provider)
    await service.initialize()

    # Verify startup reconciliation marked orphaned task as FAILED / interrupted
    task_info = await service.get_task(task_id)
    assert task_info.status == TaskStatus.FAILED.value
    assert task_info.recovery_status == "interrupted"
    assert "interrupted by runtime restart" in (task_info.error_summary or "").lower()

    # 3. Resume the reconciled task
    resume_resp = await service.resume_task(task_id)
    assert resume_resp.task_id == task_id
    assert resume_resp.resumed is True

    # 4. Attempting to resume an already active in-memory task raises FG-STATE-409
    with pytest.raises(APIException) as exc_info:
        await service.resume_task(task_id)
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "FG-STATE-409"

    await service.close()

