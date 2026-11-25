from __future__ import annotations

from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.evaluation.models import ScenarioCategory, ScenarioSeverity
from forgeguard.evaluation.scenarios.base import BaseScenario, ScenarioEnvironment
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.persistence.exceptions import (
    IdempotencyConflictError,
)
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import ToolExecutionRecord, ToolExecutionStatus
from forgeguard.persistence.recovery import RecoveryEngine
from forgeguard.persistence.repository import serialize_json, utc_iso_now


class RecoveryAfterCheckpointScenario(BaseScenario):
    scenario_id = "rec_01_checkpoint_resume"
    name = "Crash Recovery After Checkpoint"
    category = ScenarioCategory.RECOVERY
    severity = ScenarioSeverity.CRITICAL
    description = (
        "Recover task after process restart and resume remaining tools "
        "without repeating completed ones."
    )
    tags = ["recovery", "durability", "idempotency"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        task = Task(task_id="t-rec-01", description="Multi-step checkpoint test")
        call_1 = ToolCall(tool_name="calculator", arguments={"expression": "10 * 2"}, call_id="c1")
        call_2 = ToolCall(tool_name="calculator", arguments={"expression": "20 * 2"}, call_id="c2")

        # Step 1: Execute call_1 in first process
        session1 = await env.engine.create_session(task)
        out1 = await session1.execute_tool(call_1)
        env.assertions.record(
            name="step_1_completed",
            passed=out1.success and out1.output.get("result") == 20,
            expected=20,
            actual=out1.output,
        )

        # Simulate crash: close persistence
        await env.persistence.close()

        # Step 2: Fresh process restarts and recovers
        reopened_persistence = PersistenceManager(db_path=env.db_path)
        await reopened_persistence.initialize()
        recovery = RecoveryEngine(reopened_persistence)
        report = await recovery.recover_task("t-rec-01")

        env.assertions.record(
            name="can_resume_safely",
            passed=report.can_resume_safely is True,
            expected=True,
            actual=report.can_resume_safely,
        )
        env.assertions.record(
            name="completed_calls_tracked",
            passed="c1" in report.completed_calls,
            expected=["c1"],
            actual=list(report.completed_calls),
        )

        # Resume engine execution
        engine2 = ExecutionEngine(
            registry=env.registry,
            policy_engine=env.policy_engine,
            budget=env.budget,
            persistence=reopened_persistence,
        )
        resumed_result = await engine2.resume("t-rec-01", [call_1, call_2])

        env.assertions.assert_task_status(resumed_result.status, TaskStatus.COMPLETED)
        env.assertions.record(
            name="both_outputs_present",
            passed="step_0" in resumed_result.outputs and "step_1" in resumed_result.outputs,
            expected=["step_0", "step_1"],
            actual=list(resumed_result.outputs.keys()),
        )
        await reopened_persistence.close()


class RecoveryUncertainMidToolScenario(BaseScenario):
    scenario_id = "rec_02_uncertain_tool_blocked"
    name = "Uncertain Tool Execution Blocks Automatic Resume"
    category = ScenarioCategory.RECOVERY
    severity = ScenarioSeverity.CRITICAL
    description = (
        "Verify that an interrupted external tool is marked UNCERTAIN "
        "and prevents unsafe duplicate execution."
    )
    tags = ["recovery", "safety", "uncertainty"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        task_id = "t-rec-uncertain"
        from forgeguard.persistence.models import TaskRecord

        await env.persistence.repository.create_task(
            TaskRecord(
                task_id=task_id,
                description="Crash mid external side-effect",
                status="running",
                created_at=utc_iso_now(),
                last_updated_at=utc_iso_now(),
            )
        )
        await env.persistence.repository.record_tool_intent(
            ToolExecutionRecord(
                task_id=task_id,
                tool_call_id="call-side-effect",
                tool_name="calculator",
                sequence_number=0,
                arguments_json=serialize_json({"expression": "10+10"}),
                status=ToolExecutionStatus.UNCERTAIN.value,
                idempotency_key="key-se",
                start_time=utc_iso_now(),
            )
        )

        recovery = RecoveryEngine(env.persistence)
        report = await recovery.recover_task(task_id)

        env.assertions.record(
            name="recovery_detects_uncertainty",
            passed=not report.can_resume_safely and "call-side-effect" in report.uncertain_calls,
            expected=True,
            actual=report.can_resume_safely,
        )

        # Attempting resume must fail safely
        resumed = await env.engine.resume(
            task_id,
            [ToolCall("calculator", {"expression": "10+10"}, call_id="call-side-effect")],
        )
        resume_blocked = resumed.status == TaskStatus.FAILED and "UnrecoverableTaskError" in (
            resumed.error or ""
        )

        env.assertions.record(
            name="resume_safely_blocked",
            passed=resume_blocked,
            expected=True,
            actual=resumed.status.value,
        )


class RecoveryIdempotencyConflictScenario(BaseScenario):
    scenario_id = "rec_03_idempotency_conflict"
    name = "Idempotency Conflict Rejection"
    category = ScenarioCategory.RECOVERY
    severity = ScenarioSeverity.HIGH
    description = "Detect and reject tool call replay with identical ID but modified arguments."
    tags = ["recovery", "idempotency"]

    async def execute(self, env: ScenarioEnvironment) -> None:
        task = Task(description="Idempotency test")
        call_orig = ToolCall(
            tool_name="calculator", arguments={"expression": "10 + 10"}, call_id="idemp-call"
        )
        call_modified = ToolCall(
            tool_name="calculator", arguments={"expression": "999 + 999"}, call_id="idemp-call"
        )

        # Run original
        session = await env.engine.create_session(task)
        await session.execute_tool(call_orig)

        conflict_detected = False
        try:
            # Replaying with modified arguments must raise IdempotencyConflictError
            await env.persistence.on_tool_intent(task.task_id, call_modified, 1)
        except IdempotencyConflictError:
            conflict_detected = True

        env.assertions.record(
            name="idempotency_conflict_detected",
            passed=conflict_detected,
            expected=True,
            actual=conflict_detected,
        )
