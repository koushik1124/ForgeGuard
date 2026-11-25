from __future__ import annotations

from forgeguard.evaluation.scenarios.agent import (
    AgentDirectFinalAnswerScenario,
    AgentIterationLimitScenario,
    AgentLoopBehaviorDetectionScenario,
    AgentMultiStepReasoningScenario,
    AgentToolErrorRecoveryScenario,
)
from forgeguard.evaluation.scenarios.base import BaseScenario, ScenarioEnvironment
from forgeguard.evaluation.scenarios.benchmarks import (
    PerformanceBenchmarkScenario,
    compute_statistics,
)
from forgeguard.evaluation.scenarios.recovery import (
    RecoveryAfterCheckpointScenario,
    RecoveryIdempotencyConflictScenario,
    RecoveryUncertainMidToolScenario,
)
from forgeguard.evaluation.scenarios.reliability import (
    ReliabilityCallBudgetExhaustionScenario,
    ReliabilityConsecutiveFailureScenario,
    ReliabilityOutputBudgetExhaustionScenario,
    ReliabilitySuccessScenario,
    ReliabilityTaskCancellationScenario,
    ReliabilityToolFailureScenario,
)
from forgeguard.evaluation.scenarios.security import (
    SecurityCalculatorCodeInjectionScenario,
    SecurityPromptInjectionScenario,
    SecurityUnauthorizedToolScenario,
    SecurityUnknownToolScenario,
    SecurityWorkspacePathTraversalScenario,
)

SUITE_RELIABILITY: list[type[BaseScenario]] = [
    ReliabilitySuccessScenario,
    ReliabilityToolFailureScenario,
    ReliabilityCallBudgetExhaustionScenario,
    ReliabilityOutputBudgetExhaustionScenario,
    ReliabilityConsecutiveFailureScenario,
    ReliabilityTaskCancellationScenario,
]

SUITE_RECOVERY: list[type[BaseScenario]] = [
    RecoveryAfterCheckpointScenario,
    RecoveryUncertainMidToolScenario,
    RecoveryIdempotencyConflictScenario,
]

SUITE_SECURITY: list[type[BaseScenario]] = [
    SecurityUnauthorizedToolScenario,
    SecurityUnknownToolScenario,
    SecurityPromptInjectionScenario,
    SecurityWorkspacePathTraversalScenario,
    SecurityCalculatorCodeInjectionScenario,
]

SUITE_AGENT: list[type[BaseScenario]] = [
    AgentDirectFinalAnswerScenario,
    AgentMultiStepReasoningScenario,
    AgentToolErrorRecoveryScenario,
    AgentIterationLimitScenario,
    AgentLoopBehaviorDetectionScenario,
]

SUITE_BENCHMARKS: list[type[BaseScenario]] = [
    PerformanceBenchmarkScenario,
]

ALL_SCENARIO_CLASSES: list[type[BaseScenario]] = (
    SUITE_RELIABILITY + SUITE_RECOVERY + SUITE_SECURITY + SUITE_AGENT + SUITE_BENCHMARKS
)


def get_scenario_by_id(scenario_id: str) -> BaseScenario | None:
    for cls in ALL_SCENARIO_CLASSES:
        if cls.scenario_id == scenario_id:
            return cls()
    return None


def get_scenarios_for_suite(suite_name: str) -> list[BaseScenario]:
    mapping: dict[str, list[type[BaseScenario]]] = {
        "reliability": SUITE_RELIABILITY,
        "recovery": SUITE_RECOVERY,
        "security": SUITE_SECURITY,
        "agent": SUITE_AGENT,
        "benchmarks": SUITE_BENCHMARKS,
        "all": ALL_SCENARIO_CLASSES,
    }
    classes = mapping.get(suite_name.lower(), [])
    return [cls() for cls in classes]


__all__ = [
    "ALL_SCENARIO_CLASSES",
    "AgentDirectFinalAnswerScenario",
    "AgentIterationLimitScenario",
    "AgentLoopBehaviorDetectionScenario",
    "AgentMultiStepReasoningScenario",
    "AgentToolErrorRecoveryScenario",
    "BaseScenario",
    "PerformanceBenchmarkScenario",
    "RecoveryAfterCheckpointScenario",
    "RecoveryIdempotencyConflictScenario",
    "RecoveryUncertainMidToolScenario",
    "ReliabilityCallBudgetExhaustionScenario",
    "ReliabilityConsecutiveFailureScenario",
    "ReliabilityOutputBudgetExhaustionScenario",
    "ReliabilitySuccessScenario",
    "ReliabilityTaskCancellationScenario",
    "ReliabilityToolFailureScenario",
    "SUITE_AGENT",
    "SUITE_BENCHMARKS",
    "SUITE_RECOVERY",
    "SUITE_RELIABILITY",
    "SUITE_SECURITY",
    "ScenarioEnvironment",
    "SecurityCalculatorCodeInjectionScenario",
    "SecurityPromptInjectionScenario",
    "SecurityUnauthorizedToolScenario",
    "SecurityUnknownToolScenario",
    "SecurityWorkspacePathTraversalScenario",
    "compute_statistics",
    "get_scenario_by_id",
    "get_scenarios_for_suite",
]
