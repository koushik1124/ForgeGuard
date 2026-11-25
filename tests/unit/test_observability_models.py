from __future__ import annotations

from forgeguard.observability.models import (
    Diagnostic,
    DiagnosticCategory,
    DiagnosticSeverity,
    ExecutionReport,
    MetricRecord,
    MetricType,
    Span,
    SpanType,
    TimelineEntry,
    Trace,
)


def test_span_model_and_serialization() -> None:
    span = Span(
        span_id="span-123",
        trace_id="trace-abc",
        operation_name="tool:calculator",
        span_type=SpanType.TOOL_EXECUTION.value,
        start_time="2026-11-21T10:00:00Z",
        parent_span_id="span-root",
        end_time="2026-11-21T10:00:01Z",
        duration_ms=1000.0,
        status="completed",
        attributes={"tool_name": "calculator"},
    )
    d = span.to_dict()
    assert d["span_id"] == "span-123"
    assert d["trace_id"] == "trace-abc"
    assert d["duration_ms"] == 1000.0
    assert d["attributes"]["tool_name"] == "calculator"


def test_trace_model_and_serialization() -> None:
    trace = Trace(
        trace_id="trace-1",
        task_id="task-1",
        start_time="2026-11-21T10:00:00Z",
        root_span_id="span-root",
        end_time="2026-11-21T10:00:02Z",
        duration_ms=2000.0,
        status="completed",
        metadata={"user": "agent"},
    )
    d = trace.to_dict()
    assert d["trace_id"] == "trace-1"
    assert d["task_id"] == "task-1"
    assert d["status"] == "completed"


def test_metric_record_serialization() -> None:
    rec = MetricRecord(
        metric_name="tasks_completed_total",
        metric_type=MetricType.COUNTER,
        value=1.0,
        timestamp="2026-11-21T10:00:00Z",
        unit="count",
        labels={"status": "completed"},
        task_id="t1",
    )
    d = rec.to_dict()
    assert d["metric_name"] == "tasks_completed_total"
    assert d["metric_type"] == "counter"
    assert d["value"] == 1.0


def test_diagnostic_model_and_serialization() -> None:
    diag = Diagnostic(
        diagnostic_id="diag-1",
        task_id="t1",
        trace_id="tr1",
        severity=DiagnosticSeverity.ERROR,
        category=DiagnosticCategory.POLICY,
        code="FG-POLICY-001",
        message="Unauthorized tool",
        timestamp="2026-11-21T10:00:00Z",
        details={"tool": "bash"},
        suggested_action="Allow bash in policy",
    )
    d = diag.to_dict()
    assert d["code"] == "FG-POLICY-001"
    assert d["severity"] == "error"
    assert d["category"] == "policy"
    assert d["suggested_action"] == "Allow bash in policy"


def test_timeline_entry_and_report_serialization() -> None:
    entry = TimelineEntry(
        sequence_number=1,
        timestamp="2026-11-21T10:00:00Z",
        event_type="task_started",
        category="task",
        task_id="t1",
        status="success",
        summary="Task started",
    )
    report = ExecutionReport(
        task_id="t1",
        trace_id="tr1",
        description="Demo",
        status="completed",
        start_time="2026-11-21T10:00:00Z",
        duration_ms=150.0,
        timeline=[entry],
    )
    rep_dict = report.to_dict()
    assert rep_dict["task_id"] == "t1"
    assert len(rep_dict["timeline"]) == 1
    assert rep_dict["timeline"][0]["summary"] == "Task started"
