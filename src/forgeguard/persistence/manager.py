from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.events.event import ExecutionEvent
from forgeguard.execution.tool_call import ToolCall
from forgeguard.persistence.database import Database
from forgeguard.persistence.models import (
    CheckpointRecord,
    JournalEventRecord,
    TaskIdempotencyRecord,
    TaskRecord,
    ToolExecutionRecord,
    ToolExecutionStatus,
    WorkspaceRecord,
)
from forgeguard.persistence.repository import (
    Repository,
    deserialize_json,
    serialize_json,
    utc_iso_now,
)


class PersistenceManager:
    """Coordinates high-level durable persistence for ForgeGuard execution."""

    def __init__(self, db: Database | None = None, db_path: str | Path = ":memory:") -> None:
        self.db = db or Database(db_path)
        self.repository = Repository(self.db)
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the database and schema."""
        if not self._initialized:
            await self.db.initialize()
            self._initialized = True

    async def close(self) -> None:
        """Close database resources."""
        await self.db.close()
        self._initialized = False

    def generate_call_id(self, task_id: str, step: int, tool_name: str) -> str:
        """Generate a deterministic tool call ID when none was provided."""
        return f"{task_id}:step_{step}:{tool_name}"

    async def on_task_start(
        self,
        task: Task,
        budget_dict: dict[str, Any] | None = None,
    ) -> None:
        """Record task start in database and append initial events."""
        await self.initialize()

        existing = await self.repository.get_task(task.task_id)
        now = utc_iso_now()

        if existing is None:
            await self.repository.create_task(
                TaskRecord(
                    task_id=task.task_id,
                    description=task.description,
                    status=TaskStatus.RUNNING.value,
                    created_at=task.created_at.isoformat(),
                    started_at=now,
                    last_updated_at=now,
                    metadata_json=serialize_json(task.metadata),
                    current_position=0,
                )
            )
        else:
            await self.repository.update_task_status(
                task_id=task.task_id,
                status=TaskStatus.RUNNING.value,
                started_at=now,
            )

        # Journal task_started event
        seq = await self.repository.get_next_event_sequence(task.task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=seq,
                event_type="task_started",
                timestamp=now,
                payload_json=serialize_json({"task_id": task.task_id}),
            )
        )

        if budget_dict is not None:
            seq = await self.repository.get_next_event_sequence(task.task_id)
            await self.repository.append_event(
                JournalEventRecord(
                    event_id=str(uuid4()),
                    task_id=task.task_id,
                    sequence_number=seq,
                    event_type="budget_initialized",
                    timestamp=now,
                    payload_json=serialize_json({"task_id": task.task_id, "budget": budget_dict}),
                )
            )

    async def on_tool_intent(
        self,
        task_id: str,
        tool_call: ToolCall,
        step: int,
    ) -> ToolExecutionRecord:
        """Record intent to execute a tool.

        Validates idempotency and returns existing or created record.
        """
        call_id = tool_call.call_id or self.generate_call_id(task_id, step, tool_call.tool_name)
        idempotency_key = f"{task_id}:{call_id}"

        record = ToolExecutionRecord(
            task_id=task_id,
            tool_call_id=call_id,
            tool_name=tool_call.tool_name,
            sequence_number=step,
            arguments_json=serialize_json(tool_call.arguments),
            status=ToolExecutionStatus.PENDING.value,
            idempotency_key=idempotency_key,
        )

        return await self.repository.record_tool_intent(record)

    async def on_tool_started(
        self,
        task_id: str,
        tool_call_id: str,
        step: int,
        tool_name: str,
        effective_timeout: float,
    ) -> None:
        """Update tool execution record to RUNNING and journal tool_call_started."""
        now = utc_iso_now()
        await self.repository.update_tool_execution(
            task_id=task_id,
            tool_call_id=tool_call_id,
            status=ToolExecutionStatus.RUNNING.value,
        )

        seq = await self.repository.get_next_event_sequence(task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq,
                event_type="tool_call_started",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "tool_name": tool_name,
                        "call_id": tool_call_id,
                        "step": step,
                        "timeout": effective_timeout,
                    }
                ),
            )
        )

    async def on_tool_completed(
        self,
        task: Task,
        tool_call_id: str,
        step: int,
        tool_name: str,
        output: Any,
        duration_seconds: float,
        budget_snapshot: dict[str, Any],
        partial_outputs: dict[str, Any],
        completed_call_ids: list[str],
    ) -> None:
        """Atomically persist tool completion, journal events, and checkpoint progress."""
        now = utc_iso_now()
        result_json = serialize_json(output)

        # 1. Update tool execution
        await self.repository.update_tool_execution(
            task_id=task.task_id,
            tool_call_id=tool_call_id,
            status=ToolExecutionStatus.COMPLETED.value,
            completion_time=now,
            result_json=result_json,
            duration_seconds=duration_seconds,
            recovery_classification="completed",
        )

        # 2. Append tool_call_completed
        seq1 = await self.repository.get_next_event_sequence(task.task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=seq1,
                event_type="tool_call_completed",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "tool_name": tool_name,
                        "call_id": tool_call_id,
                        "step": step,
                        "status": "success",
                        "output": output,
                    }
                ),
            )
        )

        # 3. Append budget_updated
        seq2 = await self.repository.get_next_event_sequence(task.task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=seq2,
                event_type="budget_updated",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "task_id": task.task_id,
                        "step": step,
                        "tool_name": tool_name,
                        **budget_snapshot,
                    }
                ),
            )
        )

        # 4. Save checkpoint
        chk_seq = await self.repository.get_next_checkpoint_sequence(task.task_id)
        await self.repository.save_checkpoint(
            CheckpointRecord(
                checkpoint_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=chk_seq,
                timestamp=now,
                execution_position=step + 1,
                completed_calls_json=serialize_json(completed_call_ids),
                partial_outputs_json=serialize_json(partial_outputs),
                budget_state_json=serialize_json(budget_snapshot),
                task_state_json=serialize_json(
                    {
                        "status": task.status.value,
                        "task_id": task.task_id,
                    }
                ),
            )
        )

        # 5. Advance task position
        await self.repository.update_task_position(task.task_id, step + 1)

    async def on_tool_failed(
        self,
        task_id: str,
        tool_call_id: str,
        step: int,
        tool_name: str,
        error_text: str,
        duration_seconds: float,
        is_timeout: bool,
        budget_snapshot: dict[str, Any],
        effective_timeout: float | None = None,
    ) -> None:
        """Persist tool failure or timeout and journal corresponding events."""
        now = utc_iso_now()
        status = ToolExecutionStatus.FAILED.value

        await self.repository.update_tool_execution(
            task_id=task_id,
            tool_call_id=tool_call_id,
            status=status,
            completion_time=now,
            error_text=error_text,
            duration_seconds=duration_seconds,
            recovery_classification="failed",
        )

        if is_timeout and effective_timeout is not None:
            seq_t = await self.repository.get_next_event_sequence(task_id)
            await self.repository.append_event(
                JournalEventRecord(
                    event_id=str(uuid4()),
                    task_id=task_id,
                    sequence_number=seq_t,
                    event_type="tool_timeout",
                    timestamp=now,
                    payload_json=serialize_json(
                        {
                            "task_id": task_id,
                            "tool_name": tool_name,
                            "call_id": tool_call_id,
                            "step": step,
                            "timeout_seconds": effective_timeout,
                            "elapsed_seconds": budget_snapshot.get("elapsed_seconds", 0.0),
                        }
                    ),
                )
            )

        seq1 = await self.repository.get_next_event_sequence(task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq1,
                event_type="tool_call_completed",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "tool_name": tool_name,
                        "call_id": tool_call_id,
                        "step": step,
                        "status": "failure",
                        "error": error_text,
                    }
                ),
            )
        )

        seq2 = await self.repository.get_next_event_sequence(task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq2,
                event_type="budget_updated",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "task_id": task_id,
                        "step": step,
                        "tool_name": tool_name,
                        **budget_snapshot,
                    }
                ),
            )
        )

    async def on_budget_exceeded(
        self,
        task_id: str,
        step: int,
        tool_name: str,
        limit: str,
        reason: str,
        snapshot: dict[str, Any],
    ) -> None:
        """Journal budget_exceeded event."""
        now = utc_iso_now()
        seq = await self.repository.get_next_event_sequence(task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq,
                event_type="budget_exceeded",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "task_id": task_id,
                        "step": step,
                        "tool_name": tool_name,
                        "limit": limit,
                        "reason": reason,
                        **snapshot,
                    }
                ),
            )
        )

    async def on_policy_decision(
        self,
        task_id: str,
        step: int,
        tool_name: str,
        call_id: str | None,
        allowed: bool,
        reason: str,
        matched_rule: str,
    ) -> None:
        """Journal policy_decision event."""
        now = utc_iso_now()
        seq = await self.repository.get_next_event_sequence(task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq,
                event_type="policy_decision",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "tool_name": tool_name,
                        "allowed": allowed,
                        "reason": reason,
                        "matched_rule": matched_rule,
                        "task_id": task_id,
                        "step": step,
                        "call_id": call_id,
                    }
                ),
            )
        )

    async def on_tool_rejected(
        self,
        task_id: str,
        step: int,
        tool_name: str,
        call_id: str | None,
        reason: str,
    ) -> None:
        """Journal tool_call_rejected event."""
        now = utc_iso_now()
        seq = await self.repository.get_next_event_sequence(task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq,
                event_type="tool_call_rejected",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "tool_name": tool_name,
                        "reason": reason,
                        "step": step,
                        "call_id": call_id,
                    }
                ),
            )
        )

    async def on_task_completed(self, task: Task, steps: int) -> None:
        """Update task to COMPLETED and journal task_completed event."""
        now = utc_iso_now()
        await self.repository.update_task_status(
            task_id=task.task_id,
            status=TaskStatus.COMPLETED.value,
            finished_at=now,
            clear_recovery_status=True,
        )

        seq = await self.repository.get_next_event_sequence(task.task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=seq,
                event_type="task_completed",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "task_id": task.task_id,
                        "steps": steps,
                    }
                ),
            )
        )

    async def on_task_failed(self, task: Task, error_type: str, error: str) -> None:
        """Update task to FAILED and journal task_failed event."""
        now = utc_iso_now()
        await self.repository.update_task_status(
            task_id=task.task_id,
            status=TaskStatus.FAILED.value,
            finished_at=now,
        )

        seq = await self.repository.get_next_event_sequence(task.task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=seq,
                event_type="task_failed",
                timestamp=now,
                payload_json=serialize_json(
                    {
                        "task_id": task.task_id,
                        "error_type": error_type,
                        "error": error,
                    }
                ),
            )
        )

    async def on_task_cancelled(self, task: Task) -> None:
        """Update task to CANCELLED and journal task_cancelled event."""
        now = utc_iso_now()
        await self.repository.update_task_status(
            task_id=task.task_id,
            status=TaskStatus.CANCELLED.value,
            finished_at=now,
            clear_recovery_status=True,
        )

        seq = await self.repository.get_next_event_sequence(task.task_id)
        await self.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task.task_id,
                sequence_number=seq,
                event_type="task_cancelled",
                timestamp=now,
                payload_json=serialize_json({"task_id": task.task_id}),
            )
        )

    async def load_execution_events(self, task_id: str) -> list[ExecutionEvent]:
        """Load persisted journal records and convert them into ExecutionEvent objects."""
        records = await self.repository.get_events(task_id)
        from datetime import datetime

        events = []
        for r in records:
            events.append(
                ExecutionEvent(
                    event_type=r.event_type,
                    timestamp=datetime.fromisoformat(r.timestamp),
                    payload=deserialize_json(r.payload_json),
                )
            )
        return events

    async def list_tasks(
        self,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TaskRecord]:
        await self.initialize()
        return await self.repository.list_tasks(status=status, limit=limit, offset=offset)

    async def record_idempotency(self, record: TaskIdempotencyRecord) -> None:
        await self.initialize()
        await self.repository.record_idempotency(record)

    async def get_idempotency(self, key: str) -> TaskIdempotencyRecord | None:
        await self.initialize()
        return await self.repository.get_idempotency(key)

    async def create_workspace(self, record: WorkspaceRecord) -> None:
        await self.initialize()
        await self.repository.create_workspace(record)

    async def get_workspace(self, workspace_id: str) -> WorkspaceRecord | None:
        await self.initialize()
        return await self.repository.get_workspace(workspace_id)

    async def list_workspaces(self) -> list[WorkspaceRecord]:
        await self.initialize()
        return await self.repository.list_workspaces()

    async def delete_workspace(self, workspace_id: str) -> bool:
        await self.initialize()
        return await self.repository.delete_workspace(workspace_id)
