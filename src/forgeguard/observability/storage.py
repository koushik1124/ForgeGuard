from __future__ import annotations

import logging
from typing import Any

from forgeguard.observability.models import (
    Diagnostic,
    DiagnosticCategory,
    DiagnosticSeverity,
    Span,
    Trace,
)
from forgeguard.persistence.database import Database
from forgeguard.persistence.repository import deserialize_json, serialize_json

logger = logging.getLogger("forgeguard.observability.storage")

OBSERVABILITY_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS traces (
        trace_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms REAL NOT NULL DEFAULT 0.0,
        root_span_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_traces_task ON traces(task_id);
    """,
    """
    CREATE TABLE IF NOT EXISTS spans (
        span_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        parent_span_id TEXT,
        operation_name TEXT NOT NULL,
        span_type TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms REAL NOT NULL DEFAULT 0.0,
        attributes_json TEXT NOT NULL DEFAULT '{}',
        error TEXT
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_spans_type ON spans(span_type);
    """,
    """
    CREATE TABLE IF NOT EXISTS diagnostics (
        diagnostic_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tool_call_id TEXT,
        span_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        suggested_action TEXT
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_diagnostics_task ON diagnostics(task_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_diagnostics_code ON diagnostics(code);
    """,
    """
    CREATE TABLE IF NOT EXISTS metrics_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        summary_json TEXT NOT NULL DEFAULT '{}'
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_metrics_task ON metrics_summaries(task_id);
    """,
]


class ObservabilityStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    async def initialize(self) -> None:
        """Initialize the observability database tables and indexes."""
        await self.db.initialize()
        for stmt in OBSERVABILITY_SCHEMA:
            await self.db.execute(stmt)

    async def save_trace(self, trace: Trace) -> None:
        try:
            sql = """
            INSERT INTO traces (
                trace_id, task_id, status, start_time, end_time,
                duration_ms, root_span_id, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(trace_id) DO UPDATE SET
                status = excluded.status,
                end_time = excluded.end_time,
                duration_ms = excluded.duration_ms,
                metadata_json = excluded.metadata_json;
            """
            await self.db.execute(
                sql,
                (
                    trace.trace_id,
                    trace.task_id,
                    trace.status,
                    trace.start_time,
                    trace.end_time,
                    trace.duration_ms,
                    trace.root_span_id,
                    serialize_json(trace.metadata),
                ),
            )
        except Exception as exc:
            logger.warning("Failed to persist trace '%s': %s", trace.trace_id, exc)

    async def save_span(self, span: Span) -> None:
        try:
            sql = """
            INSERT INTO spans (
                span_id, trace_id, parent_span_id, operation_name,
                span_type, status, start_time, end_time, duration_ms,
                attributes_json, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(span_id) DO UPDATE SET
                status = excluded.status,
                end_time = excluded.end_time,
                duration_ms = excluded.duration_ms,
                attributes_json = excluded.attributes_json,
                error = excluded.error;
            """
            await self.db.execute(
                sql,
                (
                    span.span_id,
                    span.trace_id,
                    span.parent_span_id,
                    span.operation_name,
                    span.span_type,
                    span.status,
                    span.start_time,
                    span.end_time,
                    span.duration_ms,
                    serialize_json(span.attributes),
                    span.error,
                ),
            )
        except Exception as exc:
            logger.warning("Failed to persist span '%s': %s", span.span_id, exc)

    async def save_diagnostic(self, diagnostic: Diagnostic) -> None:
        try:
            sql = """
            INSERT INTO diagnostics (
                diagnostic_id, task_id, trace_id, severity, category,
                code, message, timestamp, tool_call_id, span_id,
                details_json, suggested_action
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(diagnostic_id) DO NOTHING;
            """
            await self.db.execute(
                sql,
                (
                    diagnostic.diagnostic_id,
                    diagnostic.task_id,
                    diagnostic.trace_id,
                    diagnostic.severity.value,
                    diagnostic.category.value,
                    diagnostic.code,
                    diagnostic.message,
                    diagnostic.timestamp,
                    diagnostic.tool_call_id,
                    diagnostic.span_id,
                    serialize_json(diagnostic.details),
                    diagnostic.suggested_action,
                ),
            )
        except Exception as exc:
            logger.warning("Failed to persist diagnostic '%s': %s", diagnostic.diagnostic_id, exc)

    async def save_metrics_summary(
        self, task_id: str, trace_id: str, timestamp: str, summary: dict[str, Any]
    ) -> None:
        try:
            sql = """
            INSERT INTO metrics_summaries (task_id, trace_id, timestamp, summary_json)
            VALUES (?, ?, ?, ?);
            """
            await self.db.execute(
                sql,
                (
                    task_id,
                    trace_id,
                    timestamp,
                    serialize_json(summary),
                ),
            )
        except Exception as exc:
            logger.warning("Failed to persist metrics summary for task '%s': %s", task_id, exc)

    async def get_trace(self, trace_id: str) -> Trace | None:
        sql = "SELECT * FROM traces WHERE trace_id = ?;"
        row = await self.db.fetchone(sql, (trace_id,))
        if not row:
            return None
        return Trace(
            trace_id=row["trace_id"],
            task_id=row["task_id"],
            status=row["status"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            duration_ms=row["duration_ms"],
            root_span_id=row["root_span_id"],
            metadata=deserialize_json(row["metadata_json"]),
        )

    async def get_trace_by_task(self, task_id: str) -> Trace | None:
        sql = "SELECT * FROM traces WHERE task_id = ? ORDER BY start_time DESC LIMIT 1;"
        row = await self.db.fetchone(sql, (task_id,))
        if not row:
            return None
        return Trace(
            trace_id=row["trace_id"],
            task_id=row["task_id"],
            status=row["status"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            duration_ms=row["duration_ms"],
            root_span_id=row["root_span_id"],
            metadata=deserialize_json(row["metadata_json"]),
        )

    async def get_spans(self, trace_id: str, limit: int = 100, offset: int = 0) -> list[Span]:
        sql = """
        SELECT * FROM spans WHERE trace_id = ?
        ORDER BY start_time ASC LIMIT ? OFFSET ?;
        """
        rows = await self.db.fetchall(sql, (trace_id, limit, offset))
        return [
            Span(
                span_id=r["span_id"],
                trace_id=r["trace_id"],
                parent_span_id=r["parent_span_id"],
                operation_name=r["operation_name"],
                span_type=r["span_type"],
                status=r["status"],
                start_time=r["start_time"],
                end_time=r["end_time"],
                duration_ms=r["duration_ms"],
                attributes=deserialize_json(r["attributes_json"]),
                error=r["error"],
            )
            for r in rows
        ]

    async def get_diagnostics(
        self,
        task_id: str | None = None,
        severity: str | None = None,
        category: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Diagnostic]:
        conditions: list[str] = []
        params: list[Any] = []
        if task_id:
            conditions.append("task_id = ?")
            params.append(task_id)
        if severity:
            conditions.append("severity = ?")
            params.append(severity)
        if category:
            conditions.append("category = ?")
            params.append(category)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        sql = f"""
        SELECT * FROM diagnostics
        {where}
        ORDER BY timestamp ASC LIMIT ? OFFSET ?;
        """
        params.extend([limit, offset])
        rows = await self.db.fetchall(sql, tuple(params))
        return [
            Diagnostic(
                diagnostic_id=r["diagnostic_id"],
                task_id=r["task_id"],
                trace_id=r["trace_id"],
                severity=DiagnosticSeverity(r["severity"]),
                category=DiagnosticCategory(r["category"]),
                code=r["code"],
                message=r["message"],
                timestamp=r["timestamp"],
                tool_call_id=r["tool_call_id"],
                span_id=r["span_id"],
                details=deserialize_json(r["details_json"]),
                suggested_action=r["suggested_action"],
            )
            for r in rows
        ]
