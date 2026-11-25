from __future__ import annotations

from forgeguard.events.event import ExecutionEvent
from forgeguard.observability.models import Span, SpanType
from forgeguard.observability.timeline import TimelineBuilder
from forgeguard.persistence.models import JournalEventRecord
from forgeguard.persistence.repository import serialize_json


def test_timeline_construction_from_execution_events() -> None:
    events = [
        ExecutionEvent.create("task_started", {"task_id": "t1"}),
        ExecutionEvent.create(
            "policy_decision",
            {
                "tool_name": "search",
                "allowed": True,
                "reason": "explicit allow",
                "call_id": "call-1",
            },
        ),
        ExecutionEvent.create(
            "tool_call_started",
            {"tool_name": "search", "call_id": "call-1", "step": 0},
        ),
        ExecutionEvent.create(
            "tool_call_completed",
            {"tool_name": "search", "call_id": "call-1", "status": "success"},
        ),
        ExecutionEvent.create("task_completed", {"task_id": "t1", "steps": 1}),
    ]

    spans = [
        Span(
            span_id="s1",
            trace_id="tr1",
            operation_name="tool:search",
            span_type=SpanType.TOOL_EXECUTION.value,
            start_time="2026-11-21T10:00:00Z",
            duration_ms=45.2,
            attributes={"call_id": "call-1"},
        )
    ]

    timeline = TimelineBuilder.build_from_events("t1", events, trace_id="tr1", spans=spans)
    assert len(timeline) == 5

    assert timeline[0].category == "task"
    assert timeline[0].summary == "Task execution started"

    assert timeline[1].category == "policy"
    assert timeline[1].status == "allowed"

    assert timeline[2].category == "tool"
    assert timeline[2].tool_name == "search"

    assert timeline[3].category == "tool"
    assert timeline[3].duration_ms == 45.2  # Matched from span

    assert timeline[4].category == "task"
    assert "successfully" in timeline[4].summary


def test_timeline_construction_from_journal_records() -> None:
    records = [
        JournalEventRecord(
            event_id="e1",
            task_id="t2",
            sequence_number=1,
            event_type="budget_initialized",
            timestamp="2026-11-21T10:00:00Z",
            payload_json=serialize_json({"task_id": "t2"}),
        ),
        JournalEventRecord(
            event_id="e2",
            task_id="t2",
            sequence_number=2,
            event_type="tool_timeout",
            timestamp="2026-11-21T10:00:05Z",
            payload_json=serialize_json(
                {
                    "tool_name": "network_call",
                    "timeout_seconds": 5.0,
                    "call_id": "c-timeout",
                }
            ),
        ),
    ]

    timeline = TimelineBuilder.build_from_events("t2", records, trace_id="tr2")
    assert len(timeline) == 2
    assert timeline[0].category == "budget"
    assert timeline[1].category == "timeout"
    assert timeline[1].status == "timeout"
    assert "5.00s" in timeline[1].summary


def test_timeline_filtering_and_sorting() -> None:
    events = [
        ExecutionEvent.create("task_started", {"task_id": "t3"}),
        ExecutionEvent.create("policy_decision", {"tool_name": "tool_a", "allowed": True}),
        ExecutionEvent.create("tool_call_started", {"tool_name": "tool_a"}),
        ExecutionEvent.create("policy_decision", {"tool_name": "tool_b", "allowed": False}),
        ExecutionEvent.create("task_failed", {"task_id": "t3", "error": "denied"}),
    ]
    timeline = TimelineBuilder.build_from_events("t3", events)

    # Filter by category
    policy_entries = TimelineBuilder.filter_by_category(timeline, "policy")
    assert len(policy_entries) == 2

    # Filter by tool
    tool_a_entries = TimelineBuilder.filter_by_tool(timeline, "tool_a")
    assert len(tool_a_entries) == 2

    # Filter by status
    allowed_entries = TimelineBuilder.filter_by_status(timeline, "allowed")
    assert len(allowed_entries) == 1

    # Reverse sort
    reversed_timeline = TimelineBuilder.sort(timeline, reverse=True)
    assert reversed_timeline[0].sequence_number == 5
    assert reversed_timeline[-1].sequence_number == 1


def test_empty_timeline() -> None:
    timeline = TimelineBuilder.build_from_events("t-empty", [])
    assert timeline == []
