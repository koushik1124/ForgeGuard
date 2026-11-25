from __future__ import annotations

from pathlib import Path

import pytest

from forgeguard.evaluation.assertions import AssertionRecorder
from forgeguard.evaluation.faults import FaultInjector, FaultPoint, FaultType
from forgeguard.evaluation.models import (
    EvaluationStatus,
    ExperimentConfig,
)
from forgeguard.evaluation.reporting import ReportGenerator
from forgeguard.evaluation.runner import EvaluationRunner
from forgeguard.evaluation.scenarios import (
    PerformanceBenchmarkScenario,
    RecoveryAfterCheckpointScenario,
    ReliabilitySuccessScenario,
    SecurityUnauthorizedToolScenario,
)
from forgeguard.evaluation.scenarios.benchmarks import compute_statistics
from forgeguard.tools.tool import Tool


def test_assertion_recorder() -> None:
    recorder = AssertionRecorder()
    assert len(recorder.assertions) == 0

    a1 = recorder.record("test_pass", True, expected=1, actual=1)
    assert a1.passed is True

    a2 = recorder.record("test_fail", False, expected=1, actual=2, message="Mismatch")
    assert a2.passed is False

    assert recorder.all_passed is False
    assert len(recorder.failure_messages) == 1
    assert "Mismatch" in recorder.failure_messages[0]


def test_fault_injector_tool_wrapping() -> None:
    injector = FaultInjector()
    tool = Tool(
        name="test_tool",
        description="Demo",
        handler=lambda x: x * 2,
    )
    wrapped = injector.wrap_tool(tool)

    # Without faults: normal execution
    res = wrapped.handler(10)
    assert res == 20

    # Inject exception
    injector.add_fault(
        FaultPoint(
            fault_type=FaultType.TOOL_EXCEPTION,
            target_name="test_tool",
            parameters={"message": "Injected crash"},
        )
    )

    with pytest.raises(RuntimeError, match="Injected crash"):
        wrapped.handler(10)

    # Cleanup
    injector.clear()
    assert wrapped.handler(5) == 10


def test_compute_statistics() -> None:
    durations = [10.0, 12.0, 14.0, 16.0, 20.0]
    stats = compute_statistics(
        durations,
        benchmark_id="bm_test",
        name="Test BM",
        workload_type="Test",
        baseline_mean_ms=10.0,
    )

    assert stats.sample_count == 5
    assert stats.mean_ms == 14.4
    assert stats.median_ms == 14.0
    assert stats.min_ms == 10.0
    assert stats.max_ms == 20.0
    assert stats.relative_overhead_pct == 44.0


@pytest.mark.asyncio
async def test_runner_executes_single_scenario() -> None:
    runner = EvaluationRunner()
    scenario = ReliabilitySuccessScenario()
    result = await runner.run_scenario(scenario)

    assert result.status == EvaluationStatus.PASS
    assert result.scenario_id == "rel_01_success"
    assert result.assertions_passed > 0
    assert result.assertions_failed == 0


@pytest.mark.asyncio
async def test_runner_executes_security_scenario() -> None:
    runner = EvaluationRunner()
    scenario = SecurityUnauthorizedToolScenario()
    result = await runner.run_scenario(scenario)

    assert result.status == EvaluationStatus.PASS
    assert result.scenario_id == "sec_01_unauthorized_tool"


@pytest.mark.asyncio
async def test_runner_executes_recovery_scenario() -> None:
    runner = EvaluationRunner()
    scenario = RecoveryAfterCheckpointScenario()
    result = await runner.run_scenario(scenario)

    assert result.status == EvaluationStatus.PASS
    assert result.scenario_id == "rec_01_checkpoint_resume"


@pytest.mark.asyncio
async def test_runner_suite_execution_and_reporting(tmp_path: Path) -> None:
    config = ExperimentConfig(experiment_id="exp_test_suite", name="Test Suite Run")
    runner = EvaluationRunner(config)

    # Run reliability suite
    report = await runner.run_suite("reliability")

    assert report.total_scenarios == 6
    assert report.passed == 6
    assert report.failed == 0
    assert report.errors == 0
    assert report.overall_status == EvaluationStatus.PASS

    # Test JSON and Markdown report export
    json_path, md_path = ReportGenerator.export(report, tmp_path)
    assert json_path.exists()
    assert md_path.exists()

    md_content = md_path.read_text(encoding="utf-8")
    assert "ForgeGuard Evaluation Report" in md_content
    assert "rel_01_success" in md_content


@pytest.mark.asyncio
async def test_runner_benchmark_execution() -> None:
    runner = EvaluationRunner()
    scenario = PerformanceBenchmarkScenario(iterations=5)
    result = await runner.run_scenario(scenario)

    assert result.status == EvaluationStatus.PASS
    assert len(scenario.benchmark_results) >= 5
    baseline = next(b for b in scenario.benchmark_results if b.benchmark_id == "bm_baseline_direct")
    assert baseline.mean_ms >= 0
