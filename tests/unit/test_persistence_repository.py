from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from forgeguard.persistence.database import Database
from forgeguard.persistence.exceptions import (
    DatabaseConnectionError,
    PersistenceError,
)
from forgeguard.persistence.models import (
    CheckpointRecord,
    JournalEventRecord,
    TaskRecord,
    ToolExecutionRecord,
    ToolExecutionStatus,
)
from forgeguard.persistence.repository import (
    Repository,
    deserialize_json,
    serialize_json,
)


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    return tmp_path / "test_forgeguard.db"


@pytest.mark.asyncio
async def test_database_initialization_and_closure(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()

    # Verify tables created
    rows = await db.fetchall("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    table_names = [row["name"] for row in rows]
    assert "tasks" in table_names
    assert "tool_executions" in table_names
    assert "execution_events" in table_names
    assert "checkpoints" in table_names

    await db.close()

    # Operations after close should raise DatabaseConnectionError
    with pytest.raises(DatabaseConnectionError):
        await db.execute("SELECT 1;")


@pytest.mark.asyncio
async def test_task_persistence_and_retrieval(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()
    repo = Repository(db)

    task_rec = TaskRecord(
        task_id="t-100",
        description="Test task",
        status="created",
        created_at="2026-11-21T10:00:00Z",
        last_updated_at="2026-11-21T10:00:00Z",
        metadata_json=serialize_json({"priority": "high"}),
    )

    await repo.create_task(task_rec)

    fetched = await repo.get_task("t-100")
    assert fetched is not None
    assert fetched.task_id == "t-100"
    assert fetched.description == "Test task"
    assert fetched.status == "created"
    assert deserialize_json(fetched.metadata_json)["priority"] == "high"

    # Status update
    await repo.update_task_status("t-100", status="running", started_at="2026-11-21T10:01:00Z")
    updated = await repo.get_task("t-100")
    assert updated is not None
    assert updated.status == "running"
    assert updated.started_at == "2026-11-21T10:01:00Z"

    # Position update
    await repo.update_task_position("t-100", position=3)
    pos_updated = await repo.get_task("t-100")
    assert pos_updated is not None
    assert pos_updated.current_position == 3

    await db.close()


@pytest.mark.asyncio
async def test_task_duplicate_id_raises_persistence_error(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()
    repo = Repository(db)

    task_rec = TaskRecord(
        task_id="t-dup",
        description="Duplicate ID test",
        status="created",
        created_at="2026-11-21T10:00:00Z",
        last_updated_at="2026-11-21T10:00:00Z",
    )
    await repo.create_task(task_rec)

    with pytest.raises(PersistenceError):
        await repo.create_task(task_rec)

    await db.close()


@pytest.mark.asyncio
async def test_tool_execution_persistence_and_update(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()
    repo = Repository(db)

    await repo.create_task(
        TaskRecord(
            task_id="t-tool",
            description="Task for tools",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    tool_rec = ToolExecutionRecord(
        task_id="t-tool",
        tool_call_id="call-1",
        tool_name="add",
        sequence_number=0,
        arguments_json=serialize_json({"a": 1, "b": 2}),
        status=ToolExecutionStatus.PENDING.value,
        idempotency_key="t-tool:call-1",
    )

    recorded = await repo.record_tool_intent(tool_rec)
    assert recorded.tool_call_id == "call-1"

    # Update tool execution to completed
    await repo.update_tool_execution(
        task_id="t-tool",
        tool_call_id="call-1",
        status=ToolExecutionStatus.COMPLETED.value,
        completion_time="2026-11-21T10:01:05Z",
        result_json=serialize_json(3),
        duration_seconds=0.05,
    )

    fetched = await repo.get_tool_execution("t-tool", "call-1")
    assert fetched is not None
    assert fetched.status == ToolExecutionStatus.COMPLETED.value
    assert fetched.duration_seconds == 0.05
    assert deserialize_json(fetched.result_json or "") == 3

    await db.close()


@pytest.mark.asyncio
async def test_event_journal_monotonic_ordering_and_filtering(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()
    repo = Repository(db)

    await repo.create_task(
        TaskRecord(
            task_id="t-events",
            description="Events task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    # Append 3 ordered events
    for i in range(1, 4):
        seq = await repo.get_next_event_sequence("t-events")
        assert seq == i
        await repo.append_event(
            JournalEventRecord(
                event_id=f"e-{i}",
                task_id="t-events",
                sequence_number=seq,
                event_type=f"event_{i}",
                timestamp="2026-11-21T10:00:0{i}Z",
                payload_json=serialize_json({"step": i}),
            )
        )

    all_events = await repo.get_events("t-events")
    assert len(all_events) == 3
    assert [e.sequence_number for e in all_events] == [1, 2, 3]

    # Query after sequence number
    after_one = await repo.get_events_after("t-events", 1)
    assert len(after_one) == 2
    assert [e.sequence_number for e in after_one] == [2, 3]

    await db.close()


@pytest.mark.asyncio
async def test_checkpoint_persistence_and_latest(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()
    repo = Repository(db)

    await repo.create_task(
        TaskRecord(
            task_id="t-chk",
            description="Checkpoint task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    chk1 = CheckpointRecord(
        checkpoint_id="chk-1",
        task_id="t-chk",
        sequence_number=1,
        timestamp="2026-11-21T10:00:01Z",
        execution_position=1,
        completed_calls_json=serialize_json(["call-0"]),
        partial_outputs_json=serialize_json({"step_0": "out0"}),
    )
    chk2 = CheckpointRecord(
        checkpoint_id="chk-2",
        task_id="t-chk",
        sequence_number=2,
        timestamp="2026-11-21T10:00:02Z",
        execution_position=2,
        completed_calls_json=serialize_json(["call-0", "call-1"]),
        partial_outputs_json=serialize_json({"step_0": "out0", "step_1": "out1"}),
    )

    await repo.save_checkpoint(chk1)
    await repo.save_checkpoint(chk2)

    latest = await repo.get_latest_checkpoint("t-chk")
    assert latest is not None
    assert latest.checkpoint_id == "chk-2"
    assert latest.execution_position == 2
    assert deserialize_json(latest.partial_outputs_json) == {
        "step_0": "out0",
        "step_1": "out1",
    }

    all_chks = await repo.list_checkpoints("t-chk")
    assert len(all_chks) == 2
    assert all_chks[0].checkpoint_id == "chk-1"
    assert all_chks[1].checkpoint_id == "chk-2"

    await db.close()


@pytest.mark.asyncio
async def test_transaction_rollback_on_failure(temp_db_path: Path) -> None:
    db = Database(temp_db_path)
    await db.initialize()
    repo = Repository(db)

    await repo.create_task(
        TaskRecord(
            task_id="t-tx",
            description="Tx test",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )

    def failing_transaction(conn: sqlite3.Connection) -> None:
        conn.execute("UPDATE tasks SET description = 'modified' WHERE task_id = 't-tx'")
        # Raise an exception to trigger transaction rollback
        raise ValueError("Simulated abort")

    with pytest.raises(PersistenceError):
        await db.run_in_transaction(failing_transaction)

    # Task description should remain unchanged
    task = await repo.get_task("t-tx")
    assert task is not None
    assert task.description == "Tx test"

    await db.close()


@pytest.mark.asyncio
async def test_database_survival_after_reopening(temp_db_path: Path) -> None:
    # 1. Open and populate database
    db1 = Database(temp_db_path)
    await db1.initialize()
    repo1 = Repository(db1)

    await repo1.create_task(
        TaskRecord(
            task_id="t-persist",
            description="Persistent task",
            status="running",
            created_at="2026-11-21T10:00:00Z",
            last_updated_at="2026-11-21T10:00:00Z",
        )
    )
    await db1.close()

    # 2. Reopen database from disk
    db2 = Database(temp_db_path)
    await db2.initialize()
    repo2 = Repository(db2)

    fetched = await repo2.get_task("t-persist")
    assert fetched is not None
    assert fetched.task_id == "t-persist"
    assert fetched.description == "Persistent task"

    await db2.close()
