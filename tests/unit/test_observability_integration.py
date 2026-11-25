from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from pydantic import BaseModel

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.observability.behavior import BehaviorConfig
from forgeguard.observability.manager import ObservabilityManager
from forgeguard.observability.models import (
    DiagnosticCategory,
    DiagnosticSeverity,
)
from forgeguard.observability.storage import ObservabilityStore
from forgeguard.persistence.database import Database
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry
from forgeguard.tools.tool import Tool


class EchoInput(BaseModel):
    message: str


def echo_handler(message: str) -> str:
    return f"echo: {message}"


class SecretInput(BaseModel):
    api_key: str
    secret_token: str
    query: str


def secret_handler(api_key: str, secret_token: str, query: str) -> dict[str, str]:
    return {"status": "ok", "api_key": api_key, "answer": query}


async def async_slow_tool() -> str:
    await asyncio.sleep(0.05)
    return "done"


@pytest.fixture
def base_registry() -> ToolRegistry:
    reg = ToolRegistry()
    reg.register(Tool("echo", "Echo message", echo_handler, EchoInput))
    reg.register(Tool("secret_tool", "Secret tool", secret_handler, SecretInput))
    reg.register(Tool("slow_tool", "Slow tool", async_slow_tool))
    return reg


@pytest.mark.asyncio
async def test_observability_successful_task(base_registry: ToolRegistry) -> None:
    obs = ObservabilityManager()
    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        observability=obs,
    )

    task = Task(description="Echo hello", task_id="t-obs-1")
    calls = [ToolCall("echo", {"message": "hello"}, call_id="c1")]

    result = await engine.execute(task, calls)
    assert result.status == TaskStatus.COMPLETED

    # Check trace
    trace = obs.get_trace_by_task("t-obs-1")
    assert trace is not None
    assert trace.status == "completed"
    assert trace.duration_ms >= 0.0

    # Check spans
    spans = obs.get_spans(trace.trace_id)
    assert len(spans) == 2  # root span + tool:echo
    tool_span = next(s for s in spans if s.operation_name == "tool:echo")
    assert tool_span.status == "completed"
    assert tool_span.attributes["call_id"] == "c1"

    # Check metrics
    t_metrics = obs.get_task_metrics()
    assert t_metrics["completed_tasks"] == 1
    assert t_metrics["success_rate"] == 1.0

    tool_metrics = obs.get_tool_metrics()
    assert tool_metrics["successful_tool_calls"] == 1
    assert "echo" in tool_metrics["per_tool"]

    # Check timeline
    timeline = obs.get_timeline("t-obs-1", result.events)
    assert len(timeline) >= 4
    categories = [e.category for e in timeline]
    assert "task" in categories
    assert "policy" in categories
    assert "tool" in categories

    # Check execution report
    report = obs.export_execution_report("t-obs-1", result.events)
    assert report.task_id == "t-obs-1"
    assert report.status == "completed"
    assert len(report.tool_summaries) == 1
    assert report.tool_summaries[0]["tool_name"] == "echo"
    assert report.tool_summaries[0]["status"] == "success"


@pytest.mark.asyncio
async def test_observability_policy_denial(base_registry: ToolRegistry) -> None:
    obs = ObservabilityManager()
    # Default deny policy without allowed tools
    policy = PolicyEngine(Policy(default_allow=False, allowed_tools=frozenset()))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        observability=obs,
    )

    task = Task(description="Blocked execution", task_id="t-obs-deny")
    calls = [ToolCall("echo", {"message": "blocked"}, call_id="c-deny")]

    result = await engine.execute(task, calls)
    assert result.status == TaskStatus.FAILED

    trace = obs.get_trace_by_task("t-obs-deny")
    assert trace is not None
    assert trace.status == "failed"

    # Check diagnostic
    diagnostics = obs.get_diagnostics(task_id="t-obs-deny")
    assert len(diagnostics) == 1
    diag = diagnostics[0]
    assert diag.code == "FG-POLICY-001"
    assert diag.category == DiagnosticCategory.POLICY
    assert diag.severity == DiagnosticSeverity.ERROR
    assert "Grant explicit authorization" in (diag.suggested_action or "")

    # Check metrics
    pol_metrics = obs.metrics.get_policy_metrics_summary()
    assert pol_metrics["denied_decisions"] == 1
    assert pol_metrics["denial_rate"] == 1.0


@pytest.mark.asyncio
async def test_observability_tool_validation_error(base_registry: ToolRegistry) -> None:
    obs = ObservabilityManager()
    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        observability=obs,
    )

    task = Task(description="Invalid input", task_id="t-obs-val")
    # Echo requires 'message' string, supply empty or wrong type
    calls = [ToolCall("echo", {"extra_illegal_param": 123}, call_id="c-val")]

    result = await engine.execute(task, calls)
    assert result.status == TaskStatus.FAILED

    diagnostics = obs.get_diagnostics(task_id="t-obs-val")
    assert any(d.code == "FG-TOOL-003" for d in diagnostics)


@pytest.mark.asyncio
async def test_observability_budget_exhaustion(base_registry: ToolRegistry) -> None:
    obs = ObservabilityManager()
    policy = PolicyEngine(Policy(default_allow=True))
    budget = ExecutionBudget(max_tool_calls=1)
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        budget=budget,
        observability=obs,
    )

    task = Task(description="Exceed budget", task_id="t-obs-budget")
    calls = [
        ToolCall("echo", {"message": "one"}, call_id="c-bgt-1"),
        ToolCall("echo", {"message": "two"}, call_id="c-bgt-2"),
    ]

    result = await engine.execute(task, calls)
    assert result.status == TaskStatus.FAILED

    diagnostics = obs.get_diagnostics(task_id="t-obs-budget")
    assert any(d.code == "FG-BUDGET-001" for d in diagnostics)


@pytest.mark.asyncio
async def test_observability_cancellation(base_registry: ToolRegistry) -> None:
    obs = ObservabilityManager()
    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        observability=obs,
    )

    task = Task(description="Cancel me", task_id="t-obs-cancel")
    await obs.on_task_start(task)
    await engine.cancel(task)

    assert task.status == TaskStatus.CANCELLED
    trace = obs.get_trace_by_task("t-obs-cancel")
    assert trace is not None
    assert trace.status == "cancelled"

    diagnostics = obs.get_diagnostics(task_id="t-obs-cancel")
    assert any(d.code == "FG-CANCEL-001" for d in diagnostics)


@pytest.mark.asyncio
async def test_observability_loop_behavior_detection(base_registry: ToolRegistry) -> None:
    config = BehaviorConfig(max_repeated_tool_calls=3)
    obs = ObservabilityManager(behavior_config=config)
    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        observability=obs,
    )

    task = Task(description="Looping agent", task_id="t-obs-loop")
    calls = [
        ToolCall("echo", {"message": "repeat"}, call_id="c1"),
        ToolCall("echo", {"message": "repeat"}, call_id="c2"),
        ToolCall("echo", {"message": "repeat"}, call_id="c3"),
    ]

    result = await engine.execute(task, calls)
    assert result.status == TaskStatus.COMPLETED

    diagnostics = obs.get_diagnostics(task_id="t-obs-loop")
    loop_codes = [d.code for d in diagnostics]
    assert "FG-LOOP-001" in loop_codes  # 3 consecutive calls
    assert "FG-LOOP-002" in loop_codes  # Identical arguments


@pytest.mark.asyncio
async def test_observability_sensitive_data_redaction(base_registry: ToolRegistry) -> None:
    obs = ObservabilityManager()
    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        observability=obs,
    )

    task = Task(description="Secret task", task_id="t-obs-secret")
    calls = [
        ToolCall(
            "secret_tool",
            {"api_key": "sk-secret-12345", "secret_token": "super_token", "query": "hello"},
            call_id="c-sec",
        )
    ]

    result = await engine.execute(task, calls)
    assert result.status == TaskStatus.COMPLETED

    # 1. Default export masks sensitive parameters
    safe_report = obs.export_execution_report(
        "t-obs-secret", result.events, include_sensitive=False
    )
    safe_json = safe_report.to_dict()
    assert "sk-secret-12345" not in str(safe_json)
    assert "super_token" not in str(safe_json)

    # 2. Opt-in export allows inspection
    full_report = obs.export_execution_report("t-obs-secret", result.events, include_sensitive=True)
    full_json = full_report.to_dict()
    assert "sk-secret-12345" in str(full_json)


@pytest.mark.asyncio
async def test_observability_with_persistence_and_recovery(
    tmp_path: Path, base_registry: ToolRegistry
) -> None:
    db_file = tmp_path / "obs_integrated.db"
    db = Database(db_file)
    p_manager = PersistenceManager(db_path=db_file)
    store = ObservabilityStore(db)
    obs = ObservabilityManager(store=store)
    await obs.initialize()

    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=base_registry,
        policy_engine=policy,
        persistence=p_manager,
        observability=obs,
    )

    task = Task(description="Durable task with obs", task_id="t-durable-obs")
    calls = [
        ToolCall("echo", {"message": "step0"}, call_id="call-0"),
        ToolCall("echo", {"message": "step1"}, call_id="call-1"),
    ]

    res = await engine.execute(task, calls)
    assert res.status == TaskStatus.COMPLETED

    # Verify trace persisted to SQLite
    persisted_trace = await store.get_trace_by_task("t-durable-obs")
    assert persisted_trace is not None
    assert persisted_trace.status == "completed"

    persisted_spans = await store.get_spans(persisted_trace.trace_id)
    assert len(persisted_spans) >= 2
