from __future__ import annotations

import shutil
import tempfile
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from forgeguard.agent.tools.calculator import create_calculator_tool
from forgeguard.agent.tools.text_analysis import create_text_analysis_tool
from forgeguard.agent.tools.workspace import create_workspace_tools
from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.evaluation.assertions import AssertionRecorder
from forgeguard.evaluation.faults import FaultInjector
from forgeguard.evaluation.models import (
    EvaluationStatus,
    ScenarioCategory,
    ScenarioResult,
    ScenarioSeverity,
)
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.observability.manager import ObservabilityManager
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.repository import utc_iso_now
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry


class ScenarioEnvironment:
    """Isolated sandbox environment for executing an individual scenario."""

    def __init__(
        self,
        experiment_id: str,
        scenario_id: str,
        base_dir: Path | None = None,
    ) -> None:
        self.experiment_id = experiment_id
        self.scenario_id = scenario_id
        self._temp_dir = Path(tempfile.mkdtemp(prefix=f"fg_eval_{scenario_id}_"))
        self.db_path = self._temp_dir / "eval_forgeguard.db"
        self.workspace_root = self._temp_dir / "sandbox_workspace"
        self.workspace_root.mkdir(parents=True, exist_ok=True)

        self.assertions = AssertionRecorder()
        self.fault_injector = FaultInjector()

        # Core runtime fixtures
        self.registry = ToolRegistry()
        self._register_default_tools()

        self.policy_engine = PolicyEngine(Policy(default_allow=True))
        self.budget = ExecutionBudget()
        self.persistence = PersistenceManager(db_path=self.db_path)
        self.observability = ObservabilityManager()

        self.engine = ExecutionEngine(
            registry=self.registry,
            policy_engine=self.policy_engine,
            budget=self.budget,
            persistence=self.persistence,
            observability=self.observability,
        )

    def _register_default_tools(self) -> None:
        calc = create_calculator_tool()
        text_tool = create_text_analysis_tool()
        ws_list, ws_read = create_workspace_tools(self.workspace_root)

        for t in [calc, text_tool, ws_list, ws_read]:
            self.registry.register(t)

    async def initialize(self) -> None:
        await self.persistence.initialize()
        if self.observability.store is not None:
            await self.observability.store.initialize()

    async def cleanup(self) -> None:
        try:
            await self.persistence.close()
        except Exception:
            pass
        self.fault_injector.clear()
        shutil.rmtree(self._temp_dir, ignore_errors=True)


class BaseScenario(ABC):
    """Abstract base class for all evaluation scenarios."""

    scenario_id: str
    name: str
    category: ScenarioCategory
    severity: ScenarioSeverity = ScenarioSeverity.MEDIUM
    description: str = ""
    tags: list[str] = []

    async def setup(self, env: ScenarioEnvironment) -> None:
        """Pre-scenario configuration hook."""
        return None

    @abstractmethod
    async def execute(self, env: ScenarioEnvironment) -> None:
        """Run scenario actions and record assertions on env.assertions."""
        ...

    async def teardown(self, env: ScenarioEnvironment) -> None:
        """Post-scenario cleanup hook."""
        return None

    async def run(
        self,
        experiment_id: str,
        timeout_seconds: float = 60.0,
    ) -> ScenarioResult:
        """Execute the full scenario lifecycle within an isolated environment."""
        env = ScenarioEnvironment(
            experiment_id=experiment_id,
            scenario_id=self.scenario_id,
        )
        start_time_iso = utc_iso_now()
        start_mono = time.monotonic()
        status = EvaluationStatus.PASS
        failure_reason: str | None = None
        evidence: dict[str, Any] = {}
        diagnostics: list[dict[str, Any]] = []

        try:
            await env.initialize()
            await self.setup(env)
            await self.execute(env)

            # Evaluate assertions
            if not env.assertions.all_passed:
                status = EvaluationStatus.FAIL
                failure_reason = "; ".join(env.assertions.failure_messages)

            evidence["assertions_summary"] = {
                "total": len(env.assertions.assertions),
                "passed": sum(1 for a in env.assertions.assertions if a.passed),
                "failed": sum(1 for a in env.assertions.assertions if not a.passed),
            }

            # Collect diagnostics
            if env.observability:
                diagnostics = [d.to_dict() for d in env.observability.get_diagnostics()]

        except Exception as exc:
            status = EvaluationStatus.ERROR
            failure_reason = f"Scenario execution raised {type(exc).__name__}: {exc}"

        finally:
            await self.teardown(env)
            await env.cleanup()

        duration_ms = max(0.0, (time.monotonic() - start_mono) * 1000.0)
        end_time_iso = utc_iso_now()

        return ScenarioResult(
            experiment_id=experiment_id,
            scenario_id=self.scenario_id,
            name=self.name,
            category=self.category,
            severity=self.severity,
            status=status,
            start_time=start_time_iso,
            end_time=end_time_iso,
            duration_ms=duration_ms,
            assertions=env.assertions.assertions,
            failure_reason=failure_reason,
            evidence=evidence,
            diagnostics=diagnostics,
            tags=self.tags,
        )
