from __future__ import annotations

from forgeguard.agent.models import AgentStatus, FinalAction, ToolAction
from forgeguard.agent.orchestrator import Agent
from forgeguard.agent.providers.mock import MockProvider
from forgeguard.evaluation.models import ScenarioCategory, ScenarioSeverity
from forgeguard.evaluation.scenarios.base import BaseScenario, ScenarioEnvironment


class AgentDirectFinalAnswerScenario(BaseScenario):
    scenario_id = "agt_01_direct_answer"
    name = "Agent Concludes Without Tools"
    category = ScenarioCategory.AGENT
    severity = ScenarioSeverity.MEDIUM
    description = (
        "Verify agent can provide a direct final response without unnecessary tool invocations."
    )
    tags = ["agent", "reasoning"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        provider = MockProvider(
            responses=[
                FinalAction(
                    action_type="final",
                    final_response="Direct answer from LLM knowledge base.",
                )
            ]
        )
        agent = Agent(engine=env.engine, provider=provider)
        result = await agent.run("Simple factual question")

        env.assertions.assert_agent_status(result.status, AgentStatus.COMPLETED)
        env.assertions.record(
            name="zero_tool_calls",
            passed=result.tool_call_count == 0,
            expected=0,
            actual=result.tool_call_count,
        )


class AgentMultiStepReasoningScenario(BaseScenario):
    scenario_id = "agt_02_multi_step_reasoning"
    name = "Agent Multi-Step Tool Deliberation"
    category = ScenarioCategory.AGENT
    severity = ScenarioSeverity.HIGH
    description = (
        "Execute multi-step reasoning where intermediate results feed subsequent tool calls."
    )
    tags = ["agent", "multistep"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        provider = MockProvider(
            responses=[
                # Step 1: Text analysis
                ToolAction(
                    action_type="tool",
                    tool_name="text_analysis",
                    arguments={"text": "ForgeGuard reliability runtime", "operation": "word_count"},
                    rationale="Count words",
                ),
                # Step 2: Calculator multiplying word count
                ToolAction(
                    action_type="tool",
                    tool_name="calculator",
                    arguments={"expression": "3 * 10"},
                    rationale="Multiply count by 10",
                ),
                # Step 3: Conclude
                FinalAction(
                    action_type="final",
                    final_response="Found 3 words; multiplied result is 30.",
                ),
            ]
        )

        agent = Agent(engine=env.engine, provider=provider)
        result = await agent.run("Analyze words and compute score")

        env.assertions.assert_agent_status(result.status, AgentStatus.COMPLETED)
        env.assertions.record(
            name="tool_calls_executed",
            passed=result.tool_call_count == 2 and result.successful_tool_count == 2,
            expected=2,
            actual=result.successful_tool_count,
        )


class AgentToolErrorRecoveryScenario(BaseScenario):
    scenario_id = "agt_03_tool_error_recovery"
    name = "Agent Error Observation and Adaptation"
    category = ScenarioCategory.AGENT
    severity = ScenarioSeverity.HIGH
    description = (
        "Verify agent observes a tool execution error and adapts with corrected arguments."
    )
    tags = ["agent", "resilience"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        provider = MockProvider(
            responses=[
                # Step 1: Divide by zero (fails)
                ToolAction(
                    action_type="tool",
                    tool_name="calculator",
                    arguments={"expression": "100 / 0"},
                    rationale="Initial attempt",
                ),
                # Step 2: Corrects expression
                ToolAction(
                    action_type="tool",
                    tool_name="calculator",
                    arguments={"expression": "100 / 5"},
                    rationale="Corrected denominator",
                ),
                # Step 3: Conclude
                FinalAction(
                    action_type="final",
                    final_response="100 divided by 5 is 20.",
                ),
            ]
        )

        agent = Agent(engine=env.engine, provider=provider)
        result = await agent.run("Perform division task")

        env.assertions.assert_agent_status(result.status, AgentStatus.COMPLETED)
        env.assertions.record(
            name="recovered_after_failure",
            passed=result.failed_tool_count == 1 and result.successful_tool_count == 1,
            expected="1 fail, 1 success",
            actual=f"{result.failed_tool_count} fail, {result.successful_tool_count} success",
        )


class AgentIterationLimitScenario(BaseScenario):
    scenario_id = "agt_04_iteration_limit"
    name = "Agent Iteration Limit Enforcement"
    category = ScenarioCategory.AGENT
    severity = ScenarioSeverity.HIGH
    description = "Verify agent stops cleanly when max_iterations is reached without resolution."
    tags = ["agent", "limits"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        # Provider that loops indefinitely
        provider = MockProvider(
            default_decision=ToolAction(
                action_type="tool",
                tool_name="calculator",
                arguments={"expression": "1 + 1"},
                rationale="Infinite loop",
            )
        )

        agent = Agent(engine=env.engine, provider=provider, max_iterations=3)
        result = await agent.run("Loop task")

        env.assertions.assert_agent_status(result.status, AgentStatus.ITERATION_LIMIT_REACHED)
        env.assertions.record(
            name="stopped_at_max_iterations",
            passed=result.iterations == 3,
            expected=3,
            actual=result.iterations,
        )


class AgentLoopBehaviorDetectionScenario(BaseScenario):
    scenario_id = "agt_05_loop_behavior_detection"
    name = "Behavioral Loop Pattern Detection"
    category = ScenarioCategory.LOOP
    severity = ScenarioSeverity.MEDIUM
    description = (
        "Verify behavior detector generates FG-LOOP-001 diagnostic when identical calls occur."
    )
    tags = ["agent", "behavior", "observability"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        provider = MockProvider(
            responses=[
                ToolAction(
                    action_type="tool",
                    tool_name="calculator",
                    arguments={"expression": "42"},
                    rationale="R1",
                ),
                ToolAction(
                    action_type="tool",
                    tool_name="calculator",
                    arguments={"expression": "42"},
                    rationale="R2",
                ),
                ToolAction(
                    action_type="tool",
                    tool_name="calculator",
                    arguments={"expression": "42"},
                    rationale="R3",
                ),
                FinalAction(action_type="final", final_response="Concluded loop"),
            ]
        )

        agent = Agent(engine=env.engine, provider=provider)
        result = await agent.run("Repeat call task")

        diagnostics = env.observability.get_diagnostics(task_id=result.task_id)
        codes = [d.code for d in diagnostics]

        env.assertions.record(
            name="loop_diagnostic_emitted",
            passed="FG-LOOP-001" in codes,
            expected="FG-LOOP-001 in diagnostics",
            actual=codes,
        )
