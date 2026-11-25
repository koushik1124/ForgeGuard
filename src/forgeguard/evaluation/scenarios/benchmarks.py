from __future__ import annotations

import math
import statistics
import time

from forgeguard.agent.tools.calculator import create_calculator_tool
from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.core.task import Task
from forgeguard.evaluation.models import BenchmarkResult, ScenarioCategory, ScenarioSeverity
from forgeguard.evaluation.scenarios.base import BaseScenario, ScenarioEnvironment
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.persistence.recovery import RecoveryEngine
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry


def compute_statistics(
    durations_ms: list[float],
    benchmark_id: str,
    name: str,
    workload_type: str,
    baseline_mean_ms: float | None = None,
    baseline_name: str | None = None,
) -> BenchmarkResult:
    """Compute standard statistical metrics across execution durations."""
    if not durations_ms:
        return BenchmarkResult(
            benchmark_id=benchmark_id,
            name=name,
            workload_type=workload_type,
            sample_count=0,
            mean_ms=0.0,
            median_ms=0.0,
            p95_ms=0.0,
            min_ms=0.0,
            max_ms=0.0,
            std_dev_ms=0.0,
        )

    sorted_ms = sorted(durations_ms)
    count = len(sorted_ms)
    mean_val = statistics.mean(sorted_ms)
    median_val = statistics.median(sorted_ms)

    # P95 calculation
    p95_idx = int(math.ceil(0.95 * count)) - 1
    p95_val = sorted_ms[min(p95_idx, count - 1)]

    min_val = sorted_ms[0]
    max_val = sorted_ms[-1]
    std_dev = statistics.stdev(sorted_ms) if count > 1 else 0.0

    rel_overhead: float | None = None
    if baseline_mean_ms is not None and baseline_mean_ms > 0:
        rel_overhead = round(((mean_val - baseline_mean_ms) / baseline_mean_ms) * 100.0, 2)

    return BenchmarkResult(
        benchmark_id=benchmark_id,
        name=name,
        workload_type=workload_type,
        sample_count=count,
        mean_ms=round(mean_val, 4),
        median_ms=round(median_val, 4),
        p95_ms=round(p95_val, 4),
        min_ms=round(min_val, 4),
        max_ms=round(max_val, 4),
        std_dev_ms=round(std_dev, 4),
        relative_overhead_pct=rel_overhead,
        baseline_name=baseline_name,
    )


class PerformanceBenchmarkScenario(BaseScenario):
    """Executes comparative performance benchmarks measuring ForgeGuard runtime overhead."""

    scenario_id = "bench_01_runtime_overhead"
    name = "ForgeGuard Runtime Overhead Benchmarks"
    category = ScenarioCategory.BENCHMARK
    severity = ScenarioSeverity.MEDIUM
    description = (
        "Measure latency and relative overhead across direct tool calls, "
        "policy, budgets, persistence, and observability."
    )
    tags = ["performance", "benchmark", "baseline"]

    def __init__(self, iterations: int = 30) -> None:
        self.iterations = iterations
        self.benchmark_results: list[BenchmarkResult] = []

    async def execute(self, env: ScenarioEnvironment) -> None:
        calc_tool = create_calculator_tool()
        arguments = {"expression": "25 * 4 + 50"}

        # ---------------- 1. Baseline: Direct Tool Handler ---------------- #
        baseline_times: list[float] = []
        # Warmup
        for _ in range(5):
            calc_tool.handler(**arguments)

        for _ in range(self.iterations):
            t0 = time.perf_counter()
            calc_tool.handler(**arguments)
            baseline_times.append((time.perf_counter() - t0) * 1000.0)

        bm_baseline = compute_statistics(
            baseline_times,
            benchmark_id="bm_baseline_direct",
            name="Raw Tool Direct Execution",
            workload_type="Direct Python Call (Zero Governance)",
        )
        self.benchmark_results.append(bm_baseline)
        base_mean = bm_baseline.mean_ms

        # ---------------- 2. Policy-Only Governance ---------------- #
        registry = ToolRegistry()
        registry.register(calc_tool)
        policy_engine = PolicyEngine(Policy(allowed_tools=frozenset({"calculator"})))
        engine_policy = ExecutionEngine(registry=registry, policy_engine=policy_engine)

        policy_times: list[float] = []
        for i in range(self.iterations):
            task = Task(task_id=f"t-bm-pol-{i}", description="Benchmark policy")
            calls = [ToolCall("calculator", arguments, call_id=f"c-{i}")]
            t0 = time.perf_counter()
            await engine_policy.execute(task, calls)
            policy_times.append((time.perf_counter() - t0) * 1000.0)

        bm_policy = compute_statistics(
            policy_times,
            benchmark_id="bm_policy_only",
            name="Policy Governance",
            workload_type="ForgeGuard Authorization Only",
            baseline_mean_ms=base_mean,
            baseline_name="Raw Tool Direct Execution",
        )
        self.benchmark_results.append(bm_policy)

        # ---------------- 3. Policy + Budget Governance ---------------- #
        budget = ExecutionBudget(max_tool_calls=10, max_execution_seconds=30.0)
        engine_budget = ExecutionEngine(
            registry=registry, policy_engine=policy_engine, budget=budget
        )

        budget_times: list[float] = []
        for i in range(self.iterations):
            task = Task(task_id=f"t-bm-bud-{i}", description="Benchmark budget")
            calls = [ToolCall("calculator", arguments, call_id=f"c-{i}")]
            t0 = time.perf_counter()
            await engine_budget.execute(task, calls)
            budget_times.append((time.perf_counter() - t0) * 1000.0)

        bm_budget = compute_statistics(
            budget_times,
            benchmark_id="bm_policy_budget",
            name="Policy + Budget Enforcement",
            workload_type="Pre-call Reservation & Monotonic Deadlines",
            baseline_mean_ms=base_mean,
            baseline_name="Raw Tool Direct Execution",
        )
        self.benchmark_results.append(bm_budget)

        # ---------------- 4. Policy + Budget + Persistence (Durability) ---------------- #
        engine_persist = ExecutionEngine(
            registry=registry,
            policy_engine=policy_engine,
            budget=budget,
            persistence=env.persistence,
        )

        persist_times: list[float] = []
        for i in range(self.iterations):
            task = Task(task_id=f"t-bm-per-{i}", description="Benchmark persistence")
            calls = [ToolCall("calculator", arguments, call_id=f"c-{i}")]
            t0 = time.perf_counter()
            await engine_persist.execute(task, calls)
            persist_times.append((time.perf_counter() - t0) * 1000.0)

        bm_persist = compute_statistics(
            persist_times,
            benchmark_id="bm_durability",
            name="Durability & Event Journal",
            workload_type="SQLite WAL Journal & Checkpointing",
            baseline_mean_ms=base_mean,
            baseline_name="Raw Tool Direct Execution",
        )
        self.benchmark_results.append(bm_persist)

        # ---------------- 5. Full Governed Runtime ---------------- #
        # (Policy + Budget + Durability + Observability)
        full_times: list[float] = []
        for i in range(self.iterations):
            task = Task(task_id=f"t-bm-full-{i}", description="Benchmark full")
            calls = [ToolCall("calculator", arguments, call_id=f"c-{i}")]
            t0 = time.perf_counter()
            await env.engine.execute(task, calls)
            full_times.append((time.perf_counter() - t0) * 1000.0)

        bm_full = compute_statistics(
            full_times,
            benchmark_id="bm_full_runtime",
            name="Full Governed Runtime",
            workload_type="Policy + Budget + Durability + Tracing + Metrics",
            baseline_mean_ms=base_mean,
            baseline_name="Raw Tool Direct Execution",
        )
        self.benchmark_results.append(bm_full)

        # ---------------- 6. Recovery Latency ---------------- #
        # Recover task t-bm-per-0
        recovery = RecoveryEngine(env.persistence)
        recovery_times: list[float] = []
        for _ in range(self.iterations):
            t0 = time.perf_counter()
            await recovery.recover_task("t-bm-per-0")
            recovery_times.append((time.perf_counter() - t0) * 1000.0)

        bm_recovery = compute_statistics(
            recovery_times,
            benchmark_id="bm_recovery_latency",
            name="Crash Recovery Latency",
            workload_type="State Reconstruction & Checkpoint Inspection",
        )
        self.benchmark_results.append(bm_recovery)

        # Assertions
        env.assertions.record(
            name="benchmark_baseline_measured",
            passed=bm_baseline.mean_ms >= 0,
            expected="> 0ms",
            actual=f"{bm_baseline.mean_ms}ms",
            evidence={"baseline": bm_baseline.to_dict()},
        )
        env.assertions.record(
            name="full_runtime_measured",
            passed=bm_full.mean_ms > 0,
            expected="> 0ms",
            actual=f"{bm_full.mean_ms}ms",
            evidence={"full_runtime": bm_full.to_dict()},
        )
        env.assertions.record(
            name="recovery_latency_measured",
            passed=bm_recovery.mean_ms >= 0,
            expected=">= 0ms",
            actual=f"{bm_recovery.mean_ms}ms",
            evidence={"recovery": bm_recovery.to_dict()},
        )
