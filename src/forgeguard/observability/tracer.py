from __future__ import annotations

import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from forgeguard.observability.models import Span, SpanType, Trace


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Tracer:
    def __init__(self) -> None:
        self._traces: dict[str, Trace] = {}
        self._task_to_trace: dict[str, str] = {}
        self._spans: dict[str, Span] = {}
        self._trace_spans: dict[str, list[str]] = {}

        # Internal monotonic time tracking
        self._trace_start_mono: dict[str, float] = {}
        self._span_start_mono: dict[str, float] = {}

    def start_trace(
        self,
        task_id: str,
        metadata: dict[str, Any] | None = None,
        trace_id: str | None = None,
    ) -> Trace:
        """Start a new trace for a task."""
        t_id = trace_id or f"trace-{uuid4().hex[:12]}"
        now_iso = _utc_iso_now()
        mono_now = time.monotonic()

        # Root span representing overall task execution
        root_span_id = f"span-root-{uuid4().hex[:8]}"
        root_span = Span(
            span_id=root_span_id,
            trace_id=t_id,
            operation_name="task_execution",
            span_type=SpanType.TASK_EXECUTION.value,
            start_time=now_iso,
            parent_span_id=None,
            status="running",
            attributes={"task_id": task_id, **(metadata or {})},
        )

        trace = Trace(
            trace_id=t_id,
            task_id=task_id,
            start_time=now_iso,
            root_span_id=root_span_id,
            status="running",
            metadata=dict(metadata or {}),
            spans_count=1,
        )

        self._traces[t_id] = trace
        self._task_to_trace[task_id] = t_id
        self._trace_start_mono[t_id] = mono_now

        self._spans[root_span_id] = root_span
        self._span_start_mono[root_span_id] = mono_now
        self._trace_spans[t_id] = [root_span_id]

        return trace

    def end_trace(
        self,
        trace_id: str,
        status: str = "completed",
        metadata: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> Trace:
        """Finalize an active trace, closing open spans and recording duration."""
        trace = self._traces.get(trace_id)
        if trace is None:
            raise KeyError(f"Trace with ID '{trace_id}' not found.")

        mono_end = time.monotonic()
        mono_start = self._trace_start_mono.get(trace_id, mono_end)
        trace.duration_ms = max(0.0, (mono_end - mono_start) * 1000.0)
        trace.end_time = _utc_iso_now()
        trace.status = status
        if metadata:
            trace.metadata.update(metadata)

        # Close any lingering open spans
        span_ids = self._trace_spans.get(trace_id, [])
        for sid in span_ids:
            span = self._spans.get(sid)
            if span and span.status == "running":
                s_mono_start = self._span_start_mono.get(sid, mono_end)
                span.duration_ms = max(0.0, (mono_end - s_mono_start) * 1000.0)
                span.end_time = trace.end_time
                span.status = status if sid == trace.root_span_id else "closed"
                if error and sid == trace.root_span_id:
                    span.error = error

        trace.spans_count = len(span_ids)
        return trace

    def start_span(
        self,
        trace_id: str,
        operation_name: str,
        span_type: SpanType | str,
        parent_span_id: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> Span:
        """Start an individual span within a trace."""
        trace = self._traces.get(trace_id)
        if trace is None:
            raise KeyError(f"Trace with ID '{trace_id}' not found.")

        s_id = f"span-{uuid4().hex[:8]}"
        now_iso = _utc_iso_now()
        mono_now = time.monotonic()

        type_str = span_type.value if isinstance(span_type, SpanType) else str(span_type)
        actual_parent = parent_span_id or trace.root_span_id

        span = Span(
            span_id=s_id,
            trace_id=trace_id,
            parent_span_id=actual_parent,
            operation_name=operation_name,
            span_type=type_str,
            start_time=now_iso,
            status="running",
            attributes=dict(attributes or {}),
        )

        self._spans[s_id] = span
        self._span_start_mono[s_id] = mono_now
        self._trace_spans.setdefault(trace_id, []).append(s_id)
        trace.spans_count = len(self._trace_spans[trace_id])

        return span

    def end_span(
        self,
        span_id: str,
        status: str = "completed",
        error: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> Span:
        """End a span and calculate duration."""
        span = self._spans.get(span_id)
        if span is None:
            raise KeyError(f"Span with ID '{span_id}' not found.")

        mono_end = time.monotonic()
        mono_start = self._span_start_mono.get(span_id, mono_end)
        span.duration_ms = max(0.0, (mono_end - mono_start) * 1000.0)
        span.end_time = _utc_iso_now()
        span.status = status
        span.error = error
        if attributes:
            span.attributes.update(attributes)

        return span

    @asynccontextmanager
    async def async_span(
        self,
        trace_id: str,
        operation_name: str,
        span_type: SpanType | str,
        parent_span_id: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> AsyncIterator[Span]:
        """Async context manager for span lifecycle."""
        span = self.start_span(
            trace_id=trace_id,
            operation_name=operation_name,
            span_type=span_type,
            parent_span_id=parent_span_id,
            attributes=attributes,
        )
        try:
            yield span
            if span.status == "running":
                self.end_span(span.span_id, status="completed")
        except Exception as exc:
            if span.status == "running":
                self.end_span(span.span_id, status="failed", error=str(exc))
            raise

    @contextmanager
    def span(
        self,
        trace_id: str,
        operation_name: str,
        span_type: SpanType | str,
        parent_span_id: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> Iterator[Span]:
        """Sync context manager for span lifecycle."""
        span = self.start_span(
            trace_id=trace_id,
            operation_name=operation_name,
            span_type=span_type,
            parent_span_id=parent_span_id,
            attributes=attributes,
        )
        try:
            yield span
            if span.status == "running":
                self.end_span(span.span_id, status="completed")
        except Exception as exc:
            if span.status == "running":
                self.end_span(span.span_id, status="failed", error=str(exc))
            raise

    def get_trace(self, trace_id: str) -> Trace | None:
        return self._traces.get(trace_id)

    def get_trace_by_task(self, task_id: str) -> Trace | None:
        trace_id = self._task_to_trace.get(task_id)
        if trace_id is None:
            return None
        return self._traces.get(trace_id)

    def get_spans(self, trace_id: str) -> list[Span]:
        span_ids = self._trace_spans.get(trace_id, [])
        return [self._spans[sid] for sid in span_ids if sid in self._spans]

    def get_span(self, span_id: str) -> Span | None:
        return self._spans.get(span_id)

    def get_all_traces(self) -> list[Trace]:
        return list(self._traces.values())
