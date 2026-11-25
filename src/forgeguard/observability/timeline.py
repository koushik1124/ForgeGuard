from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from forgeguard.events.event import ExecutionEvent
from forgeguard.observability.models import Span, TimelineEntry
from forgeguard.persistence.models import JournalEventRecord


def _parse_iso(timestamp_str: str) -> datetime:
    try:
        return datetime.fromisoformat(timestamp_str)
    except Exception:
        return datetime.now(timezone.utc)


class TimelineBuilder:
    @staticmethod
    def build_from_events(
        task_id: str,
        events: list[ExecutionEvent] | list[JournalEventRecord],
        trace_id: str | None = None,
        spans: list[Span] | None = None,
    ) -> list[TimelineEntry]:
        """Construct deterministic, chronologically ordered timeline entries from events."""
        entries: list[TimelineEntry] = []
        span_durations: dict[str, float] = {}

        if spans:
            for span in spans:
                # Match span by tool call id in attributes if present
                call_id = span.attributes.get("call_id")
                if call_id:
                    span_durations[call_id] = span.duration_ms

        for idx, event in enumerate(events):
            seq = idx + 1
            if isinstance(event, JournalEventRecord):
                seq = event.sequence_number
                event_type = event.event_type
                timestamp = event.timestamp
                try:
                    payload = (
                        json.loads(event.payload_json)
                        if isinstance(event.payload_json, str)
                        else event.payload_json
                    )
                except Exception:
                    payload = {}
            elif isinstance(event, ExecutionEvent):
                event_type = event.event_type
                timestamp = event.timestamp.isoformat()
                payload = event.payload or {}
            else:
                continue

            entry = TimelineBuilder._event_to_timeline_entry(
                seq=seq,
                timestamp=timestamp,
                event_type=event_type,
                payload=payload,
                task_id=task_id,
                trace_id=trace_id,
                span_durations=span_durations,
            )
            entries.append(entry)

        # Sort deterministically by sequence_number
        entries.sort(key=lambda e: e.sequence_number)
        return entries

    @staticmethod
    def _event_to_timeline_entry(
        seq: int,
        timestamp: str,
        event_type: str,
        payload: dict[str, Any],
        task_id: str,
        trace_id: str | None,
        span_durations: dict[str, float],
    ) -> TimelineEntry:
        tool_call_id: str | None = payload.get("call_id")
        tool_name: str | None = payload.get("tool_name")
        status: str = "success"
        category: str = "execution"
        duration_ms: float | None = None
        summary: str = f"Event: {event_type}"

        if tool_call_id and tool_call_id in span_durations:
            duration_ms = span_durations[tool_call_id]

        if event_type == "task_started":
            category = "task"
            summary = "Task execution started"
        elif event_type == "task_completed":
            category = "task"
            steps = payload.get("steps", 0)
            summary = f"Task completed successfully ({steps} steps)"
        elif event_type == "task_failed":
            category = "task"
            status = "failure"
            err = payload.get("error", "Unknown error")
            summary = f"Task failed: {err}"
        elif event_type == "task_cancelled":
            category = "task"
            status = "cancelled"
            summary = "Task was cancelled"
        elif event_type == "policy_decision":
            category = "policy"
            allowed = payload.get("allowed", False)
            status = "allowed" if allowed else "denied"
            reason = payload.get("reason", "")
            summary = f"Policy {'allowed' if allowed else 'denied'} tool '{tool_name}' ({reason})"
        elif event_type == "tool_call_started":
            category = "tool"
            summary = f"Tool '{tool_name}' execution started"
        elif event_type == "tool_call_completed":
            category = "tool"
            tool_status = payload.get("status", "success")
            status = tool_status
            if tool_status == "failure":
                summary = f"Tool '{tool_name}' failed: {payload.get('error', '')}"
            else:
                summary = f"Tool '{tool_name}' completed successfully"
        elif event_type == "tool_timeout":
            category = "timeout"
            status = "timeout"
            timeout_sec = payload.get("timeout_seconds", 0)
            summary = f"Tool '{tool_name}' timed out after {timeout_sec:.2f}s"
        elif event_type == "tool_call_rejected":
            category = "policy"
            status = "rejected"
            reason = payload.get("reason", "")
            summary = f"Tool '{tool_name}' call rejected: {reason}"
        elif event_type == "budget_initialized":
            category = "budget"
            summary = "Resource budget initialized"
        elif event_type == "budget_updated":
            category = "budget"
            calls = payload.get("consumed_tool_calls", 0)
            bytes_out = payload.get("output_bytes_consumed", 0)
            summary = f"Budget consumption updated: {calls} calls, {bytes_out} bytes"
        elif event_type == "budget_exceeded":
            category = "budget"
            status = "exceeded"
            limit = payload.get("limit", "unknown")
            reason = payload.get("reason", "")
            summary = f"Budget limit '{limit}' exceeded: {reason}"
        elif event_type in ("checkpoint_created", "checkpoint_saved"):
            category = "checkpoint"
            pos = payload.get("position", payload.get("execution_position", 0))
            summary = f"Checkpoint created at execution position {pos}"
        elif event_type == "task_resumed":
            category = "resume"
            pos = payload.get("reconstructed_position", 0)
            summary = f"Task resumed at step {pos}"
        elif event_type == "task_recovered":
            category = "recovery"
            summary = f"Task recovered (checkpoint: {payload.get('checkpoint_id')})"

        return TimelineEntry(
            sequence_number=seq,
            timestamp=timestamp,
            event_type=event_type,
            category=category,
            task_id=task_id,
            trace_id=trace_id,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            duration_ms=duration_ms,
            status=status,
            summary=summary,
            metadata=dict(payload),
        )

    @staticmethod
    def filter_by_task(entries: list[TimelineEntry], task_id: str) -> list[TimelineEntry]:
        return [e for e in entries if e.task_id == task_id]

    @staticmethod
    def filter_by_tool(entries: list[TimelineEntry], tool_name: str) -> list[TimelineEntry]:
        return [e for e in entries if e.tool_name == tool_name]

    @staticmethod
    def filter_by_category(entries: list[TimelineEntry], category: str) -> list[TimelineEntry]:
        return [e for e in entries if e.category == category]

    @staticmethod
    def filter_by_status(entries: list[TimelineEntry], status: str) -> list[TimelineEntry]:
        return [e for e in entries if e.status == status]

    @staticmethod
    def filter_by_time_range(
        entries: list[TimelineEntry],
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> list[TimelineEntry]:
        filtered = entries
        if start_time:
            dt_start = _parse_iso(start_time)
            filtered = [e for e in filtered if _parse_iso(e.timestamp) >= dt_start]
        if end_time:
            dt_end = _parse_iso(end_time)
            filtered = [e for e in filtered if _parse_iso(e.timestamp) <= dt_end]
        return filtered

    @staticmethod
    def sort(entries: list[TimelineEntry], reverse: bool = False) -> list[TimelineEntry]:
        return sorted(entries, key=lambda e: e.sequence_number, reverse=reverse)
