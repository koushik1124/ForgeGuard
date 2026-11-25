from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from forgeguard.persistence.database import Database
from forgeguard.persistence.exceptions import (
    IdempotencyConflictError,
    PersistenceError,
)
from forgeguard.persistence.models import (
    CheckpointRecord,
    JournalEventRecord,
    TaskIdempotencyRecord,
    TaskRecord,
    ToolExecutionRecord,
    WorkspaceRecord,
)


def utc_iso_now() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def serialize_json(data: Any) -> str:
    """Deterministically serialize data to JSON string."""
    try:
        return json.dumps(
            data,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as exc:
        raise PersistenceError(f"Failed to serialize payload to JSON: {exc}") from exc


def deserialize_json(text: str) -> Any:
    """Deserialize JSON string into Python data."""
    try:
        return json.loads(text)
    except Exception as exc:
        raise PersistenceError(f"Failed to deserialize JSON data: {exc}") from exc


class Repository:
    """Repository handling durable storage operations for tasks, tools, events, and checkpoints."""

    def __init__(self, db: Database) -> None:
        self.db = db

    # ---------------- Task Operations ---------------- #

    async def create_task(self, record: TaskRecord) -> None:
        """Persist a new task record."""
        sql = """
        INSERT INTO tasks (
            task_id, description, status, created_at, started_at,
            finished_at, last_updated_at, metadata_json, current_position, recovery_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        try:
            await self.db.execute(
                sql,
                (
                    record.task_id,
                    record.description,
                    record.status,
                    record.created_at,
                    record.started_at,
                    record.finished_at,
                    record.last_updated_at,
                    record.metadata_json,
                    record.current_position,
                    record.recovery_status,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise PersistenceError(f"Task '{record.task_id}' already exists: {exc}") from exc

    async def update_task_status(
        self,
        task_id: str,
        status: str,
        started_at: str | None = None,
        finished_at: str | None = None,
        recovery_status: str | None = None,
        clear_recovery_status: bool = False,
    ) -> None:
        """Update task status and related timestamps."""
        now = utc_iso_now()
        if clear_recovery_status:
            sql = """
            UPDATE tasks
            SET status = ?,
                started_at = COALESCE(?, started_at),
                finished_at = COALESCE(?, finished_at),
                last_updated_at = ?,
                recovery_status = NULL
            WHERE task_id = ?
            """
            await self.db.execute(sql, (status, started_at, finished_at, now, task_id))
        else:
            sql = """
            UPDATE tasks
            SET status = ?,
                started_at = COALESCE(?, started_at),
                finished_at = COALESCE(?, finished_at),
                last_updated_at = ?,
                recovery_status = COALESCE(?, recovery_status)
            WHERE task_id = ?
            """
            await self.db.execute(sql, (status, started_at, finished_at, now, recovery_status, task_id))

    async def update_task_position(self, task_id: str, position: int) -> None:
        """Update the execution position of a task."""
        now = utc_iso_now()
        sql = "UPDATE tasks SET current_position = ?, last_updated_at = ? WHERE task_id = ?"
        await self.db.execute(sql, (position, now, task_id))

    async def get_task(self, task_id: str) -> TaskRecord | None:
        """Retrieve a task record by its ID."""
        sql = "SELECT * FROM tasks WHERE task_id = ?"
        row = await self.db.fetchone(sql, (task_id,))
        if row is None:
            return None
        return TaskRecord(
            task_id=row["task_id"],
            description=row["description"],
            status=row["status"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            last_updated_at=row["last_updated_at"],
            metadata_json=row["metadata_json"],
            current_position=row["current_position"],
            recovery_status=row["recovery_status"],
        )

    async def list_active_tasks(self) -> list[TaskRecord]:
        """List tasks that were left in an active (created or running) state."""
        sql = "SELECT * FROM tasks WHERE status IN ('created', 'running') ORDER BY created_at ASC"
        rows = await self.db.fetchall(sql)
        return [
            TaskRecord(
                task_id=row["task_id"],
                description=row["description"],
                status=row["status"],
                created_at=row["created_at"],
                started_at=row["started_at"],
                finished_at=row["finished_at"],
                last_updated_at=row["last_updated_at"],
                metadata_json=row["metadata_json"],
                current_position=row["current_position"],
                recovery_status=row["recovery_status"],
            )
            for row in rows
        ]

    # ---------------- Tool Execution Operations ---------------- #

    async def record_tool_intent(self, record: ToolExecutionRecord) -> ToolExecutionRecord:
        """Record intent to execute a tool.

        If a record with the same task_id and tool_call_id already exists:
        - If arguments conflict: raises IdempotencyConflictError.
        - If completed: returns the existing record.
        """
        existing = await self.get_tool_execution(record.task_id, record.tool_call_id)
        if existing is not None:
            # Check for argument mismatch
            existing_args = deserialize_json(existing.arguments_json)
            new_args = deserialize_json(record.arguments_json)
            if existing_args != new_args:
                raise IdempotencyConflictError(
                    f"Tool call '{record.tool_call_id}' already exists with conflicting arguments."
                )
            return existing

        sql = """
        INSERT INTO tool_executions (
            task_id, tool_call_id, tool_name, sequence_number, arguments_json,
            status, start_time, completion_time, result_json, error_text,
            duration_seconds, idempotency_key, recovery_classification
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        try:
            await self.db.execute(
                sql,
                (
                    record.task_id,
                    record.tool_call_id,
                    record.tool_name,
                    record.sequence_number,
                    record.arguments_json,
                    record.status,
                    record.start_time,
                    record.completion_time,
                    record.result_json,
                    record.error_text,
                    record.duration_seconds,
                    record.idempotency_key,
                    record.recovery_classification,
                ),
            )
            return record
        except sqlite3.IntegrityError as exc:
            raise PersistenceError(f"Failed to record tool execution intent: {exc}") from exc

    async def update_tool_execution(
        self,
        task_id: str,
        tool_call_id: str,
        status: str,
        completion_time: str | None = None,
        result_json: str | None = None,
        error_text: str | None = None,
        duration_seconds: float | None = None,
        recovery_classification: str | None = None,
    ) -> None:
        """Update status and results for a tool execution record."""
        sql = """
        UPDATE tool_executions
        SET status = ?,
            completion_time = ?,
            result_json = ?,
            error_text = ?,
            duration_seconds = ?,
            recovery_classification = COALESCE(?, recovery_classification)
        WHERE task_id = ? AND tool_call_id = ?
        """
        await self.db.execute(
            sql,
            (
                status,
                completion_time,
                result_json,
                error_text,
                duration_seconds,
                recovery_classification,
                task_id,
                tool_call_id,
            ),
        )

    async def get_tool_execution(
        self,
        task_id: str,
        tool_call_id: str,
    ) -> ToolExecutionRecord | None:
        """Retrieve a tool execution record by task and call ID."""
        sql = "SELECT * FROM tool_executions WHERE task_id = ? AND tool_call_id = ?"
        row = await self.db.fetchone(sql, (task_id, tool_call_id))
        if row is None:
            return None
        return ToolExecutionRecord(
            id=row["id"],
            task_id=row["task_id"],
            tool_call_id=row["tool_call_id"],
            tool_name=row["tool_name"],
            sequence_number=row["sequence_number"],
            arguments_json=row["arguments_json"],
            status=row["status"],
            idempotency_key=row["idempotency_key"],
            start_time=row["start_time"],
            completion_time=row["completion_time"],
            result_json=row["result_json"],
            error_text=row["error_text"],
            duration_seconds=row["duration_seconds"],
            recovery_classification=row["recovery_classification"],
        )

    async def list_tool_executions(self, task_id: str) -> list[ToolExecutionRecord]:
        """List all tool execution records for a task ordered by sequence number."""
        sql = """
        SELECT * FROM tool_executions
        WHERE task_id = ?
        ORDER BY sequence_number ASC
        """
        rows = await self.db.fetchall(sql, (task_id,))
        return [
            ToolExecutionRecord(
                id=row["id"],
                task_id=row["task_id"],
                tool_call_id=row["tool_call_id"],
                tool_name=row["tool_name"],
                sequence_number=row["sequence_number"],
                arguments_json=row["arguments_json"],
                status=row["status"],
                idempotency_key=row["idempotency_key"],
                start_time=row["start_time"],
                completion_time=row["completion_time"],
                result_json=row["result_json"],
                error_text=row["error_text"],
                duration_seconds=row["duration_seconds"],
                recovery_classification=row["recovery_classification"],
            )
            for row in rows
        ]

    # ---------------- Event Journal Operations ---------------- #

    async def get_next_event_sequence(self, task_id: str) -> int:
        """Get the next monotonic event sequence number for a task."""
        sql = (
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq "
            "FROM execution_events WHERE task_id = ?"
        )
        row = await self.db.fetchone(sql, (task_id,))
        assert row is not None
        return int(row["next_seq"])

    async def append_event(self, record: JournalEventRecord) -> None:
        """Append an event to the append-only event journal."""
        sql = """
        INSERT INTO execution_events (
            event_id, task_id, sequence_number, event_type, timestamp, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        """
        try:
            await self.db.execute(
                sql,
                (
                    record.event_id,
                    record.task_id,
                    record.sequence_number,
                    record.event_type,
                    record.timestamp,
                    record.payload_json,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise PersistenceError(
                f"Failed to append event '{record.event_id}' (seq {record.sequence_number}): {exc}"
            ) from exc

    async def get_events(self, task_id: str) -> list[JournalEventRecord]:
        """Retrieve all journaled events for a task in monotonic sequence order."""
        sql = "SELECT * FROM execution_events WHERE task_id = ? ORDER BY sequence_number ASC"
        rows = await self.db.fetchall(sql, (task_id,))
        return [
            JournalEventRecord(
                id=row["id"],
                event_id=row["event_id"],
                task_id=row["task_id"],
                sequence_number=row["sequence_number"],
                event_type=row["event_type"],
                timestamp=row["timestamp"],
                payload_json=row["payload_json"],
            )
            for row in rows
        ]

    async def get_events_after(
        self,
        task_id: str,
        sequence_number: int,
    ) -> list[JournalEventRecord]:
        """Retrieve journaled events for a task occurring after a sequence number."""
        sql = """
        SELECT * FROM execution_events
        WHERE task_id = ? AND sequence_number > ?
        ORDER BY sequence_number ASC
        """
        rows = await self.db.fetchall(sql, (task_id, sequence_number))
        return [
            JournalEventRecord(
                id=row["id"],
                event_id=row["event_id"],
                task_id=row["task_id"],
                sequence_number=row["sequence_number"],
                event_type=row["event_type"],
                timestamp=row["timestamp"],
                payload_json=row["payload_json"],
            )
            for row in rows
        ]

    # ---------------- Checkpoint Operations ---------------- #

    async def get_next_checkpoint_sequence(self, task_id: str) -> int:
        """Get the next monotonic checkpoint sequence number for a task."""
        sql = (
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq "
            "FROM checkpoints WHERE task_id = ?"
        )
        row = await self.db.fetchone(sql, (task_id,))
        assert row is not None
        return int(row["next_seq"])

    async def save_checkpoint(self, record: CheckpointRecord) -> None:
        """Persist an execution checkpoint."""
        sql = """
        INSERT INTO checkpoints (
            checkpoint_id, task_id, sequence_number, timestamp, execution_position,
            completed_calls_json, partial_outputs_json, budget_state_json,
            task_state_json, recovery_metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        try:
            await self.db.execute(
                sql,
                (
                    record.checkpoint_id,
                    record.task_id,
                    record.sequence_number,
                    record.timestamp,
                    record.execution_position,
                    record.completed_calls_json,
                    record.partial_outputs_json,
                    record.budget_state_json,
                    record.task_state_json,
                    record.recovery_metadata_json,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise PersistenceError(
                f"Failed to save checkpoint '{record.checkpoint_id}': {exc}"
            ) from exc

    async def get_latest_checkpoint(self, task_id: str) -> CheckpointRecord | None:
        """Retrieve the latest checkpoint for a task."""
        sql = """
        SELECT * FROM checkpoints
        WHERE task_id = ?
        ORDER BY sequence_number DESC
        LIMIT 1
        """
        row = await self.db.fetchone(sql, (task_id,))
        if row is None:
            return None
        return CheckpointRecord(
            checkpoint_id=row["checkpoint_id"],
            task_id=row["task_id"],
            sequence_number=row["sequence_number"],
            timestamp=row["timestamp"],
            execution_position=row["execution_position"],
            completed_calls_json=row["completed_calls_json"],
            partial_outputs_json=row["partial_outputs_json"],
            budget_state_json=row["budget_state_json"],
            task_state_json=row["task_state_json"],
            recovery_metadata_json=row["recovery_metadata_json"],
        )

    async def list_checkpoints(self, task_id: str) -> list[CheckpointRecord]:
        """List all checkpoints for a task ordered by sequence number."""
        sql = "SELECT * FROM checkpoints WHERE task_id = ? ORDER BY sequence_number ASC"
        rows = await self.db.fetchall(sql, (task_id,))
        return [
            CheckpointRecord(
                checkpoint_id=row["checkpoint_id"],
                task_id=row["task_id"],
                sequence_number=row["sequence_number"],
                timestamp=row["timestamp"],
                execution_position=row["execution_position"],
                completed_calls_json=row["completed_calls_json"],
                partial_outputs_json=row["partial_outputs_json"],
                budget_state_json=row["budget_state_json"],
                task_state_json=row["task_state_json"],
                recovery_metadata_json=row["recovery_metadata_json"],
            )
            for row in rows
        ]

    # ---------------- Task Listing & Querying ---------------- #

    async def list_tasks(
        self,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[TaskRecord]:
        """List tasks with optional status filter, deterministic ordering, and pagination."""
        if status:
            sql = """
            SELECT * FROM tasks
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """
            rows = await self.db.fetchall(sql, (status, limit, offset))
        else:
            sql = """
            SELECT * FROM tasks
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """
            rows = await self.db.fetchall(sql, (limit, offset))

        return [
            TaskRecord(
                task_id=row["task_id"],
                description=row["description"],
                status=row["status"],
                created_at=row["created_at"],
                started_at=row["started_at"],
                finished_at=row["finished_at"],
                last_updated_at=row["last_updated_at"],
                metadata_json=row["metadata_json"],
                current_position=row["current_position"],
                recovery_status=row["recovery_status"],
            )
            for row in rows
        ]

    # ---------------- Task Idempotency Operations ---------------- #

    async def record_idempotency(self, record: TaskIdempotencyRecord) -> None:
        """Record a task submission idempotency key."""
        sql = """
        INSERT INTO task_idempotency (idempotency_key, task_id, request_hash, created_at)
        VALUES (?, ?, ?, ?)
        """
        try:
            await self.db.execute(
                sql,
                (
                    record.idempotency_key,
                    record.task_id,
                    record.request_hash,
                    record.created_at,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise IdempotencyConflictError(
                f"Idempotency key '{record.idempotency_key}' already exists."
            ) from exc

    async def get_idempotency(self, idempotency_key: str) -> TaskIdempotencyRecord | None:
        """Lookup an existing task submission idempotency key."""
        sql = "SELECT * FROM task_idempotency WHERE idempotency_key = ?"
        row = await self.db.fetchone(sql, (idempotency_key,))
        if row is None:
            return None
        return TaskIdempotencyRecord(
            idempotency_key=row["idempotency_key"],
            task_id=row["task_id"],
            request_hash=row["request_hash"],
            created_at=row["created_at"],
        )

    # ---------------- Workspace Operations ---------------- #

    async def create_workspace(self, record: WorkspaceRecord) -> None:
        """Register a new workspace."""
        sql = """
        INSERT INTO workspaces (workspace_id, name, root_path, created_at, description)
        VALUES (?, ?, ?, ?, ?)
        """
        try:
            await self.db.execute(
                sql,
                (
                    record.workspace_id,
                    record.name,
                    record.root_path,
                    record.created_at,
                    record.description,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise PersistenceError(
                f"Workspace with ID '{record.workspace_id}' already exists."
            ) from exc

    async def get_workspace(self, workspace_id: str) -> WorkspaceRecord | None:
        """Retrieve workspace registration by ID."""
        sql = "SELECT * FROM workspaces WHERE workspace_id = ?"
        row = await self.db.fetchone(sql, (workspace_id,))
        if row is None:
            return None
        return WorkspaceRecord(
            workspace_id=row["workspace_id"],
            name=row["name"],
            root_path=row["root_path"],
            created_at=row["created_at"],
            description=row["description"],
        )

    async def list_workspaces(self) -> list[WorkspaceRecord]:
        """List all registered workspaces."""
        sql = "SELECT * FROM workspaces ORDER BY created_at ASC"
        rows = await self.db.fetchall(sql)
        return [
            WorkspaceRecord(
                workspace_id=row["workspace_id"],
                name=row["name"],
                root_path=row["root_path"],
                created_at=row["created_at"],
                description=row["description"],
            )
            for row in rows
        ]

    async def delete_workspace(self, workspace_id: str) -> bool:
        """Delete a workspace registration (safe: does NOT touch files on disk)."""
        sql = "DELETE FROM workspaces WHERE workspace_id = ?"
        await self.db.execute(sql, (workspace_id,))
        return True
