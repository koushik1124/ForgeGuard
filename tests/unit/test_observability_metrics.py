from __future__ import annotations

from forgeguard.observability.metrics import (
    LatencySummary,
    MetricsCollector,
    calculate_percentile,
)


def test_percentile_calculation() -> None:
    assert calculate_percentile([], 50.0) == 0.0
    assert calculate_percentile([42.0], 50.0) == 42.0
    assert calculate_percentile([42.0], 95.0) == 42.0

    # 1 to 10
    values = [float(i) for i in range(1, 11)]
    p50 = calculate_percentile(values, 50.0)
    p95 = calculate_percentile(values, 95.0)
    assert 5.0 <= p50 <= 6.0
    assert 9.0 <= p95 <= 10.0


def test_latency_summary_edge_cases() -> None:
    empty_lat = LatencySummary.from_durations([])
    assert empty_lat.count == 0
    assert empty_lat.avg_ms == 0.0
    assert empty_lat.p50_ms == 0.0

    single_lat = LatencySummary.from_durations([100.0])
    assert single_lat.count == 1
    assert single_lat.avg_ms == 100.0
    assert single_lat.min_ms == 100.0
    assert single_lat.max_ms == 100.0
    assert single_lat.p50_ms == 100.0
    assert single_lat.p95_ms == 100.0

    zero_lat = LatencySummary.from_durations([0.0, 0.0])
    assert zero_lat.avg_ms == 0.0
    assert zero_lat.max_ms == 0.0


def test_metrics_collector_tasks() -> None:
    collector = MetricsCollector()
    collector.record_task_started("t1")
    collector.record_task_started("t2")
    assert collector.get_task_metrics_summary()["active_tasks"] == 2

    collector.record_task_completed("t1", duration_ms=120.0)
    collector.record_task_failed("t2", duration_ms=80.0, error_type="ValueError")

    summary = collector.get_task_metrics_summary()
    assert summary["total_tasks"] == 2
    assert summary["completed_tasks"] == 1
    assert summary["failed_tasks"] == 1
    assert summary["active_tasks"] == 0
    assert summary["success_rate"] == 0.5
    assert summary["failure_rate"] == 0.5
    assert summary["latency"]["count"] == 2
    assert summary["latency"]["avg_ms"] == 100.0
    assert summary["latency"]["min_ms"] == 80.0
    assert summary["latency"]["max_ms"] == 120.0


def test_metrics_collector_tools() -> None:
    collector = MetricsCollector()
    collector.record_tool_call("calc", "success", duration_ms=10.0)
    collector.record_tool_call("calc", "success", duration_ms=20.0)
    collector.record_tool_call("calc", "failure", duration_ms=30.0, is_timeout=True)
    collector.record_tool_call("search", "success", duration_ms=50.0)
    collector.record_tool_rejected("bash", reason="Policy deny")

    summary = collector.get_tool_metrics_summary()
    assert summary["total_tool_calls"] == 4
    assert summary["successful_tool_calls"] == 3
    assert summary["failed_tool_calls"] == 1
    assert summary["timed_out_tool_calls"] == 1
    assert summary["rejected_tool_calls"] == 1

    per_tool = summary["per_tool"]
    assert "calc" in per_tool
    assert per_tool["calc"]["invocations"] == 3
    assert per_tool["calc"]["successes"] == 2
    assert per_tool["calc"]["failures"] == 1
    assert per_tool["calc"]["timeouts"] == 1

    assert "search" in per_tool
    assert per_tool["search"]["invocations"] == 1


def test_metrics_collector_policy_and_recovery() -> None:
    collector = MetricsCollector()
    collector.record_policy_decision("tool_a", allowed=True, reason="Rule match")
    collector.record_policy_decision("tool_b", allowed=False, reason="Default deny")
    collector.record_policy_decision("tool_b", allowed=False, reason="Default deny")

    pol = collector.get_policy_metrics_summary()
    assert pol["total_decisions"] == 3
    assert pol["allowed_decisions"] == 1
    assert pol["denied_decisions"] == 2
    assert pol["denial_rate"] == round(2 / 3, 4)
    assert pol["denial_reasons"]["Default deny"] == 2

    collector.record_recovery_attempt(task_id="t-rec", success=True, duration_ms=15.0, resumed=True)
    rec = collector.get_recovery_metrics_summary()
    assert rec["recovery_attempts"] == 1
    assert rec["successful_recoveries"] == 1
    assert rec["resumed_tasks_count"] == 1
    assert rec["latency"]["avg_ms"] == 15.0


def test_metrics_collector_budget_snapshots() -> None:
    collector = MetricsCollector()
    collector.record_budget_snapshot(
        "t-budget",
        {
            "consumed_tool_calls": 3,
            "remaining_tool_calls": 2,
            "cumulative_output_bytes": 1024,
        },
    )
    snap = collector.get_budget_metrics_for_task("t-budget")
    assert snap["consumed_tool_calls"] == 3
    assert snap["remaining_tool_calls"] == 2
