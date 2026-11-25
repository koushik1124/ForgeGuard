from __future__ import annotations

from pathlib import Path

import pytest

from forgeguard.observability.models import (
    Diagnostic,
    DiagnosticCategory,
    DiagnosticSeverity,
    Span,
    SpanType,
    Trace,
)
from forgeguard.observability.storage import ObservabilityStore
from forgeguard.persistence.database import Database


@pytest.fixture
def obs_db(tmp_path: Path) -> Database:
    db_file = tmp_path / "test_observability.db"
    return Database(db_file)


@pytest.mark.asyncio
async def test_observability_store_lifecycle(obs_db: Database) -> None:
    store = ObservabilityStore(obs_db)
    await store.initialize()

    # Save and retrieve trace
    trace = Trace(
        trace_id="tr-test-1",
        task_id="task-test-1",
        status="completed",
        start_time="2026-11-21T10:00:00Z",
        end_time="2026-11-21T10:00:05Z",
        duration_ms=5000.0,
        root_span_id="span-root-1",
        metadata={"client": "test-runner"},
    )
    await store.save_trace(trace)

    retrieved = await store.get_trace("tr-test-1")
    assert retrieved is not None
    assert retrieved.trace_id == "tr-test-1"
    assert retrieved.task_id == "task-test-1"
    assert retrieved.duration_ms == 5000.0
    assert retrieved.metadata["client"] == "test-runner"

    by_task = await store.get_trace_by_task("task-test-1")
    assert by_task is not None
    assert by_task.trace_id == "tr-test-1"

    # Save and retrieve spans
    span = Span(
        span_id="span-test-1",
        trace_id="tr-test-1",
        operation_name="tool:compute",
        span_type=SpanType.TOOL_EXECUTION.value,
        start_time="2026-11-21T10:00:01Z",
        end_time="2026-11-21T10:00:02Z",
        duration_ms=1000.0,
        status="completed",
        attributes={"cores": 4},
    )
    await store.save_span(span)

    spans = await store.get_spans("tr-test-1")
    assert len(spans) == 1
    assert spans[0].span_id == "span-test-1"
    assert spans[0].attributes["cores"] == 4

    # Save and retrieve diagnostics
    diag = Diagnostic(
        diagnostic_id="diag-test-1",
        task_id="task-test-1",
        trace_id="tr-test-1",
        severity=DiagnosticSeverity.WARNING,
        category=DiagnosticCategory.BEHAVIOR,
        code="FG-LOOP-001",
        message="Potential loop detected",
        timestamp="2026-11-21T10:00:03Z",
        details={"repeats": 3},
        suggested_action="Review planner",
    )
    await store.save_diagnostic(diag)

    diagnostics = await store.get_diagnostics(task_id="task-test-1")
    assert len(diagnostics) == 1
    assert diagnostics[0].code == "FG-LOOP-001"
    assert diagnostics[0].severity == DiagnosticSeverity.WARNING

    # Filter diagnostics by severity
    errors = await store.get_diagnostics(severity=DiagnosticSeverity.ERROR.value)
    assert len(errors) == 0
    warnings = await store.get_diagnostics(severity=DiagnosticSeverity.WARNING.value)
    assert len(warnings) == 1

    # Save metrics summary
    await store.save_metrics_summary(
        task_id="task-test-1",
        trace_id="tr-test-1",
        timestamp="2026-11-21T10:00:05Z",
        summary={"tasks": {"total": 1, "completed": 1}},
    )


@pytest.mark.asyncio
async def test_observability_persistence_across_reconnection(tmp_path: Path) -> None:
    db_file = tmp_path / "obs_persist.db"

    # Connection 1: write trace
    db1 = Database(db_file)
    store1 = ObservabilityStore(db1)
    await store1.initialize()
    trace = Trace(
        trace_id="tr-persist-1",
        task_id="task-persist-1",
        status="completed",
        start_time="2026-11-21T10:00:00Z",
        root_span_id="root-p",
    )
    await store1.save_trace(trace)
    await db1.close()

    # Connection 2: read trace
    db2 = Database(db_file)
    store2 = ObservabilityStore(db2)
    await store2.initialize()
    loaded = await store2.get_trace("tr-persist-1")
    assert loaded is not None
    assert loaded.task_id == "task-persist-1"
    await db2.close()
