from __future__ import annotations

import asyncio

import pytest

from forgeguard.observability.models import SpanType
from forgeguard.observability.tracer import Tracer


def test_tracer_start_and_end_trace() -> None:
    tracer = Tracer()
    trace = tracer.start_trace(task_id="task-100", metadata={"env": "test"})
    assert trace.task_id == "task-100"
    assert trace.status == "running"
    assert trace.root_span_id.startswith("span-root-")
    assert tracer.get_trace(trace.trace_id) is trace
    assert tracer.get_trace_by_task("task-100") is trace

    root_span = tracer.get_span(trace.root_span_id)
    assert root_span is not None
    assert root_span.status == "running"

    final_trace = tracer.end_trace(trace.trace_id, status="completed")
    assert final_trace.status == "completed"
    assert final_trace.duration_ms >= 0.0
    assert final_trace.end_time is not None

    # Verify root span was also completed
    updated_root = tracer.get_span(trace.root_span_id)
    assert updated_root is not None
    assert updated_root.status == "completed"


def test_tracer_spans_hierarchy_and_duration() -> None:
    tracer = Tracer()
    trace = tracer.start_trace(task_id="task-200")

    span1 = tracer.start_span(
        trace_id=trace.trace_id,
        operation_name="tool:read_file",
        span_type=SpanType.TOOL_EXECUTION,
        attributes={"path": "foo.txt"},
    )
    assert span1.parent_span_id == trace.root_span_id

    span2 = tracer.start_span(
        trace_id=trace.trace_id,
        operation_name="policy:check",
        span_type=SpanType.POLICY_EVALUATION,
        parent_span_id=span1.span_id,
    )
    assert span2.parent_span_id == span1.span_id

    tracer.end_span(span2.span_id, status="completed")
    tracer.end_span(span1.span_id, status="completed")

    spans = tracer.get_spans(trace.trace_id)
    assert len(spans) == 3  # root + span1 + span2

    tracer.end_trace(trace.trace_id, status="completed")


def test_tracer_orphan_spans_closed_on_end_trace() -> None:
    tracer = Tracer()
    trace = tracer.start_trace(task_id="task-orphan")

    span = tracer.start_span(
        trace_id=trace.trace_id,
        operation_name="tool:long_tool",
        span_type=SpanType.TOOL_EXECUTION,
    )
    assert span.status == "running"

    # End trace prematurely without explicitly ending span
    tracer.end_trace(trace.trace_id, status="failed", error="Process crashed")

    updated_span = tracer.get_span(span.span_id)
    assert updated_span is not None
    assert updated_span.status == "closed"
    assert updated_span.duration_ms >= 0.0


def test_sync_span_context_manager() -> None:
    tracer = Tracer()
    trace = tracer.start_trace(task_id="task-ctx-sync")

    with tracer.span(trace.trace_id, "operation:test", SpanType.BUDGET_CHECK) as s:
        assert s.status == "running"
    assert s.status == "completed"
    assert s.duration_ms >= 0.0

    # Exception safety
    with pytest.raises(ValueError, match="fail"):
        with tracer.span(trace.trace_id, "operation:fail", SpanType.TOOL_EXECUTION) as sf:
            raise ValueError("fail")
    assert sf.status == "failed"
    assert sf.error == "fail"


@pytest.mark.asyncio
async def test_async_span_context_manager() -> None:
    tracer = Tracer()
    trace = tracer.start_trace(task_id="task-ctx-async")

    async with tracer.async_span(trace.trace_id, "async_op", SpanType.PERSISTENCE) as s:
        await asyncio.sleep(0.01)
        assert s.status == "running"
    assert s.status == "completed"
    assert s.duration_ms >= 0.0

    with pytest.raises(RuntimeError, match="async error"):
        async with tracer.async_span(trace.trace_id, "async_err", SpanType.TOOL_EXECUTION) as se:
            raise RuntimeError("async error")
    assert se.status == "failed"
    assert se.error == "async error"
