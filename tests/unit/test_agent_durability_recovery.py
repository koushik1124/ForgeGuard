from __future__ import annotations

from pathlib import Path

import pytest

from forgeguard.agent.models import AgentStatus, FinalAction
from forgeguard.agent.orchestrator import Agent
from forgeguard.agent.providers.mock import MockProvider
from forgeguard.agent.tools.calculator import create_calculator_tool
from forgeguard.agent.tools.text_analysis import create_text_analysis_tool
from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.persistence.exceptions import UnrecoverableTaskError
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import ToolExecutionRecord, ToolExecutionStatus
from forgeguard.persistence.repository import serialize_json, utc_iso_now
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry


@pytest.fixture
def agent_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(create_calculator_tool())
    registry.register(create_text_analysis_tool())
    return registry


@pytest.mark.asyncio
async def test_agent_durability_and_resume(tmp_path: Path, agent_registry: ToolRegistry) -> None:
    db_path = tmp_path / "agent_persist.db"
    persistence = PersistenceManager(db_path=db_path)
    await persistence.initialize()

    policy = PolicyEngine(Policy(default_allow=True))
    budget = ExecutionBudget(max_tool_calls=5)

    engine1 = ExecutionEngine(
        registry=agent_registry,
        policy_engine=policy,
        budget=budget,
        persistence=persistence,
    )

    # Run 1: Agent performs step 1 (calculator), then session is left unfinished
    task1 = Task(task_id="t-durable-agent", description="Durable math")
    session1 = await engine1.create_session(task1)
    call1 = ToolCall(
        tool_name="calculator",
        arguments={"expression": "50 * 2"},
        call_id="c-mult",
    )
    outcome1 = await session1.execute_tool(call1)
    assert outcome1.success is True
    assert outcome1.output == {"expression": "50 * 2", "result": 100}
    await persistence.close()

    # Run 2: Reopen persistence, resume agent task!
    persistence2 = PersistenceManager(db_path=db_path)
    await persistence2.initialize()

    engine2 = ExecutionEngine(
        registry=agent_registry,
        policy_engine=policy,
        budget=budget,
        persistence=persistence2,
    )

    # Provider for resumed run: observes recovered output, concludes with final answer
    provider2 = MockProvider(
        responses=[
            FinalAction(
                action_type="final",
                final_response="50 multiplied by 2 is 100.",
                summary="Concluded after recovery",
            )
        ]
    )

    agent2 = Agent(engine=engine2, provider=provider2)
    result = await agent2.resume("t-durable-agent")

    assert result.status == AgentStatus.COMPLETED
    assert result.final_response == "50 multiplied by 2 is 100."
    assert result.budget_summary["tool_calls_reserved"] >= 1

    await persistence2.close()


@pytest.mark.asyncio
async def test_agent_resume_blocks_uncertain_call(
    tmp_path: Path, agent_registry: ToolRegistry
) -> None:
    db_path = tmp_path / "agent_uncertain.db"
    persistence = PersistenceManager(db_path=db_path)
    await persistence.initialize()

    # Pre-populate task with an UNCERTAIN tool execution
    task_id = "t-uncertain-agent"
    from forgeguard.persistence.models import TaskRecord

    await persistence.repository.create_task(
        TaskRecord(
            task_id=task_id,
            description="Interrupted task",
            status="running",
            created_at=utc_iso_now(),
            last_updated_at=utc_iso_now(),
        )
    )
    await persistence.repository.record_tool_intent(
        ToolExecutionRecord(
            task_id=task_id,
            tool_call_id="call-unc",
            tool_name="calculator",
            sequence_number=0,
            arguments_json=serialize_json({"expression": "10+10"}),
            status=ToolExecutionStatus.UNCERTAIN.value,
            idempotency_key="key-unc",
            start_time=utc_iso_now(),
        )
    )

    policy = PolicyEngine(Policy(default_allow=True))
    engine = ExecutionEngine(
        registry=agent_registry,
        policy_engine=policy,
        persistence=persistence,
    )

    agent = Agent(engine=engine, provider=MockProvider())

    with pytest.raises(UnrecoverableTaskError, match="uncertain"):
        await agent.resume(task_id)

    await persistence.close()
