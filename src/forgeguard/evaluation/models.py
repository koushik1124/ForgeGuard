from __future__ import annotations

import platform
import sys
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from forgeguard.persistence.repository import serialize_json


class ScenarioCategory(str, Enum):
    """Categorization for evaluation scenarios."""

    RELIABILITY = "reliability"
    RECOVERY = "recovery"
    SECURITY = "security"
    AGENT = "agent"
    BENCHMARK = "benchmark"
    LOOP = "loop"


class ScenarioSeverity(str, Enum):
    """Criticality level of scenario assertions."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EvaluationStatus(str, Enum):
    """Status outcome of a scenario or assertion."""

    PASS = "pass"
    FAIL = "fail"
    ERROR = "error"
    SKIPPED = "skipped"


@dataclass
class AssertionResult:
    """Individual assertion outcome within a scenario."""

    name: str
    passed: bool
    expected: Any = None
    actual: Any = None
    message: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BenchmarkResult:
    """Statistical measurement of a performance benchmark."""

    benchmark_id: str
    name: str
    workload_type: str
    sample_count: int
    mean_ms: float
    median_ms: float
    p95_ms: float
    min_ms: float
    max_ms: float
    std_dev_ms: float
    relative_overhead_pct: float | None = None
    baseline_name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ScenarioResult:
    """Structured execution outcome of an evaluation scenario."""

    experiment_id: str
    scenario_id: str
    name: str
    category: ScenarioCategory
    severity: ScenarioSeverity
    status: EvaluationStatus
    start_time: str
    end_time: str | None = None
    duration_ms: float = 0.0
    assertions: list[AssertionResult] = field(default_factory=list)
    failure_reason: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    trace_id: str | None = None
    metrics: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)

    @property
    def assertions_passed(self) -> int:
        return sum(1 for a in self.assertions if a.passed)

    @property
    def assertions_failed(self) -> int:
        return sum(1 for a in self.assertions if not a.passed)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["assertions_passed"] = self.assertions_passed
        data["assertions_failed"] = self.assertions_failed
        return data


@dataclass
class ExperimentConfig:
    """Configuration for reproducible evaluation experiments."""

    experiment_id: str
    name: str = "forgeguard_evaluation"
    categories: list[ScenarioCategory] = field(default_factory=list)
    scenario_ids: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    repeat_count: int = 1
    seed: int = 42
    timeout_seconds: float = 60.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExperimentReport:
    """Consolidated human- and machine-readable evaluation report."""

    experiment_id: str
    name: str
    timestamp: str
    duration_ms: float
    total_scenarios: int
    passed: int
    failed: int
    errors: int
    skipped: int
    overall_status: EvaluationStatus
    scenario_results: list[ScenarioResult] = field(default_factory=list)
    benchmarks: list[BenchmarkResult] = field(default_factory=list)
    summary_metrics: dict[str, Any] = field(default_factory=dict)
    environment_info: dict[str, Any] = field(
        default_factory=lambda: {
            "platform": platform.platform(),
            "python_version": sys.version,
            "architecture": platform.architecture()[0],
        }
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "experiment_id": self.experiment_id,
            "name": self.name,
            "timestamp": self.timestamp,
            "duration_ms": self.duration_ms,
            "total_scenarios": self.total_scenarios,
            "passed": self.passed,
            "failed": self.failed,
            "errors": self.errors,
            "skipped": self.skipped,
            "overall_status": self.overall_status.value,
            "scenario_results": [s.to_dict() for s in self.scenario_results],
            "benchmarks": [b.to_dict() for b in self.benchmarks],
            "summary_metrics": self.summary_metrics,
            "environment_info": self.environment_info,
        }

    def to_json(self) -> str:
        return serialize_json(self.to_dict())
