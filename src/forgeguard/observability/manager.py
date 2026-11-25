from __future__ import annotations

import logging
from typing import Any

from forgeguard.core.task import Task
from forgeguard.observability.behavior import (
    BehaviorConfig,
    BehaviorDetector,
)
from forgeguard.observability.diagnostics import DiagnosticsEngine
from forgeguard.observability.export import ReportExporter
from forgeguard.observability.metrics import MetricsCollector
from forgeguard.observability.models import (
    Diagnostic,
    DiagnosticCategory,
    DiagnosticSeverity,
    ExecutionReport,
    Span,
    SpanType,
    TimelineEntry,
    Trace,
)
from forgeguard.observability.storage import ObservabilityStore
from forgeguard.observability.timeline import TimelineBuilder
from forgeguard.observability.tracer import Tracer

logger = logging.getLogger("forgeguard.observability.manager")


class ObservabilityManager:
    """Unified coordinator for ForgeGuard Tracing, Metrics, Timeline, Diagnostics, and Behavior."""

    def __init__(
        self,
        store: ObservabilityStore | None = None,
        behavior_config: BehaviorConfig | None = None,
    ) -> None:
        self.tracer = Tracer()
        self.metrics = MetricsCollector()
        self.diagnostics = DiagnosticsEngine()
        self.behavior = BehaviorDetector(behavior_config)
        self.store = store

        # Task tool invocation history for behavior analysis: task_id -> list of tool calls
        self._task_invocations: dict[str, list[dict[str, Any]]] = {}
        # Active tool spans: call_id -> span_id
        self._tool_spans: dict[str, str] = {}
        # Task tool summaries: task_id -> list of summary dicts
        self._tool_summaries: dict[str, list[dict[str, Any]]] = {}
        # Cached execution events per task for timeline construction
        self._task_events: dict[str, list[Any]] = {}

    async def initialize(self) -> None:
        if self.store is not None:
            await self.store.initialize()

    # --- Runtime Lifecycle Hooks ---

    async def on_task_start(
        self,
        task: Task,
        metadata: dict[str, Any] | None = None,
        trace_id: str | None = None,
    ) -> Trace:
        meta = {"description": task.description, **(metadata or {})}
        trace = self.tracer.start_trace(task_id=task.task_id, metadata=meta, trace_id=trace_id)
        self.metrics.record_task_started(task.task_id, trace.trace_id)
        self._task_invocations[task.task_id] = []
        self._tool_summaries[task.task_id] = []
        self._task_events[task.task_id] = []

        if self.store is not None:
            await self.store.save_trace(trace)
            root_span = self.tracer.get_span(trace.root_span_id)
            if root_span:
                await self.store.save_span(root_span)

        return trace

    async def on_task_completed(
        self,
        task: Task,
        steps: int,
        outputs: dict[str, Any] | None = None,
    ) -> Trace | None:
        trace = self.tracer.get_trace_by_task(task.task_id)
        if trace is None:
            return None

        self.tracer.end_trace(trace.trace_id, status="completed")
        self.metrics.record_task_completed(task.task_id, trace.duration_ms, trace.trace_id)

        # Run behavior detection
        self._run_behavior_analysis(task.task_id, trace.trace_id)

        if self.store is not None:
            await self.store.save_trace(trace)
            root_span = self.tracer.get_span(trace.root_span_id)
            if root_span:
                await self.store.save_span(root_span)
            await self.store.save_metrics_summary(
                task.task_id,
                trace.trace_id,
                trace.end_time or "",
                self.metrics.get_aggregate_summary(),
            )

        return trace

    async def on_task_failed(
        self,
        task: Task,
        error_type: str,
        error: str,
    ) -> Trace | None:
        trace = self.tracer.get_trace_by_task(task.task_id)
        if trace is None:
            return None

        self.tracer.end_trace(trace.trace_id, status="failed", error=error)
        self.metrics.record_task_failed(
            task.task_id, trace.duration_ms, error_type=error_type, trace_id=trace.trace_id
        )

        # Generate generic execution failure diagnostic if no specific diagnostic exists
        existing = self.diagnostics.get_diagnostics(task_id=task.task_id)
        if not existing:
            diag = self.diagnostics.create_diagnostic(
                task_id=task.task_id,
                trace_id=trace.trace_id,
                severity=DiagnosticSeverity.ERROR,
                category=DiagnosticCategory.EXECUTION,
                code="FG-EXEC-001",
                message=f"Task execution failed: {error}",
                details={"error_type": error_type, "error": error},
                suggested_action="Review error stack trace and tool invocation arguments.",
            )
            if self.store is not None:
                await self.store.save_diagnostic(diag)

        # Run behavior detection
        self._run_behavior_analysis(task.task_id, trace.trace_id)

        if self.store is not None:
            await self.store.save_trace(trace)
            root_span = self.tracer.get_span(trace.root_span_id)
            if root_span:
                await self.store.save_span(root_span)

        return trace

    async def on_task_cancelled(self, task: Task) -> Trace | None:
        trace = self.tracer.get_trace_by_task(task.task_id)
        if trace is None:
            return None

        self.tracer.end_trace(trace.trace_id, status="cancelled")
        self.metrics.record_task_cancelled(task.task_id, trace.duration_ms, trace_id=trace.trace_id)

        diag = self.diagnostics.diagnose_cancellation(task.task_id, trace.trace_id)
        if self.store is not None:
            await self.store.save_trace(trace)
            await self.store.save_diagnostic(diag)
            root_span = self.tracer.get_span(trace.root_span_id)
            if root_span:
                await self.store.save_span(root_span)

        return trace

    async def on_tool_start(
        self,
        task_id: str,
        tool_name: str,
        call_id: str,
        step: int,
        timeout: float,
        arguments: dict[str, Any] | None = None,
    ) -> Span | None:
        trace = self.tracer.get_trace_by_task(task_id)
        if trace is None:
            return None

        span = self.tracer.start_span(
            trace_id=trace.trace_id,
            operation_name=f"tool:{tool_name}",
            span_type=SpanType.TOOL_EXECUTION,
            attributes={
                "call_id": call_id,
                "tool_name": tool_name,
                "step": step,
                "timeout": timeout,
            },
        )
        self._tool_spans[call_id] = span.span_id

        if self.store is not None:
            await self.store.save_span(span)

        return span

    async def on_tool_completed(
        self,
        task_id: str,
        tool_name: str,
        call_id: str,
        step: int,
        duration_seconds: float,
        output: Any,
        arguments: dict[str, Any] | None = None,
    ) -> Span | None:
        trace = self.tracer.get_trace_by_task(task_id)
        span_id = self._tool_spans.pop(call_id, None)

        span: Span | None = None
        if span_id:
            span = self.tracer.end_span(
                span_id,
                status="completed",
                attributes={"duration_seconds": duration_seconds},
            )
            if self.store is not None:
                await self.store.save_span(span)

        duration_ms = duration_seconds * 1000.0
        self.metrics.record_tool_call(
            tool_name=tool_name,
            status="success",
            duration_ms=duration_ms,
            is_timeout=False,
            task_id=task_id,
            trace_id=trace.trace_id if trace else None,
        )

        self._task_invocations.setdefault(task_id, []).append(
            {
                "tool_name": tool_name,
                "arguments": arguments or {},
                "status": "success",
                "duration_seconds": duration_seconds,
            }
        )
        self._tool_summaries.setdefault(task_id, []).append(
            {
                "tool_name": tool_name,
                "call_id": call_id,
                "step": step,
                "status": "success",
                "duration_ms": duration_ms,
                "is_timeout": False,
            }
        )

        return span

    async def on_tool_failed(
        self,
        task_id: str,
        tool_name: str,
        call_id: str,
        step: int,
        duration_seconds: float,
        error: str,
        is_timeout: bool = False,
        timeout_seconds: float | None = None,
        arguments: dict[str, Any] | None = None,
    ) -> Span | None:
        trace = self.tracer.get_trace_by_task(task_id)
        span_id = self._tool_spans.pop(call_id, None)

        status = "timeout" if is_timeout else "failed"
        span: Span | None = None
        if span_id:
            span = self.tracer.end_span(
                span_id,
                status=status,
                error=error,
                attributes={"duration_seconds": duration_seconds, "is_timeout": is_timeout},
            )
            if self.store is not None:
                await self.store.save_span(span)

        duration_ms = duration_seconds * 1000.0
        self.metrics.record_tool_call(
            tool_name=tool_name,
            status="failure",
            duration_ms=duration_ms,
            is_timeout=is_timeout,
            task_id=task_id,
            trace_id=trace.trace_id if trace else None,
        )

        # Generate diagnostic
        if trace:
            if is_timeout:
                diag = self.diagnostics.diagnose_tool_timeout(
                    task_id=task_id,
                    trace_id=trace.trace_id,
                    tool_name=tool_name,
                    timeout_seconds=timeout_seconds or duration_seconds,
                    call_id=call_id,
                    span_id=span_id,
                )
            elif "ValidationError" in error or "InvalidToolInputError" in error:
                diag = self.diagnostics.diagnose_tool_validation(
                    task_id=task_id,
                    trace_id=trace.trace_id,
                    tool_name=tool_name,
                    error=error,
                    call_id=call_id,
                )
            else:
                diag = self.diagnostics.diagnose_tool_failure(
                    task_id=task_id,
                    trace_id=trace.trace_id,
                    tool_name=tool_name,
                    error=error,
                    call_id=call_id,
                    span_id=span_id,
                )
            if self.store is not None:
                await self.store.save_diagnostic(diag)

        self._task_invocations.setdefault(task_id, []).append(
            {
                "tool_name": tool_name,
                "arguments": arguments or {},
                "status": "failure",
                "duration_seconds": duration_seconds,
            }
        )
        self._tool_summaries.setdefault(task_id, []).append(
            {
                "tool_name": tool_name,
                "call_id": call_id,
                "step": step,
                "status": "failure",
                "duration_ms": duration_ms,
                "is_timeout": is_timeout,
                "error": error,
            }
        )

        return span

    async def on_policy_decision(
        self,
        task_id: str,
        tool_name: str,
        call_id: str | None,
        allowed: bool,
        reason: str,
        matched_rule: str | None = None,
    ) -> None:
        trace = self.tracer.get_trace_by_task(task_id)
        trace_id = trace.trace_id if trace else f"trace-{task_id}"

        self.metrics.record_policy_decision(
            tool_name=tool_name,
            allowed=allowed,
            reason=reason,
            task_id=task_id,
            trace_id=trace_id,
        )

        if not allowed:
            self.metrics.record_tool_rejected(
                tool_name=tool_name,
                reason=reason,
                task_id=task_id,
                trace_id=trace_id,
            )
            diag = self.diagnostics.diagnose_policy_denial(
                task_id=task_id,
                trace_id=trace_id,
                tool_name=tool_name,
                reason=reason,
                call_id=call_id,
            )
            if self.store is not None:
                await self.store.save_diagnostic(diag)

    async def on_budget_exceeded(
        self,
        task_id: str,
        limit_name: str,
        reason: str,
        snapshot: dict[str, Any],
        tool_name: str | None = None,
        call_id: str | None = None,
    ) -> None:
        trace = self.tracer.get_trace_by_task(task_id)
        trace_id = trace.trace_id if trace else f"trace-{task_id}"

        self.metrics.record_budget_snapshot(task_id, snapshot)
        diag = self.diagnostics.diagnose_budget_exceeded(
            task_id=task_id,
            trace_id=trace_id,
            limit_name=limit_name,
            reason=reason,
            snapshot=snapshot,
            tool_name=tool_name,
            call_id=call_id,
        )
        if self.store is not None:
            await self.store.save_diagnostic(diag)

    async def on_budget_updated(self, task_id: str, snapshot: dict[str, Any]) -> None:
        self.metrics.record_budget_snapshot(task_id, snapshot)

    async def on_recovery(
        self,
        task_id: str,
        success: bool,
        duration_ms: float,
        was_uncertain: bool = False,
        resumed: bool = False,
        reason: str | None = None,
        warnings: list[str] | None = None,
    ) -> None:
        trace = self.tracer.get_trace_by_task(task_id)
        trace_id = trace.trace_id if trace else f"trace-{task_id}"

        self.metrics.record_recovery_attempt(
            task_id=task_id,
            success=success,
            duration_ms=duration_ms,
            was_uncertain=was_uncertain,
            resumed=resumed,
            trace_id=trace_id,
        )

        if not success and reason:
            diag = self.diagnostics.diagnose_recovery_failure(
                task_id=task_id,
                trace_id=trace_id,
                reason=reason,
                warnings=warnings,
            )
            if self.store is not None:
                await self.store.save_diagnostic(diag)

    async def on_checkpoint_created(self, task_id: str, checkpoint_id: str, position: int) -> None:
        trace = self.tracer.get_trace_by_task(task_id)
        if trace:
            span = self.tracer.start_span(
                trace_id=trace.trace_id,
                operation_name="checkpoint_creation",
                span_type=SpanType.CHECKPOINT_CREATION,
                attributes={"checkpoint_id": checkpoint_id, "position": position},
            )
            self.tracer.end_span(span.span_id, status="completed")
            if self.store is not None:
                await self.store.save_span(span)

    def record_event_for_timeline(self, task_id: str, event: Any) -> None:
        self._task_events.setdefault(task_id, []).append(event)

    def _run_behavior_analysis(self, task_id: str, trace_id: str) -> None:
        invocations = self._task_invocations.get(task_id, [])
        signals = self.behavior.analyze_execution_history(invocations)
        for sig in signals:
            self.diagnostics.diagnose_behavior_signal(
                task_id=task_id,
                trace_id=trace_id,
                signal=sig,
            )

    # --- Query & Inspection APIs ---

    def get_trace(self, trace_id: str) -> Trace | None:
        return self.tracer.get_trace(trace_id)

    def get_trace_by_task(self, task_id: str) -> Trace | None:
        return self.tracer.get_trace_by_task(task_id)

    def get_spans(self, trace_id: str) -> list[Span]:
        return self.tracer.get_spans(trace_id)

    def get_timeline(self, task_id: str, events: list[Any] | None = None) -> list[TimelineEntry]:
        evts = events if events is not None else self._task_events.get(task_id, [])
        trace = self.tracer.get_trace_by_task(task_id)
        trace_id = trace.trace_id if trace else None
        spans = self.tracer.get_spans(trace_id) if trace_id else []
        return TimelineBuilder.build_from_events(
            task_id=task_id,
            events=evts,
            trace_id=trace_id,
            spans=spans,
        )

    def get_task_metrics(self) -> dict[str, Any]:
        return self.metrics.get_task_metrics_summary()

    def get_tool_metrics(self) -> dict[str, Any]:
        return self.metrics.get_tool_metrics_summary()

    def get_aggregate_metrics(self) -> dict[str, Any]:
        return self.metrics.get_aggregate_summary()

    def get_diagnostics(
        self,
        task_id: str | None = None,
        severity: DiagnosticSeverity | None = None,
        category: DiagnosticCategory | None = None,
    ) -> list[Diagnostic]:
        return self.diagnostics.get_diagnostics(
            task_id=task_id, severity=severity, category=category
        )

    def export_execution_report(
        self,
        task_id: str,
        events: list[Any] | None = None,
        include_sensitive: bool = False,
        error: str | None = None,
    ) -> ExecutionReport:
        trace = self.tracer.get_trace_by_task(task_id)
        if trace is None:
            # Fallback empty trace
            trace = Trace(
                trace_id=f"trace-{task_id}",
                task_id=task_id,
                start_time="",
                root_span_id="",
                status="unknown",
            )

        timeline = self.get_timeline(task_id, events)
        tool_summaries = self._tool_summaries.get(task_id, [])
        metrics_summary = self.metrics.get_aggregate_summary()
        budget_summary = self.metrics.get_budget_metrics_for_task(task_id)
        policy_summary = self.metrics.get_policy_metrics_summary()
        diagnostics = self.diagnostics.get_diagnostics(task_id=task_id)

        return ReportExporter.create_report(
            trace=trace,
            timeline=timeline,
            tool_summaries=tool_summaries,
            metrics=metrics_summary,
            budget_summary=budget_summary,
            policy_summary=policy_summary,
            diagnostics=diagnostics,
            recovery_summary=self.metrics.get_recovery_metrics_summary(),
            error=error,
            include_sensitive=include_sensitive,
        )
