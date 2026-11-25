from __future__ import annotations

from forgeguard.observability.behavior import (
    BehaviorConfig,
    BehaviorDetector,
    fingerprint_arguments,
)
from forgeguard.observability.diagnostics import DiagnosticsEngine
from forgeguard.observability.models import (
    DiagnosticCategory,
    DiagnosticSeverity,
)


def test_diagnostics_engine_codes_and_categories() -> None:
    engine = DiagnosticsEngine()

    d_pol = engine.diagnose_policy_denial("t1", "tr1", "bash", "Denied by default")
    assert d_pol.code == "FG-POLICY-001"
    assert d_pol.category == DiagnosticCategory.POLICY
    assert d_pol.severity == DiagnosticSeverity.ERROR
    assert "Grant explicit authorization" in (d_pol.suggested_action or "")

    d_bgt1 = engine.diagnose_budget_exceeded("t1", "tr1", "max_tool_calls", "Limit 5 reached")
    assert d_bgt1.code == "FG-BUDGET-001"
    assert d_bgt1.category == DiagnosticCategory.BUDGET

    d_bgt2 = engine.diagnose_budget_exceeded("t1", "tr1", "max_output_bytes", "Byte limit reached")
    assert d_bgt2.code == "FG-BUDGET-002"

    d_bgt3 = engine.diagnose_budget_exceeded(
        "t1", "tr1", "max_consecutive_failures", "Failure limit reached"
    )
    assert d_bgt3.code == "FG-BUDGET-003"

    d_to_task = engine.diagnose_budget_exceeded(
        "t1", "tr1", "max_execution_seconds", "Task deadline expired"
    )
    assert d_to_task.code == "FG-TIMEOUT-002"
    assert d_to_task.category == DiagnosticCategory.TIMEOUT

    d_to_tool = engine.diagnose_tool_timeout("t1", "tr1", "web_search", 10.0)
    assert d_to_tool.code == "FG-TIMEOUT-001"
    assert d_to_tool.category == DiagnosticCategory.TIMEOUT

    d_fail = engine.diagnose_tool_failure("t1", "tr1", "scraper", "Connection refused")
    assert d_fail.code == "FG-TOOL-001"
    assert d_fail.category == DiagnosticCategory.TOOL

    d_val = engine.diagnose_tool_validation("t1", "tr1", "calc", "Missing required field 'x'")
    assert d_val.code == "FG-TOOL-003"
    assert d_val.category == DiagnosticCategory.VALIDATION

    d_unk = engine.diagnose_unknown_tool("t1", "tr1", "unregistered_tool")
    assert d_unk.code == "FG-TOOL-002"

    d_rec = engine.diagnose_recovery_failure("t1", "tr1", "Tool call in uncertain state")
    assert d_rec.code == "FG-RECOVERY-001"
    assert d_rec.severity == DiagnosticSeverity.CRITICAL
    assert d_rec.category == DiagnosticCategory.RECOVERY

    d_idem = engine.diagnose_idempotency_conflict("t1", "tr1", "call-1", "order_item")
    assert d_idem.code == "FG-IDEMPOTENCY-001"

    d_can = engine.diagnose_cancellation("t1", "tr1")
    assert d_can.code == "FG-CANCEL-001"
    assert d_can.severity == DiagnosticSeverity.INFO


def test_argument_fingerprinting() -> None:
    fp1 = fingerprint_arguments({"a": 1, "b": "secret_password"})
    fp2 = fingerprint_arguments({"b": "secret_password", "a": 1})
    fp3 = fingerprint_arguments({"a": 2, "b": "secret_password"})

    # Key order independent
    assert fp1 == fp2
    # Different inputs yield different hashes
    assert fp1 != fp3
    # Safe 16-hex length
    assert len(fp1) == 16


def test_behavior_detection_repeated_calls() -> None:
    detector = BehaviorDetector(BehaviorConfig(max_repeated_tool_calls=3))
    invocations = [
        {
            "tool_name": "search",
            "arguments": {"q": "1"},
            "status": "success",
            "duration_seconds": 1.0,
        },
        {
            "tool_name": "search",
            "arguments": {"q": "2"},
            "status": "success",
            "duration_seconds": 1.0,
        },
        {
            "tool_name": "search",
            "arguments": {"q": "3"},
            "status": "success",
            "duration_seconds": 1.0,
        },
    ]
    signals = detector.analyze_execution_history(invocations)
    repeated_signals = [s for s in signals if s.pattern_type == "repeated_calls"]
    assert len(repeated_signals) == 1
    assert repeated_signals[0].code == "FG-LOOP-001"
    assert repeated_signals[0].tool_name == "search"
    assert repeated_signals[0].evidence["consecutive_count"] == 3


def test_behavior_detection_repeated_identical_arguments() -> None:
    detector = BehaviorDetector(BehaviorConfig(max_identical_arguments=2))
    invocations = [
        {
            "tool_name": "query_db",
            "arguments": {"table": "users"},
            "status": "success",
            "duration_seconds": 0.5,
        },
        {
            "tool_name": "read_file",
            "arguments": {"path": "test.txt"},
            "status": "success",
            "duration_seconds": 0.5,
        },
        {
            "tool_name": "query_db",
            "arguments": {"table": "users"},
            "status": "success",
            "duration_seconds": 0.5,
        },
    ]
    signals = detector.analyze_execution_history(invocations)
    arg_signals = [s for s in signals if s.pattern_type == "repeated_arguments"]
    assert len(arg_signals) == 1
    assert arg_signals[0].code == "FG-LOOP-002"
    assert arg_signals[0].tool_name == "query_db"


def test_behavior_detection_repeated_failures() -> None:
    detector = BehaviorDetector(BehaviorConfig(max_repeated_tool_failures=2))
    invocations = [
        {"tool_name": "api_call", "arguments": {}, "status": "failure", "duration_seconds": 1.0},
        {"tool_name": "api_call", "arguments": {}, "status": "failure", "duration_seconds": 1.0},
    ]
    signals = detector.analyze_execution_history(invocations)
    fail_signals = [s for s in signals if s.pattern_type == "repeated_failures"]
    assert len(fail_signals) == 1
    assert fail_signals[0].code == "FG-LOOP-003"


def test_behavior_detection_long_duration_warning() -> None:
    detector = BehaviorDetector(BehaviorConfig(duration_warning_threshold_seconds=5.0))
    invocations = [
        {"tool_name": "slow_job", "arguments": {}, "status": "success", "duration_seconds": 12.5},
    ]
    signals = detector.analyze_execution_history(invocations)
    perf_signals = [s for s in signals if s.pattern_type == "long_duration"]
    assert len(perf_signals) == 1
    assert perf_signals[0].code == "FG-PERF-001"
    assert perf_signals[0].evidence["duration_seconds"] == 12.5
