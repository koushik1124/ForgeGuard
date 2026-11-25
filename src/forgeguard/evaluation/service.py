from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import uuid4

from forgeguard.evaluation.models import (
    BenchmarkResult,
    EvaluationStatus,
    ExperimentConfig,
    ExperimentReport,
    ScenarioResult,
)
from forgeguard.evaluation.reporting import ReportGenerator
from forgeguard.evaluation.runner import EvaluationRunner
from forgeguard.evaluation.scenarios import (
    ALL_SCENARIO_CLASSES,
    BaseScenario,
    PerformanceBenchmarkScenario,
    get_scenario_by_id,
    get_scenarios_for_suite,
)
from forgeguard.persistence.repository import utc_iso_now

logger = logging.getLogger("forgeguard.evaluation.service")


class EvaluationRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class EvaluationRunState:
    run_id: str
    experiment_id: str
    name: str
    status: EvaluationRunStatus
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    selected_suites: list[str] = field(default_factory=list)
    selected_scenario_ids: list[str] = field(default_factory=list)
    total_scenarios: int = 0
    completed_scenarios: int = 0
    current_scenario_id: str | None = None
    current_scenario_name: str | None = None
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    overall_status: str | None = None
    duration_ms: float = 0.0
    error_summary: str | None = None
    report_id: str | None = None
    report: ExperimentReport | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "experiment_id": self.experiment_id,
            "name": self.name,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "selected_suites": self.selected_suites,
            "selected_scenario_ids": self.selected_scenario_ids,
            "total_scenarios": self.total_scenarios,
            "completed_scenarios": self.completed_scenarios,
            "current_scenario_id": self.current_scenario_id,
            "current_scenario_name": self.current_scenario_name,
            "passed": self.passed,
            "failed": self.failed,
            "errors": self.errors,
            "skipped": self.skipped,
            "overall_status": self.overall_status,
            "duration_ms": self.duration_ms,
            "error_summary": self.error_summary,
            "report_id": self.report_id,
        }


class EvaluationRunnerService:
    """Manages controlled evaluation runs, progress tracking, and SSE event streaming."""

    def __init__(self, reports_dir: str | Path = "eval_reports") -> None:
        self.reports_dir = Path(reports_dir).resolve()
        self.reports_dir.mkdir(parents=True, exist_ok=True)

        self._runs: dict[str, EvaluationRunState] = {}
        self._active_run_id: str | None = None
        self._lock = asyncio.Lock()
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}

        # SSE event journal and subscriber queues: run_id -> list[(seq, event_type, payload)]
        self._event_journals: dict[str, list[tuple[int, str, dict[str, Any]]]] = {}
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}

    def get_active_run_id(self) -> str | None:
        """Return the ID of the currently executing evaluation run, if any."""
        return self._active_run_id

    def list_runs(self) -> list[EvaluationRunState]:
        """Return all tracked evaluation runs in memory, newest first."""
        return sorted(self._runs.values(), key=lambda r: r.created_at, reverse=True)

    def get_run(self, run_id: str) -> EvaluationRunState | None:
        """Retrieve execution state for a specific run."""
        return self._runs.get(run_id)

    async def _emit_event(self, run_id: str, event_type: str, payload: dict[str, Any]) -> None:
        """Record and broadcast an event for a run to subscribers."""
        if run_id not in self._event_journals:
            self._event_journals[run_id] = []

        journal = self._event_journals[run_id]
        seq = len(journal) + 1
        journal.append((seq, event_type, payload))

        event_msg = {
            "id": seq,
            "type": event_type,
            "data": payload,
            "timestamp": utc_iso_now(),
        }

        subs = self._subscribers.get(run_id, set())
        for q in list(subs):
            try:
                q.put_nowait(event_msg)
            except asyncio.QueueFull:
                logger.warning("Subscriber queue for run '%s' is full, dropping event.", run_id)

    def resolve_target_scenarios(
        self,
        suites: list[str] | None,
        scenario_ids: list[str] | None,
    ) -> list[BaseScenario]:
        """Resolve scenario instances deterministically, removing duplicates."""
        scenarios: list[BaseScenario] = []
        seen_ids: set[str] = set()

        # 1. Resolve from specific scenario IDs
        if scenario_ids:
            for s_id in scenario_ids:
                sc = get_scenario_by_id(s_id)
                if sc and sc.scenario_id not in seen_ids:
                    scenarios.append(sc)
                    seen_ids.add(sc.scenario_id)

        # 2. Resolve from suites
        if suites:
            for s_name in suites:
                suite_scenarios = get_scenarios_for_suite(s_name)
                for sc in suite_scenarios:
                    if sc.scenario_id not in seen_ids:
                        scenarios.append(sc)
                        seen_ids.add(sc.scenario_id)

        # 3. If neither provided, default to all scenarios
        if not scenarios and not suites and not scenario_ids:
            scenarios = [cls() for cls in ALL_SCENARIO_CLASSES]

        return scenarios

    async def start_evaluation_run(
        self,
        name: str = "forgeguard_evaluation",
        suites: list[str] | None = None,
        scenario_ids: list[str] | None = None,
    ) -> EvaluationRunState:
        """Validate selections and launch an evaluation run as a background task."""
        async with self._lock:
            # 1. Check concurrency limit (max 1 concurrent run)
            if self._active_run_id is not None:
                active_state = self._runs.get(self._active_run_id)
                if active_state and active_state.status in (
                    EvaluationRunStatus.QUEUED,
                    EvaluationRunStatus.RUNNING,
                ):
                    raise RuntimeError(
                        f"An evaluation run is already in progress ({self._active_run_id}). "
                        "Please wait for it to complete or inspect active execution."
                    )
                else:
                    self._active_run_id = None

            # 2. Resolve scenarios
            target_scenarios = self.resolve_target_scenarios(suites, scenario_ids)
            if not target_scenarios:
                raise ValueError("No valid scenarios selected for evaluation run.")

            # 3. Create run state
            run_id = f"exp_{uuid4().hex[:8]}"
            state = EvaluationRunState(
                run_id=run_id,
                experiment_id=run_id,
                name=name,
                status=EvaluationRunStatus.QUEUED,
                created_at=utc_iso_now(),
                selected_suites=suites or [],
                selected_scenario_ids=[s.scenario_id for s in target_scenarios],
                total_scenarios=len(target_scenarios),
                completed_scenarios=0,
            )

            self._runs[run_id] = state
            self._active_run_id = run_id
            self._event_journals[run_id] = []
            self._subscribers[run_id] = set()

            # 4. Spawn background execution task
            bg_task = asyncio.create_task(self._execute_evaluation(run_id, target_scenarios))
            self._active_tasks[run_id] = bg_task

            return state

    async def _execute_evaluation(
        self,
        run_id: str,
        scenarios: list[BaseScenario],
    ) -> None:
        """Asynchronously execute evaluation scenarios with progress tracking."""
        state = self._runs.get(run_id)
        if not state:
            return

        state.status = EvaluationRunStatus.RUNNING
        state.started_at = utc_iso_now()
        start_mono = time.monotonic()

        await self._emit_event(
            run_id,
            "evaluation_started",
            {
                "run_id": run_id,
                "name": state.name,
                "total_scenarios": state.total_scenarios,
                "selected_suites": state.selected_suites,
                "timestamp": state.started_at,
            },
        )

        runner = EvaluationRunner(
            config=ExperimentConfig(
                experiment_id=run_id,
                name=state.name,
                scenario_ids=[s.scenario_id for s in scenarios],
            )
        )

        scenario_results: list[ScenarioResult] = []
        benchmarks: list[BenchmarkResult] = []

        try:
            for idx, scenario in enumerate(scenarios, start=1):
                state.current_scenario_id = scenario.scenario_id
                state.current_scenario_name = scenario.name

                await self._emit_event(
                    run_id,
                    "scenario_started",
                    {
                        "run_id": run_id,
                        "scenario_id": scenario.scenario_id,
                        "name": scenario.name,
                        "category": (
                            scenario.category.value
                            if hasattr(scenario.category, "value")
                            else str(scenario.category)
                        ),
                        "index": idx,
                        "total": state.total_scenarios,
                    },
                )

                # Execute individual scenario in its isolated ScenarioEnvironment
                result = await runner.run_scenario(scenario)
                scenario_results.append(result)

                # Update counters
                state.completed_scenarios += 1
                if result.status == EvaluationStatus.PASS:
                    state.passed += 1
                    event_type = "scenario_completed"
                elif result.status == EvaluationStatus.FAIL:
                    state.failed += 1
                    event_type = "scenario_failed"
                elif result.status == EvaluationStatus.ERROR:
                    state.errors += 1
                    event_type = "scenario_failed"
                else:
                    state.skipped += 1
                    event_type = "scenario_completed"

                if isinstance(scenario, PerformanceBenchmarkScenario):
                    benchmarks.extend(scenario.benchmark_results)

                # Emit scenario outcome event
                await self._emit_event(
                    run_id,
                    event_type,
                    {
                        "run_id": run_id,
                        "scenario_id": scenario.scenario_id,
                        "name": scenario.name,
                        "status": result.status.value,
                        "duration_ms": result.duration_ms,
                        "assertions_passed": result.assertions_passed,
                        "assertions_failed": result.assertions_failed,
                        "failure_reason": result.failure_reason,
                        "completed_count": state.completed_scenarios,
                        "total_count": state.total_scenarios,
                    },
                )

                # Emit progress update
                progress_pct = round((state.completed_scenarios / state.total_scenarios) * 100.0, 1)
                await self._emit_event(
                    run_id,
                    "evaluation_progress",
                    {
                        "run_id": run_id,
                        "completed_scenarios": state.completed_scenarios,
                        "total_scenarios": state.total_scenarios,
                        "progress_pct": progress_pct,
                        "passed": state.passed,
                        "failed": state.failed,
                    },
                )

            # Consolidate overall execution report
            total_duration_ms = max(0.0, (time.monotonic() - start_mono) * 1000.0)
            overall_status = EvaluationStatus.PASS
            if state.errors > 0:
                overall_status = EvaluationStatus.ERROR
            elif state.failed > 0:
                overall_status = EvaluationStatus.FAIL

            pass_rate = (
                round((state.passed / state.total_scenarios * 100.0), 2)
                if state.total_scenarios > 0
                else 0.0
            )
            summary_metrics = {
                "pass_rate_pct": pass_rate,
                "total_assertions": sum(len(s.assertions) for s in scenario_results),
                "assertions_passed": sum(s.assertions_passed for s in scenario_results),
                "assertions_failed": sum(s.assertions_failed for s in scenario_results),
            }

            report = ExperimentReport(
                experiment_id=run_id,
                name=state.name,
                timestamp=state.started_at or utc_iso_now(),
                duration_ms=total_duration_ms,
                total_scenarios=len(scenario_results),
                passed=state.passed,
                failed=state.failed,
                errors=state.errors,
                skipped=state.skipped,
                overall_status=overall_status,
                scenario_results=scenario_results,
                benchmarks=benchmarks,
                summary_metrics=summary_metrics,
            )

            # Persist report to eval_reports/ directory
            json_p, md_p = ReportGenerator.export(report, self.reports_dir)
            logger.info("Persisted evaluation report '%s' to %s and %s", run_id, json_p, md_p)

            state.status = EvaluationRunStatus.COMPLETED
            state.completed_at = utc_iso_now()
            state.overall_status = overall_status.value
            state.duration_ms = total_duration_ms
            state.current_scenario_id = None
            state.current_scenario_name = None
            state.report_id = run_id
            state.report = report

            await self._emit_event(
                run_id,
                "evaluation_completed",
                {
                    "run_id": run_id,
                    "overall_status": overall_status.value,
                    "duration_ms": total_duration_ms,
                    "passed": state.passed,
                    "failed": state.failed,
                    "errors": state.errors,
                    "total": state.total_scenarios,
                    "pass_rate_pct": pass_rate,
                    "report_id": run_id,
                },
            )

        except asyncio.CancelledError:
            logger.info("Evaluation run '%s' was cancelled", run_id)
            state.status = EvaluationRunStatus.FAILED
            state.completed_at = utc_iso_now()
            state.error_summary = "Evaluation run cancelled."
            state.current_scenario_id = None
            state.current_scenario_name = None

            await self._emit_event(
                run_id,
                "evaluation_failed",
                {
                    "run_id": run_id,
                    "error": "Evaluation run cancelled.",
                },
            )
            raise
        except Exception as exc:
            logger.exception("Evaluation run '%s' failed unexpectedly: %s", run_id, exc)
            state.status = EvaluationRunStatus.FAILED
            state.completed_at = utc_iso_now()
            state.error_summary = f"Runner execution failed: {exc}"
            state.current_scenario_id = None
            state.current_scenario_name = None

            await self._emit_event(
                run_id,
                "evaluation_failed",
                {
                    "run_id": run_id,
                    "error": str(exc),
                },
            )
        finally:
            await self._emit_event(
                run_id,
                "stream_closed",
                {
                    "run_id": run_id,
                    "status": state.status.value,
                },
            )
            self._active_tasks.pop(run_id, None)
            async with self._lock:
                if self._active_run_id == run_id:
                    self._active_run_id = None

    async def close(self) -> None:
        """Cancel any active background evaluation tasks."""
        tasks: list[tuple[str, asyncio.Task[None]]] = []
        for run_id, task in list(self._active_tasks.items()):
            if not task.done():
                task.cancel()
                tasks.append((run_id, task))
        if tasks:
            await asyncio.gather(*(t for _, t in tasks), return_exceptions=True)
            for run_id, _ in tasks:
                state = self._runs.get(run_id)
                if state and state.status in (EvaluationRunStatus.QUEUED, EvaluationRunStatus.RUNNING):
                    state.status = EvaluationRunStatus.FAILED
                    state.completed_at = utc_iso_now()
                    state.error_summary = "Evaluation run cancelled."
        self._active_tasks.clear()

    async def stream_run_events(
        self,
        run_id: str,
        last_event_id: str | None = None,
        heartbeat_seconds: float = 15.0,
    ) -> Any:
        """Stream SSE execution events with replay support and keepalive comments."""
        state = self._runs.get(run_id)
        if not state and not (self.reports_dir / f"report_{run_id}.json").exists():
            raise ValueError(f"Evaluation run '{run_id}' not found.")

        last_seq = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

        # 1. Replay historical events from journal
        journal = self._event_journals.get(run_id, [])
        for seq, etype, payload in journal:
            if seq > last_seq:
                yield f"id: {seq}\nevent: {etype}\ndata: {json.dumps(payload)}\n\n"
                last_seq = max(last_seq, seq)

        # 2. If run already terminal, send stream_closed and finish
        if state and state.status in (EvaluationRunStatus.COMPLETED, EvaluationRunStatus.FAILED):
            close_data = json.dumps({"status": state.status.value, "run_id": run_id})
            yield f"id: {last_seq + 1}\nevent: stream_closed\ndata: {close_data}\n\n"
            return

        # 3. Subscribe to live queue
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        if run_id not in self._subscribers:
            self._subscribers[run_id] = set()
        self._subscribers[run_id].add(queue)

        try:
            terminal_types = {"evaluation_completed", "evaluation_failed", "stream_closed"}
            while True:
                try:
                    event_msg = await asyncio.wait_for(queue.get(), timeout=heartbeat_seconds)
                    seq = event_msg["id"]
                    etype = event_msg["type"]
                    data = event_msg["data"]
                    yield f"id: {seq}\nevent: {etype}\ndata: {json.dumps(data)}\n\n"

                    if etype in terminal_types:
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"

                # Check if state completed while waiting, only if no pending events in queue
                current_state = self._runs.get(run_id)
                if (
                    queue.empty()
                    and current_state
                    and current_state.status in (
                        EvaluationRunStatus.COMPLETED,
                        EvaluationRunStatus.FAILED,
                    )
                ):
                    break
        finally:
            if run_id in self._subscribers:
                self._subscribers[run_id].discard(queue)
                if not self._subscribers[run_id]:
                    self._subscribers.pop(run_id, None)
