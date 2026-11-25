from __future__ import annotations

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.evaluation.faults import FaultPoint, FaultType
from forgeguard.evaluation.models import ScenarioCategory, ScenarioSeverity
from forgeguard.evaluation.scenarios.base import BaseScenario, ScenarioEnvironment
from forgeguard.execution.tool_call import ToolCall


class ReliabilitySuccessScenario(BaseScenario):
    scenario_id = "rel_01_success"
    name = "Reliability Happy Path Execution"
    category = ScenarioCategory.RELIABILITY
    severity = ScenarioSeverity.HIGH
    description = "Execute multi-step task within budget limits."
    tags = ["reliability", "core"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        task = Task(description="Compute two arithmetic expressions")
        calls = [
            ToolCall(tool_name="calculator", arguments={"expression": "10 * 10"}, call_id="c1"),
            ToolCall(tool_name="calculator", arguments={"expression": "20 + 30"}, call_id="c2"),
        ]

        result = await env.engine.execute(task, calls)

        env.assertions.assert_task_status(result.status, TaskStatus.COMPLETED)
        env.assertions.assert_tool_executed("calculator", result.events, "c1")
        env.assertions.assert_tool_executed("calculator", result.events, "c2")
        env.assertions.record(
            name="outputs_match",
            passed=result.outputs.get("step_0", {}).get("result") == 100
            and result.outputs.get("step_1", {}).get("result") == 50,
            expected="100 and 50",
            actual=result.outputs,
        )


class ReliabilityToolFailureScenario(BaseScenario):
    scenario_id = "rel_02_tool_failure"
    name = "Reliability Tool Failure Handling"
    category = ScenarioCategory.RELIABILITY
    severity = ScenarioSeverity.HIGH
    description = "Handle tool failure cleanly while preserving partial outputs."
    tags = ["reliability", "failures"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        # Wrap calculator with failure fault
        wrapped = env.fault_injector.wrap_tool(env.registry.get("calculator"))
        env.engine.registry._tools["calculator"] = wrapped
        env.fault_injector.add_fault(
            FaultPoint(
                fault_type=FaultType.TOOL_EXCEPTION,
                target_name="calculator",
                trigger_step=1,
                parameters={"message": "Injected calculator failure"},
            )
        )

        task = Task(description="Failing step 1")
        calls = [
            ToolCall(tool_name="calculator", arguments={"expression": "5 + 5"}, call_id="c1"),
            ToolCall(tool_name="calculator", arguments={"expression": "6 + 6"}, call_id="c2"),
        ]

        result = await env.engine.execute(task, calls)

        env.assertions.assert_task_status(result.status, TaskStatus.FAILED)
        env.assertions.record(
            name="partial_outputs_preserved",
            passed="step_0" in result.outputs,
            expected="step_0 preserved",
            actual=list(result.outputs.keys()),
        )


class ReliabilityCallBudgetExhaustionScenario(BaseScenario):
    scenario_id = "rel_03_budget_call_exhaustion"
    name = "Tool Call Budget Limit Enforcement"
    category = ScenarioCategory.RELIABILITY
    severity = ScenarioSeverity.CRITICAL
    description = "Ensure runtime halts immediately when tool call limit is exhausted."
    tags = ["reliability", "budget"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        env.engine.budget = ExecutionBudget(max_tool_calls=2)

        task = Task(description="Three calls with budget of two")
        calls = [
            ToolCall(tool_name="calculator", arguments={"expression": "1 + 1"}, call_id="c1"),
            ToolCall(tool_name="calculator", arguments={"expression": "2 + 2"}, call_id="c2"),
            ToolCall(tool_name="calculator", arguments={"expression": "3 + 3"}, call_id="c3"),
        ]

        result = await env.engine.execute(task, calls)

        env.assertions.assert_task_status(result.status, TaskStatus.FAILED)
        env.assertions.assert_budget_exceeded("max_tool_calls", result.events)
        env.assertions.record(
            name="third_tool_never_executed",
            passed=not any(
                ev.event_type == "tool_call_completed" and ev.payload.get("call_id") == "c3"
                for ev in result.events
            ),
            expected=True,
            actual=False,
        )


class ReliabilityOutputBudgetExhaustionScenario(BaseScenario):
    scenario_id = "rel_04_output_budget_exhaustion"
    name = "Output Byte Size Limit Enforcement"
    category = ScenarioCategory.RELIABILITY
    severity = ScenarioSeverity.CRITICAL
    description = "Ensure runtime rejects oversized outputs that exceed budget."
    tags = ["reliability", "budget"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        env.engine.budget = ExecutionBudget(max_output_bytes=100)

        # Text analysis tool generating string > 100 bytes
        large_text = "A" * 500
        task = Task(description="Oversized output test")
        calls = [
            ToolCall(
                tool_name="text_analysis",
                arguments={"text": large_text, "operation": "uppercase"},
                call_id="c-large",
            )
        ]

        result = await env.engine.execute(task, calls)

        env.assertions.assert_task_status(result.status, TaskStatus.FAILED)
        env.assertions.assert_budget_exceeded("max_output_bytes", result.events)


class ReliabilityConsecutiveFailureScenario(BaseScenario):
    scenario_id = "rel_05_consecutive_failures"
    name = "Consecutive Failure Limit Enforcement"
    category = ScenarioCategory.RELIABILITY
    severity = ScenarioSeverity.HIGH
    description = "Halt execution when consecutive failure threshold is exceeded."
    tags = ["reliability", "failures"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        env.engine.budget = ExecutionBudget(max_consecutive_failures=2)

        task = Task(description="Two division by zero failures")
        calls = [
            ToolCall(tool_name="calculator", arguments={"expression": "1 / 0"}, call_id="f1"),
            ToolCall(tool_name="calculator", arguments={"expression": "2 / 0"}, call_id="f2"),
            ToolCall(tool_name="calculator", arguments={"expression": "3 + 3"}, call_id="c3"),
        ]

        result = await env.engine.execute(task, calls)

        env.assertions.assert_task_status(result.status, TaskStatus.FAILED)
        env.assertions.assert_budget_exceeded("max_consecutive_failures", result.events)


class ReliabilityTaskCancellationScenario(BaseScenario):
    scenario_id = "rel_06_cancellation"
    name = "Task Cancellation Clean Handling"
    category = ScenarioCategory.RELIABILITY
    severity = ScenarioSeverity.HIGH
    description = "Verify cancelled task transitions to CANCELLED cleanly."
    tags = ["reliability", "lifecycle"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        task = Task(description="Cancelled task")
        session = await env.engine.create_session(task)
        result = await session.cancel(reason="Operator cancelled")

        env.assertions.assert_task_status(result.status, TaskStatus.CANCELLED)
        env.assertions.record(
            name="cancelled_event_logged",
            passed=any(ev.event_type == "task_cancelled" for ev in result.events),
            expected=True,
            actual=True,
        )
