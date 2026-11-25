from __future__ import annotations

import asyncio
import logging
import time
from uuid import uuid4

from forgeguard.evaluation.models import (
    BenchmarkResult,
    EvaluationStatus,
    ExperimentConfig,
    ExperimentReport,
    ScenarioResult,
)
from forgeguard.evaluation.scenarios import (
    ALL_SCENARIO_CLASSES,
    BaseScenario,
    PerformanceBenchmarkScenario,
    get_scenario_by_id,
    get_scenarios_for_suite,
)
from forgeguard.persistence.repository import utc_iso_now

logger = logging.getLogger("forgeguard.evaluation.runner")


class EvaluationRunner:
    """Executes evaluation experiments with isolation, timeouts, and metrics collection."""

    def __init__(self, config: ExperimentConfig | None = None) -> None:
        self.config = config or ExperimentConfig(experiment_id=f"exp_{uuid4().hex[:8]}")

    async def run_scenario(self, scenario: BaseScenario) -> ScenarioResult:
        """Run an individual scenario."""
        logger.info("Executing scenario '%s' (%s)", scenario.name, scenario.scenario_id)
        try:
            return await asyncio.wait_for(
                scenario.run(experiment_id=self.config.experiment_id),
                timeout=self.config.timeout_seconds,
            )
        except asyncio.TimeoutError:
            return ScenarioResult(
                experiment_id=self.config.experiment_id,
                scenario_id=scenario.scenario_id,
                name=scenario.name,
                category=scenario.category,
                severity=scenario.severity,
                status=EvaluationStatus.ERROR,
                start_time=utc_iso_now(),
                end_time=utc_iso_now(),
                duration_ms=self.config.timeout_seconds * 1000.0,
                failure_reason=f"Scenario timed out after {self.config.timeout_seconds}s.",
            )

    async def run_suite(self, suite_name: str) -> ExperimentReport:
        """Run all scenarios in a designated test suite."""
        scenarios = get_scenarios_for_suite(suite_name)
        return await self.run_experiment(scenarios)

    async def run_experiment(
        self,
        scenarios: list[BaseScenario] | None = None,
    ) -> ExperimentReport:
        """Execute a full evaluation experiment across multiple scenarios."""
        target_scenarios: list[BaseScenario] = []

        if scenarios is not None:
            target_scenarios = list(scenarios)
        elif self.config.scenario_ids:
            for s_id in self.config.scenario_ids:
                sc = get_scenario_by_id(s_id)
                if sc:
                    target_scenarios.append(sc)
        elif self.config.categories:
            for cls in ALL_SCENARIO_CLASSES:
                instance = cls()
                if instance.category in self.config.categories:
                    target_scenarios.append(instance)
        else:
            # Run all standard scenarios
            target_scenarios = [cls() for cls in ALL_SCENARIO_CLASSES]

        start_time_iso = utc_iso_now()
        start_mono = time.monotonic()

        scenario_results: list[ScenarioResult] = []
        benchmarks: list[BenchmarkResult] = []

        passed = 0
        failed = 0
        errors = 0
        skipped = 0

        for scenario in target_scenarios:
            result = await self.run_scenario(scenario)
            scenario_results.append(result)

            if result.status == EvaluationStatus.PASS:
                passed += 1
            elif result.status == EvaluationStatus.FAIL:
                failed += 1
            elif result.status == EvaluationStatus.ERROR:
                errors += 1
            elif result.status == EvaluationStatus.SKIPPED:
                skipped += 1

            # Extract benchmark statistics if this was a benchmark scenario
            if isinstance(scenario, PerformanceBenchmarkScenario):
                benchmarks.extend(scenario.benchmark_results)

        total_duration_ms = max(0.0, (time.monotonic() - start_mono) * 1000.0)

        overall_status = EvaluationStatus.PASS
        if errors > 0:
            overall_status = EvaluationStatus.ERROR
        elif failed > 0:
            overall_status = EvaluationStatus.FAIL

        total_scenarios = len(scenario_results)
        pass_rate = round((passed / total_scenarios * 100.0), 2) if total_scenarios > 0 else 0.0

        summary_metrics = {
            "pass_rate_pct": pass_rate,
            "total_assertions": sum(len(s.assertions) for s in scenario_results),
            "assertions_passed": sum(s.assertions_passed for s in scenario_results),
            "assertions_failed": sum(s.assertions_failed for s in scenario_results),
        }

        return ExperimentReport(
            experiment_id=self.config.experiment_id,
            name=self.config.name,
            timestamp=start_time_iso,
            duration_ms=total_duration_ms,
            total_scenarios=total_scenarios,
            passed=passed,
            failed=failed,
            errors=errors,
            skipped=skipped,
            overall_status=overall_status,
            scenario_results=scenario_results,
            benchmarks=benchmarks,
            summary_metrics=summary_metrics,
        )
