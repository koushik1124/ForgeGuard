from __future__ import annotations

import sqlite3

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        last_updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        current_position INTEGER NOT NULL DEFAULT 0,
        recovery_status TEXT
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    """,
    """
    CREATE TABLE IF NOT EXISTS tool_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        arguments_json TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time TEXT,
        completion_time TEXT,
        result_json TEXT,
        error_text TEXT,
        duration_seconds REAL,
        idempotency_key TEXT NOT NULL,
        recovery_classification TEXT,
        UNIQUE(task_id, sequence_number),
        UNIQUE(task_id, tool_call_id),
        UNIQUE(task_id, idempotency_key)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_tool_executions_task
    ON tool_executions(task_id, sequence_number);
    """,
    """
    CREATE TABLE IF NOT EXISTS execution_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(task_id, sequence_number)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_events_task_seq
    ON execution_events(task_id, sequence_number);
    """,
    """
    CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        execution_position INTEGER NOT NULL,
        completed_calls_json TEXT NOT NULL DEFAULT '[]',
        partial_outputs_json TEXT NOT NULL DEFAULT '{}',
        budget_state_json TEXT NOT NULL DEFAULT '{}',
        task_state_json TEXT NOT NULL DEFAULT '{}',
        recovery_metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(task_id, sequence_number)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_checkpoints_task_seq
    ON checkpoints(task_id, sequence_number DESC);
    """,
    """
    CREATE TABLE IF NOT EXISTS task_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
        request_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_idempotency_task ON task_idempotency(task_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS workspaces (
        workspace_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
    );
    """,
]


def init_schema(conn: sqlite3.Connection) -> None:
    """Initialize database schema with required tables and indexes."""
    with conn:
        for stmt in SCHEMA_STATEMENTS:
            conn.execute(stmt)
