from __future__ import annotations

from pathlib import Path

import pytest

from forgeguard.persistence.exceptions import IdempotencyConflictError
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import (
    CheckpointRecord,
    TaskRecord,
    ToolExecutionRecord,
    ToolExecutionStatus,
)
from forgeguard.persistence.recovery import RecoveryEngine
from forgeguard.persistence.repository import (
    serialize_json,
)


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    return tmp_path / "idempotency_test.db"


@pytest.mark.asyncio
async def test_idempotency_same_call_id_same_args(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-idem-1",
            description="Idempotency test",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    rec1 = ToolExecutionRecord(
        task_id="t-idem-1",
        tool_call_id="call-idem-1",
        tool_name="echo",
        sequence_number=0,
        arguments_json=serialize_json({"text": "hello"}),
        status=ToolExecutionStatus.COMPLETED.value,
        idempotency_key="t-idem-1:call-idem-1",
    )
    await repo.record_tool_intent(rec1)

    # Second call with identical arguments
    rec2 = ToolExecutionRecord(
        task_id="t-idem-1",
        tool_call_id="call-idem-1",
        tool_name="echo",
        sequence_number=0,
        arguments_json=serialize_json({"text": "hello"}),
        status=ToolExecutionStatus.PENDING.value,
        idempotency_key="t-idem-1:call-idem-1",
    )
    result = await repo.record_tool_intent(rec2)
    assert result.tool_call_id == "call-idem-1"
    assert result.status == ToolExecutionStatus.COMPLETED.value

    await manager.close()


@pytest.mark.asyncio
async def test_idempotency_same_call_id_conflicting_args_raises_error(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-idem-2",
            description="Conflict test",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    rec1 = ToolExecutionRecord(
        task_id="t-idem-2",
        tool_call_id="call-idem-2",
        tool_name="echo",
        sequence_number=0,
        arguments_json=serialize_json({"text": "original"}),
        status=ToolExecutionStatus.COMPLETED.value,
        idempotency_key="t-idem-2:call-idem-2",
    )
    await repo.record_tool_intent(rec1)

    # Conflicting arguments with same call ID
    rec_conflict = ToolExecutionRecord(
        task_id="t-idem-2",
        tool_call_id="call-idem-2",
        tool_name="echo",
        sequence_number=0,
        arguments_json=serialize_json({"text": "conflicting_value"}),
        status=ToolExecutionStatus.PENDING.value,
        idempotency_key="t-idem-2:call-idem-2",
    )

    with pytest.raises(IdempotencyConflictError):
        await repo.record_tool_intent(rec_conflict)

    await manager.close()


@pytest.mark.asyncio
async def test_recovery_inspects_interrupted_tasks(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-recover-1",
            description="Interrupted task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    # Tool call 0 completed
    await repo.record_tool_intent(
        ToolExecutionRecord(
            task_id="t-recover-1",
            tool_call_id="call-0",
            tool_name="step0",
            sequence_number=0,
            arguments_json=serialize_json({}),
            status=ToolExecutionStatus.COMPLETED.value,
            idempotency_key="t-recover-1:call-0",
        )
    )
    await repo.update_tool_execution(
        task_id="t-recover-1",
        tool_call_id="call-0",
        status=ToolExecutionStatus.COMPLETED.value,
        result_json=serialize_json("step0_result"),
    )

    # Checkpoint after step 0
    await repo.save_checkpoint(
        CheckpointRecord(
            checkpoint_id="chk-rec-1",
            task_id="t-recover-1",
            sequence_number=1,
            timestamp="2026-11-21T10:01:00Z",
            execution_position=1,
            completed_calls_json=serialize_json(["call-0"]),
            partial_outputs_json=serialize_json({"step_0": "step0_result"}),
            budget_state_json=serialize_json(
                {"remaining_tool_calls": 5, "remaining_seconds": 30.0}
            ),
        )
    )

    # Simulate restart by creating a new recovery engine instance
    recovery = RecoveryEngine(manager)
    report = await recovery.recover_task("t-recover-1")

    assert report.task_id == "t-recover-1"
    assert report.reconstructed_position == 1
    assert "call-0" in report.completed_calls
    assert report.partial_outputs["step_0"] == "step0_result"
    assert report.can_resume_safely is True

    await manager.close()


@pytest.mark.asyncio
async def test_recovery_marks_running_tools_as_uncertain(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-uncertain",
            description="Interrupted mid tool",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    # Tool call left in RUNNING status when process died
    await repo.record_tool_intent(
        ToolExecutionRecord(
            task_id="t-uncertain",
            tool_call_id="call-crashed",
            tool_name="external_action",
            sequence_number=0,
            arguments_json=serialize_json({"action": "post"}),
            status=ToolExecutionStatus.RUNNING.value,
            idempotency_key="t-uncertain:call-crashed",
        )
    )

    recovery = RecoveryEngine(manager)
    report = await recovery.recover_task("t-uncertain")

    assert "call-crashed" in report.uncertain_calls
    assert report.can_resume_safely is False
    assert any("uncertain" in w.lower() for w in report.warnings)

    # Tool status in DB should be updated to UNCERTAIN
    rec = await repo.get_tool_execution("t-uncertain", "call-crashed")
    assert rec is not None
    assert rec.status == ToolExecutionStatus.UNCERTAIN.value

    await manager.close()


@pytest.mark.asyncio
async def test_recovery_reconstructs_outputs_without_checkpoint(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-no-chk",
            description="No checkpoint task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    await repo.record_tool_intent(
        ToolExecutionRecord(
            task_id="t-no-chk",
            tool_call_id="call-a",
            tool_name="add",
            sequence_number=0,
            arguments_json=serialize_json({"a": 1, "b": 2}),
            status=ToolExecutionStatus.COMPLETED.value,
            result_json=serialize_json(3),
            idempotency_key="t-no-chk:call-a",
        )
    )

    recovery = RecoveryEngine(manager)
    report = await recovery.recover_task("t-no-chk")

    assert report.reconstructed_position == 1
    assert "call-a" in report.completed_calls
    assert report.partial_outputs["step_0"] == 3
    assert report.checkpoint_id is None
    assert report.can_resume_safely is True

    await manager.close()


@pytest.mark.asyncio
async def test_recovery_handles_corrupted_checkpoint(temp_db_path: Path) -> None:
    manager = PersistenceManager(db_path=temp_db_path)
    await manager.initialize()
    repo = manager.repository

    await repo.create_task(
        TaskRecord(
            task_id="t-corrupt",
            description="Corrupt checkpoint task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    # Insert corrupt non-JSON checkpoint
    await repo.save_checkpoint(
        CheckpointRecord(
            checkpoint_id="chk-bad",
            task_id="t-corrupt",
            sequence_number=1,
            timestamp="2026-11-21T10:00:00Z",
            execution_position=1,
            completed_calls_json="{invalid_json}",
            partial_outputs_json="{invalid_json}",
        )
    )

    recovery = RecoveryEngine(manager)
    report = await recovery.recover_task("t-corrupt")

    # Should gracefully catch error, set can_resume_safely to False, and add warning
    assert report.can_resume_safely is False
    assert any("Failed to parse checkpoint" in w for w in report.warnings)

    await manager.close()
