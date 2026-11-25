from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from forgeguard.observability.models import MetricRecord, MetricType


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def calculate_percentile(values: list[float], p: float) -> float:
    """Calculate percentile p (0-100) using linear interpolation."""
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c < len(sorted_v):
        return float(sorted_v[f] + (k - f) * (sorted_v[c] - sorted_v[f]))
    return float(sorted_v[f])


@dataclass
class LatencySummary:
    count: int = 0
    avg_ms: float = 0.0
    min_ms: float = 0.0
    max_ms: float = 0.0
    p50_ms: float = 0.0
    p95_ms: float = 0.0

    @classmethod
    def from_durations(cls, durations: list[float]) -> LatencySummary:
        if not durations:
            return cls()
        return cls(
            count=len(durations),
            avg_ms=round(sum(durations) / len(durations), 3),
            min_ms=round(min(durations), 3),
            max_ms=round(max(durations), 3),
            p50_ms=round(calculate_percentile(durations, 50.0), 3),
            p95_ms=round(calculate_percentile(durations, 95.0), 3),
        )


@dataclass
class PerToolMetric:
    tool_name: str
    invocations: int = 0
    successes: int = 0
    failures: int = 0
    timeouts: int = 0
    durations_ms: list[float] = field(default_factory=list)

    @property
    def latency(self) -> LatencySummary:
        return LatencySummary.from_durations(self.durations_ms)

    @property
    def success_rate(self) -> float:
        return (self.successes / self.invocations) if self.invocations > 0 else 0.0

    @property
    def failure_rate(self) -> float:
        return (self.failures / self.invocations) if self.invocations > 0 else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "invocations": self.invocations,
            "successes": self.successes,
            "failures": self.failures,
            "timeouts": self.timeouts,
            "success_rate": round(self.success_rate, 4),
            "failure_rate": round(self.failure_rate, 4),
            "latency": asdict(self.latency),
        }


class MetricsCollector:
    def __init__(self) -> None:
        self._raw_metrics: list[MetricRecord] = []

        # Task metrics
        self._total_tasks = 0
        self._completed_tasks = 0
        self._failed_tasks = 0
        self._cancelled_tasks = 0
        self._active_tasks = 0
        self._task_durations_ms: list[float] = []

        # Tool metrics
        self._total_tool_calls = 0
        self._successful_tool_calls = 0
        self._failed_tool_calls = 0
        self._timed_out_tool_calls = 0
        self._rejected_tool_calls = 0
        self._tool_durations_ms: list[float] = []
        self._per_tool: dict[str, PerToolMetric] = {}

        # Policy metrics
        self._total_policy_decisions = 0
        self._allowed_policy_decisions = 0
        self._denied_policy_decisions = 0
        self._policy_decisions_by_tool: dict[str, dict[str, int]] = {}
        self._policy_denial_reasons: dict[str, int] = {}

        # Recovery metrics
        self._recovery_attempts = 0
        self._successful_recoveries = 0
        self._failed_recoveries = 0
        self._uncertain_tasks_count = 0
        self._resumed_tasks_count = 0
        self._recovery_durations_ms: list[float] = []

        # Budget snapshots per task
        self._task_budget_snapshots: dict[str, dict[str, Any]] = {}

    def record_counter(
        self,
        name: str,
        value: float = 1.0,
        unit: str = "count",
        labels: dict[str, str] | None = None,
        task_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._raw_metrics.append(
            MetricRecord(
                metric_name=name,
                metric_type=MetricType.COUNTER,
                value=value,
                timestamp=_utc_iso_now(),
                unit=unit,
                labels=labels or {},
                task_id=task_id,
                trace_id=trace_id,
            )
        )

    def record_gauge(
        self,
        name: str,
        value: float,
        unit: str = "",
        labels: dict[str, str] | None = None,
        task_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._raw_metrics.append(
            MetricRecord(
                metric_name=name,
                metric_type=MetricType.GAUGE,
                value=value,
                timestamp=_utc_iso_now(),
                unit=unit,
                labels=labels or {},
                task_id=task_id,
                trace_id=trace_id,
            )
        )

    def record_histogram(
        self,
        name: str,
        value: float,
        unit: str = "ms",
        labels: dict[str, str] | None = None,
        task_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._raw_metrics.append(
            MetricRecord(
                metric_name=name,
                metric_type=MetricType.HISTOGRAM,
                value=value,
                timestamp=_utc_iso_now(),
                unit=unit,
                labels=labels or {},
                task_id=task_id,
                trace_id=trace_id,
            )
        )

    # High-level tracking hooks
    def record_task_started(self, task_id: str, trace_id: str | None = None) -> None:
        self._total_tasks += 1
        self._active_tasks += 1
        self.record_counter("tasks_started_total", 1.0, task_id=task_id, trace_id=trace_id)

    def record_task_completed(
        self, task_id: str, duration_ms: float, trace_id: str | None = None
    ) -> None:
        if self._active_tasks > 0:
            self._active_tasks -= 1
        self._completed_tasks += 1
        self._task_durations_ms.append(duration_ms)
        self.record_counter("tasks_completed_total", 1.0, task_id=task_id, trace_id=trace_id)
        self.record_histogram("task_duration_ms", duration_ms, task_id=task_id, trace_id=trace_id)

    def record_task_failed(
        self,
        task_id: str,
        duration_ms: float,
        error_type: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        if self._active_tasks > 0:
            self._active_tasks -= 1
        self._failed_tasks += 1
        self._task_durations_ms.append(duration_ms)
        labels = {"error_type": error_type} if error_type else {}
        self.record_counter(
            "tasks_failed_total", 1.0, labels=labels, task_id=task_id, trace_id=trace_id
        )
        self.record_histogram(
            "task_duration_ms", duration_ms, labels=labels, task_id=task_id, trace_id=trace_id
        )

    def record_task_cancelled(
        self, task_id: str, duration_ms: float, trace_id: str | None = None
    ) -> None:
        if self._active_tasks > 0:
            self._active_tasks -= 1
        self._cancelled_tasks += 1
        self._task_durations_ms.append(duration_ms)
        self.record_counter("tasks_cancelled_total", 1.0, task_id=task_id, trace_id=trace_id)

    def record_tool_call(
        self,
        tool_name: str,
        status: str,
        duration_ms: float,
        is_timeout: bool = False,
        task_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._total_tool_calls += 1
        self._tool_durations_ms.append(duration_ms)

        if tool_name not in self._per_tool:
            self._per_tool[tool_name] = PerToolMetric(tool_name=tool_name)
        tool_metric = self._per_tool[tool_name]
        tool_metric.invocations += 1
        tool_metric.durations_ms.append(duration_ms)

        if status == "success":
            self._successful_tool_calls += 1
            tool_metric.successes += 1
        elif status == "failure":
            self._failed_tool_calls += 1
            tool_metric.failures += 1
            if is_timeout:
                self._timed_out_tool_calls += 1
                tool_metric.timeouts += 1

        labels = {"tool": tool_name, "status": status}
        self.record_counter(
            "tool_calls_total", 1.0, labels=labels, task_id=task_id, trace_id=trace_id
        )
        self.record_histogram(
            "tool_call_duration_ms",
            duration_ms,
            labels=labels,
            task_id=task_id,
            trace_id=trace_id,
        )

    def record_tool_rejected(
        self,
        tool_name: str,
        reason: str,
        task_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._rejected_tool_calls += 1
        labels = {"tool": tool_name}
        self.record_counter(
            "tool_calls_rejected_total", 1.0, labels=labels, task_id=task_id, trace_id=trace_id
        )

    def record_policy_decision(
        self,
        tool_name: str,
        allowed: bool,
        reason: str,
        task_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._total_policy_decisions += 1
        if allowed:
            self._allowed_policy_decisions += 1
        else:
            self._denied_policy_decisions += 1
            self._policy_denial_reasons[reason] = self._policy_denial_reasons.get(reason, 0) + 1

        tool_stats = self._policy_decisions_by_tool.setdefault(
            tool_name, {"allowed": 0, "denied": 0}
        )
        if allowed:
            tool_stats["allowed"] += 1
        else:
            tool_stats["denied"] += 1

        labels = {"tool": tool_name, "decision": "allowed" if allowed else "denied"}
        self.record_counter(
            "policy_decisions_total", 1.0, labels=labels, task_id=task_id, trace_id=trace_id
        )

    def record_recovery_attempt(
        self,
        task_id: str,
        success: bool,
        duration_ms: float,
        was_uncertain: bool = False,
        resumed: bool = False,
        trace_id: str | None = None,
    ) -> None:
        self._recovery_attempts += 1
        self._recovery_durations_ms.append(duration_ms)
        if success:
            self._successful_recoveries += 1
        else:
            self._failed_recoveries += 1
        if was_uncertain:
            self._uncertain_tasks_count += 1
        if resumed:
            self._resumed_tasks_count += 1

        labels = {"success": str(success)}
        self.record_counter(
            "recovery_attempts_total", 1.0, labels=labels, task_id=task_id, trace_id=trace_id
        )
        self.record_histogram(
            "recovery_duration_ms", duration_ms, labels=labels, task_id=task_id, trace_id=trace_id
        )

    def record_budget_snapshot(self, task_id: str, snapshot: dict[str, Any]) -> None:
        self._task_budget_snapshots[task_id] = dict(snapshot)

    # Summaries and aggregates
    def get_task_metrics_summary(self) -> dict[str, Any]:
        success_rate = (self._completed_tasks / self._total_tasks) if self._total_tasks > 0 else 0.0
        failure_rate = (self._failed_tasks / self._total_tasks) if self._total_tasks > 0 else 0.0
        return {
            "total_tasks": self._total_tasks,
            "completed_tasks": self._completed_tasks,
            "failed_tasks": self._failed_tasks,
            "cancelled_tasks": self._cancelled_tasks,
            "active_tasks": self._active_tasks,
            "success_rate": round(success_rate, 4),
            "failure_rate": round(failure_rate, 4),
            "latency": asdict(LatencySummary.from_durations(self._task_durations_ms)),
        }

    def get_tool_metrics_summary(self) -> dict[str, Any]:
        success_rate = (
            (self._successful_tool_calls / self._total_tool_calls)
            if self._total_tool_calls > 0
            else 0.0
        )
        failure_rate = (
            (self._failed_tool_calls / self._total_tool_calls)
            if self._total_tool_calls > 0
            else 0.0
        )
        return {
            "total_tool_calls": self._total_tool_calls,
            "successful_tool_calls": self._successful_tool_calls,
            "failed_tool_calls": self._failed_tool_calls,
            "timed_out_tool_calls": self._timed_out_tool_calls,
            "rejected_tool_calls": self._rejected_tool_calls,
            "success_rate": round(success_rate, 4),
            "failure_rate": round(failure_rate, 4),
            "latency": asdict(LatencySummary.from_durations(self._tool_durations_ms)),
            "per_tool": {k: v.to_dict() for k, v in self._per_tool.items()},
        }

    def get_policy_metrics_summary(self) -> dict[str, Any]:
        denial_rate = (
            (self._denied_policy_decisions / self._total_policy_decisions)
            if self._total_policy_decisions > 0
            else 0.0
        )
        return {
            "total_decisions": self._total_policy_decisions,
            "allowed_decisions": self._allowed_policy_decisions,
            "denied_decisions": self._denied_policy_decisions,
            "denial_rate": round(denial_rate, 4),
            "decisions_by_tool": self._policy_decisions_by_tool,
            "denial_reasons": self._policy_denial_reasons,
        }

    def get_recovery_metrics_summary(self) -> dict[str, Any]:
        return {
            "recovery_attempts": self._recovery_attempts,
            "successful_recoveries": self._successful_recoveries,
            "failed_recoveries": self._failed_recoveries,
            "uncertain_tasks_count": self._uncertain_tasks_count,
            "resumed_tasks_count": self._resumed_tasks_count,
            "latency": asdict(LatencySummary.from_durations(self._recovery_durations_ms)),
        }

    def get_budget_metrics_for_task(self, task_id: str) -> dict[str, Any]:
        return self._task_budget_snapshots.get(task_id, {})

    def get_aggregate_summary(self) -> dict[str, Any]:
        return {
            "tasks": self.get_task_metrics_summary(),
            "tools": self.get_tool_metrics_summary(),
            "policy": self.get_policy_metrics_summary(),
            "recovery": self.get_recovery_metrics_summary(),
        }

    def get_raw_metrics(
        self,
        task_id: str | None = None,
        trace_id: str | None = None,
        metric_name: str | None = None,
    ) -> list[MetricRecord]:
        res = self._raw_metrics
        if task_id:
            res = [m for m in res if m.task_id == task_id]
        if trace_id:
            res = [m for m in res if m.trace_id == trace_id]
        if metric_name:
            res = [m for m in res if m.metric_name == metric_name]
        return res
