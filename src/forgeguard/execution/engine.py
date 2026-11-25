from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any
from uuid import uuid4

if TYPE_CHECKING:
    from forgeguard.execution.session import ExecutionSession

from pydantic import ValidationError

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.budgets.exceptions import (
    BudgetExceededError,
    ConsecutiveFailuresExceededError,
    ExecutionTimeoutError,
    OutputSizeExceededError,
    ToolCallLimitExceededError,
)
from forgeguard.budgets.tracker import BudgetTracker, calculate_output_bytes
from forgeguard.core.enums import TaskStatus
from forgeguard.core.exceptions import ToolNotFoundError
from forgeguard.core.task import Task
from forgeguard.events.event import ExecutionEvent
from forgeguard.execution.context import ExecutionContext
from forgeguard.execution.result import ExecutionResult
from forgeguard.execution.tool_call import ToolCall
from forgeguard.observability.manager import ObservabilityManager
from forgeguard.persistence.exceptions import (
    IdempotencyConflictError,
    PersistenceError,
    RecordNotFoundError,
    UnrecoverableTaskError,
)
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import (
    JournalEventRecord,
    ToolExecutionStatus,
)
from forgeguard.persistence.recovery import RecoveryEngine
from forgeguard.persistence.repository import deserialize_json, serialize_json, utc_iso_now
from forgeguard.policies.policy import PolicyEngine
from forgeguard.tools.registry import ToolRegistry

logger = logging.getLogger("forgeguard.execution.engine")


class ExecutionEngine:
    def __init__(
        self,
        registry: ToolRegistry,
        policy_engine: PolicyEngine | None = None,
        budget: ExecutionBudget | None = None,
        persistence: PersistenceManager | None = None,
        observability: ObservabilityManager | None = None,
    ) -> None:
        self.registry = registry
        self.policy_engine = policy_engine or PolicyEngine()
        self.budget = budget or ExecutionBudget()
        self.persistence = persistence
        self.observability = observability

    async def _notify_obs(self, func_name: str, *args: Any, **kwargs: Any) -> None:
        if self.observability is not None:
            try:
                fn = getattr(self.observability, func_name, None)
                if fn is not None:
                    res = fn(*args, **kwargs)
                    if asyncio.iscoroutine(res):
                        await res
            except Exception as exc:
                logger.warning("Observability hook %s exception: %s", func_name, exc)

    def _record_obs_event(self, task_id: str, event: ExecutionEvent) -> None:
        if self.observability is not None:
            try:
                self.observability.record_event_for_timeline(task_id, event)
            except Exception as exc:
                logger.warning("Observability event recording exception: %s", exc)

    async def execute(
        self,
        task: Task,
        tool_calls: list[ToolCall],
        budget: ExecutionBudget | None = None,
    ) -> ExecutionResult:
        active_budget = budget or self.budget
        tracker = BudgetTracker(active_budget)
        context = ExecutionContext(task=task, tracker=tracker)

        await self._notify_obs("on_task_start", task)

        return await self._execute_core(
            task=task,
            tool_calls=tool_calls,
            active_budget=active_budget,
            tracker=tracker,
            context=context,
            completed_calls=[],
            start_step=0,
            is_resume=False,
        )

    async def resume(
        self,
        task_id: str,
        tool_calls: list[ToolCall],
        budget: ExecutionBudget | None = None,
    ) -> ExecutionResult:
        """Resume an interrupted task using persisted state and checkpoints."""
        if self.persistence is None:
            raise PersistenceError("Cannot resume task without configured persistence manager.")

        await self.persistence.initialize()
        recovery_engine = RecoveryEngine(self.persistence)
        rec_start_mono = time.monotonic()
        report = await recovery_engine.recover_task(task_id)
        rec_dur_ms = max(0.0, (time.monotonic() - rec_start_mono) * 1000.0)

        task_record = await self.persistence.repository.get_task(task_id)
        if task_record is None:
            raise RecordNotFoundError(f"Task with ID '{task_id}' not found.")

        task = Task(
            task_id=task_record.task_id,
            description=task_record.description,
            status=TaskStatus(task_record.status),
            metadata=deserialize_json(task_record.metadata_json),
        )

        error_msg = "; ".join(report.warnings) or "Task cannot be safely resumed."
        await self._notify_obs(
            "on_recovery",
            task_id,
            report.can_resume_safely,
            rec_dur_ms,
            bool(report.uncertain_calls),
            report.can_resume_safely,
            error_msg if not report.can_resume_safely else None,
            report.warnings,
        )

        if not report.can_resume_safely:
            if task.status in (TaskStatus.CREATED, TaskStatus.RUNNING):
                task.transition(TaskStatus.FAILED)
                await self.persistence.on_task_failed(task, "UnrecoverableTaskError", error_msg)
                await self._notify_obs("on_task_failed", task, "UnrecoverableTaskError", error_msg)

            events = await self.persistence.load_execution_events(task_id)
            return ExecutionResult(
                task_id=task.task_id,
                status=task.status,
                outputs=report.partial_outputs,
                events=events,
                error=f"UnrecoverableTaskError: {error_msg}",
            )

        active_budget = budget or self.budget
        tracker = BudgetTracker(active_budget)
        if report.budget_snapshot is not None:
            tracker.restore_from_snapshot(report.budget_snapshot)
        else:
            tracker.start()

        context = ExecutionContext(
            task=task,
            outputs=dict(report.partial_outputs),
            tracker=tracker,
        )

        # Check budget limits upon resume before proceeding
        if tracker.is_deadline_exceeded() or tracker.remaining_seconds <= 0:
            reason = (
                f"Execution deadline exhausted upon resume: {tracker.elapsed_seconds:.4f}s "
                f">= {active_budget.max_execution_seconds:.4f}s"
            )
            await self.persistence.on_budget_exceeded(
                task_id,
                report.reconstructed_position,
                "",
                "max_execution_seconds",
                reason,
                tracker.snapshot(),
            )
            if task.status == TaskStatus.RUNNING:
                task.transition(TaskStatus.FAILED)
            await self.persistence.on_task_failed(task, "ExecutionTimeoutError", reason)
            await self._notify_obs(
                "on_budget_exceeded",
                task_id,
                "max_execution_seconds",
                reason,
                tracker.snapshot(),
            )
            await self._notify_obs("on_task_failed", task, "ExecutionTimeoutError", reason)
            events = await self.persistence.load_execution_events(task_id)
            return ExecutionResult(
                task_id=task_id,
                status=task.status,
                outputs=context.outputs,
                events=events,
                error=f"ExecutionTimeoutError: {reason}",
            )

        if not tracker.can_reserve_tool_call() and report.reconstructed_position < len(tool_calls):
            reason = (
                f"Tool call limit reached upon resume: "
                f"{tracker.tool_calls_reserved} >= {active_budget.max_tool_calls}"
            )
            await self.persistence.on_budget_exceeded(
                task_id,
                report.reconstructed_position,
                "",
                "max_tool_calls",
                reason,
                tracker.snapshot(),
            )
            if task.status == TaskStatus.RUNNING:
                task.transition(TaskStatus.FAILED)
            await self.persistence.on_task_failed(task, "ToolCallLimitExceededError", reason)
            await self._notify_obs(
                "on_budget_exceeded",
                task_id,
                "max_tool_calls",
                reason,
                tracker.snapshot(),
            )
            await self._notify_obs("on_task_failed", task, "ToolCallLimitExceededError", reason)
            events = await self.persistence.load_execution_events(task_id)
            return ExecutionResult(
                task_id=task_id,
                status=task.status,
                outputs=context.outputs,
                events=events,
                error=f"ToolCallLimitExceededError: {reason}",
            )

        await self._notify_obs("on_task_start", task)

        # Journal task_resumed event
        seq = await self.persistence.repository.get_next_event_sequence(task_id)
        await self.persistence.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq,
                event_type="task_resumed",
                timestamp=utc_iso_now(),
                payload_json=serialize_json(
                    {
                        "task_id": task_id,
                        "reconstructed_position": report.reconstructed_position,
                        "completed_calls": report.completed_calls,
                    }
                ),
            )
        )

        return await self._execute_core(
            task=task,
            tool_calls=tool_calls,
            active_budget=active_budget,
            tracker=tracker,
            context=context,
            completed_calls=list(report.completed_calls),
            start_step=report.reconstructed_position,
            is_resume=True,
        )

    async def create_session(
        self,
        task: Task,
        budget: ExecutionBudget | None = None,
    ) -> ExecutionSession:
        """Create a new governed execution session for iterative tool execution."""
        from forgeguard.execution.session import ExecutionSession

        active_budget = budget or self.budget
        tracker = BudgetTracker(active_budget)
        context = ExecutionContext(task=task, tracker=tracker)

        if task.status != TaskStatus.RUNNING:
            task.transition(TaskStatus.RUNNING)

        tracker.start()

        session = ExecutionSession(
            engine=self,
            task=task,
            active_budget=active_budget,
            tracker=tracker,
            context=context,
            completed_calls=[],
            step_counter=0,
            is_resumed=False,
        )

        session.add_event(ExecutionEvent.create("task_started", {"task_id": task.task_id}))
        session.add_event(
            ExecutionEvent.create(
                "budget_initialized",
                {
                    "task_id": task.task_id,
                    "max_tool_calls": active_budget.max_tool_calls,
                    "max_execution_seconds": active_budget.max_execution_seconds,
                    "max_consecutive_failures": active_budget.max_consecutive_failures,
                    "max_output_bytes": active_budget.max_output_bytes,
                    "max_tool_duration_seconds": active_budget.max_tool_duration_seconds,
                },
            )
        )

        await self._notify_obs("on_task_start", task)

        if self.persistence is not None:
            await self.persistence.initialize()
            await self.persistence.on_task_start(
                task,
                {
                    "max_tool_calls": active_budget.max_tool_calls,
                    "max_execution_seconds": active_budget.max_execution_seconds,
                    "max_consecutive_failures": active_budget.max_consecutive_failures,
                    "max_output_bytes": active_budget.max_output_bytes,
                    "max_tool_duration_seconds": active_budget.max_tool_duration_seconds,
                },
            )

        return session

    async def resume_session(
        self,
        task_id: str,
        budget: ExecutionBudget | None = None,
    ) -> ExecutionSession:
        """Resume an interrupted task into an active governed execution session."""
        from forgeguard.execution.session import ExecutionSession

        if self.persistence is None:
            raise PersistenceError("Cannot resume task without configured persistence manager.")

        await self.persistence.initialize()
        recovery_engine = RecoveryEngine(self.persistence)
        rec_start_mono = time.monotonic()
        report = await recovery_engine.recover_task(task_id)
        rec_dur_ms = max(0.0, (time.monotonic() - rec_start_mono) * 1000.0)

        task_record = await self.persistence.repository.get_task(task_id)
        if task_record is None:
            raise RecordNotFoundError(f"Task with ID '{task_id}' not found.")

        task = Task(
            task_id=task_record.task_id,
            description=task_record.description,
            status=TaskStatus(task_record.status),
            metadata=deserialize_json(task_record.metadata_json),
        )

        error_msg = "; ".join(report.warnings) or "Task cannot be safely resumed."
        await self._notify_obs(
            "on_recovery",
            task_id,
            report.can_resume_safely,
            rec_dur_ms,
            bool(report.uncertain_calls),
            report.can_resume_safely,
            error_msg if not report.can_resume_safely else None,
            report.warnings,
        )

        if not report.can_resume_safely:
            if task.status in (TaskStatus.CREATED, TaskStatus.RUNNING):
                task.transition(TaskStatus.FAILED)
                await self.persistence.on_task_failed(task, "UnrecoverableTaskError", error_msg)
                await self._notify_obs("on_task_failed", task, "UnrecoverableTaskError", error_msg)
            raise UnrecoverableTaskError(error_msg)

        active_budget = budget or self.budget
        tracker = BudgetTracker(active_budget)
        if report.budget_snapshot is not None:
            tracker.restore_from_snapshot(report.budget_snapshot)
        tracker.start()

        context = ExecutionContext(task=task, tracker=tracker)
        context.outputs.update(report.partial_outputs)

        if task.status != TaskStatus.RUNNING:
            task.transition(TaskStatus.RUNNING)

        await self._notify_obs("on_task_start", task)

        # Journal task_resumed event
        seq = await self.persistence.repository.get_next_event_sequence(task_id)
        await self.persistence.repository.append_event(
            JournalEventRecord(
                event_id=str(uuid4()),
                task_id=task_id,
                sequence_number=seq,
                event_type="task_resumed",
                timestamp=utc_iso_now(),
                payload_json=serialize_json(
                    {
                        "task_id": task_id,
                        "reconstructed_position": report.reconstructed_position,
                        "completed_calls": report.completed_calls,
                    }
                ),
            )
        )

        session = ExecutionSession(
            engine=self,
            task=task,
            active_budget=active_budget,
            tracker=tracker,
            context=context,
            completed_calls=list(report.completed_calls),
            step_counter=report.reconstructed_position,
            is_resumed=True,
        )

        session.add_event(
            ExecutionEvent.create(
                "task_resumed",
                {
                    "task_id": task_id,
                    "reconstructed_position": report.reconstructed_position,
                    "completed_calls": list(report.completed_calls),
                },
            )
        )

        return session

    async def _execute_core(
        self,
        task: Task,
        tool_calls: list[ToolCall],
        active_budget: ExecutionBudget,
        tracker: BudgetTracker,
        context: ExecutionContext,
        completed_calls: list[str],
        start_step: int = 0,
        is_resume: bool = False,
    ) -> ExecutionResult:
        events: list[ExecutionEvent] = []

        def add_event(ev: ExecutionEvent) -> ExecutionEvent:
            events.append(ev)
            self._record_obs_event(task.task_id, ev)
            return ev

        try:
            # 1. Transition task to RUNNING (if not already RUNNING)
            if task.status != TaskStatus.RUNNING:
                task.transition(TaskStatus.RUNNING)

            # 2. Emit task_started / budget_initialized (if not a resume)
            if not is_resume:
                tracker.start()
                add_event(ExecutionEvent.create("task_started", {"task_id": task.task_id}))
                add_event(
                    ExecutionEvent.create(
                        "budget_initialized",
                        {
                            "task_id": task.task_id,
                            "budget": {
                                "max_tool_calls": active_budget.max_tool_calls,
                                "max_execution_seconds": (active_budget.max_execution_seconds),
                                "max_consecutive_failures": (
                                    active_budget.max_consecutive_failures
                                ),
                                "max_output_bytes": active_budget.max_output_bytes,
                                "max_tool_duration_seconds": (
                                    active_budget.max_tool_duration_seconds
                                ),
                            },
                        },
                    )
                )
                if self.persistence is not None:
                    await self.persistence.on_task_start(
                        task,
                        {
                            "max_tool_calls": active_budget.max_tool_calls,
                            "max_execution_seconds": active_budget.max_execution_seconds,
                            "max_consecutive_failures": (active_budget.max_consecutive_failures),
                            "max_output_bytes": active_budget.max_output_bytes,
                            "max_tool_duration_seconds": (active_budget.max_tool_duration_seconds),
                        },
                    )

            has_step_failure = False
            last_failure_reason: str | None = None

            # 4. For each tool call:
            for index, call in enumerate(tool_calls):
                call_id = call.call_id or (
                    self.persistence.generate_call_id(task.task_id, index, call.tool_name)
                    if self.persistence
                    else None
                )

                # Check if this call was already completed
                if (
                    call_id is not None and call_id in completed_calls
                ) or f"step_{index}" in context.outputs:
                    # Skip already completed tool calls on resume
                    continue

                if self.persistence is not None:
                    # Record tool intent and verify idempotency
                    intent = await self.persistence.on_tool_intent(task.task_id, call, index)
                    if intent.status == ToolExecutionStatus.COMPLETED.value:
                        if intent.result_json is not None:
                            context.outputs[f"step_{index}"] = deserialize_json(intent.result_json)
                        if call_id and call_id not in completed_calls:
                            completed_calls.append(call_id)
                        continue
                    if intent.status == ToolExecutionStatus.UNCERTAIN.value:
                        raise UnrecoverableTaskError(
                            f"Tool call '{call_id}' is in uncertain state and cannot execute."
                        )

                # 4a. Check overall task deadline before proceeding.
                if tracker.is_deadline_exceeded() or tracker.remaining_seconds <= 0:
                    reason = (
                        f"Execution deadline exceeded: elapsed {tracker.elapsed_seconds:.4f}s "
                        f">= {active_budget.max_execution_seconds:.4f}s"
                    )
                    add_event(
                        ExecutionEvent.create(
                            "budget_exceeded",
                            {
                                "task_id": task.task_id,
                                "step": index,
                                "tool_name": call.tool_name,
                                "limit": "max_execution_seconds",
                                "reason": reason,
                                **tracker.snapshot(),
                            },
                        )
                    )
                    await self._notify_obs(
                        "on_budget_exceeded",
                        task.task_id,
                        "max_execution_seconds",
                        reason,
                        tracker.snapshot(),
                        call.tool_name,
                        call_id,
                    )
                    if self.persistence is not None:
                        await self.persistence.on_budget_exceeded(
                            task.task_id,
                            index,
                            call.tool_name,
                            "max_execution_seconds",
                            reason,
                            tracker.snapshot(),
                        )
                    raise ExecutionTimeoutError(reason)

                # 4b. Resolve tool existence before authorization.
                tool = self.registry.get(call.tool_name)

                # 4c. Evaluate authorization policy.
                decision = self.policy_engine.evaluate(
                    tool_name=call.tool_name,
                    metadata={
                        "task_id": task.task_id,
                        "step": index,
                        "call_id": call_id,
                    },
                )

                add_event(
                    ExecutionEvent.create(
                        "policy_decision",
                        {
                            "tool_name": call.tool_name,
                            "allowed": decision.allowed,
                            "reason": decision.reason,
                            "matched_rule": decision.matched_rule,
                            "task_id": task.task_id,
                            "step": index,
                            "call_id": call_id,
                        },
                    )
                )
                await self._notify_obs(
                    "on_policy_decision",
                    task.task_id,
                    call.tool_name,
                    call_id,
                    decision.allowed,
                    decision.reason,
                    decision.matched_rule,
                )
                if self.persistence is not None:
                    await self.persistence.on_policy_decision(
                        task.task_id,
                        index,
                        call.tool_name,
                        call_id,
                        decision.allowed,
                        decision.reason,
                        decision.matched_rule,
                    )

                # 4d. Reject unauthorized tools before execution.
                if not decision.allowed:
                    add_event(
                        ExecutionEvent.create(
                            "tool_call_rejected",
                            {
                                "tool_name": call.tool_name,
                                "reason": decision.reason,
                                "step": index,
                                "call_id": call_id,
                            },
                        )
                    )
                    if self.persistence is not None:
                        await self.persistence.on_tool_rejected(
                            task.task_id,
                            index,
                            call.tool_name,
                            call_id,
                            decision.reason,
                        )
                    raise PermissionError(decision.reason)

                # 4e. Reserve tool-call budget.
                if not tracker.can_reserve_tool_call():
                    reason = (
                        f"Tool call limit reached: "
                        f"{tracker.tool_calls_reserved} >= {active_budget.max_tool_calls}"
                    )
                    add_event(
                        ExecutionEvent.create(
                            "budget_exceeded",
                            {
                                "task_id": task.task_id,
                                "step": index,
                                "tool_name": call.tool_name,
                                "limit": "max_tool_calls",
                                "reason": reason,
                                **tracker.snapshot(),
                            },
                        )
                    )
                    await self._notify_obs(
                        "on_budget_exceeded",
                        task.task_id,
                        "max_tool_calls",
                        reason,
                        tracker.snapshot(),
                        call.tool_name,
                        call_id,
                    )
                    if self.persistence is not None:
                        await self.persistence.on_budget_exceeded(
                            task.task_id,
                            index,
                            call.tool_name,
                            "max_tool_calls",
                            reason,
                            tracker.snapshot(),
                        )
                    raise ToolCallLimitExceededError(reason)

                tracker.reserve_tool_call()

                # 4f. Calculate remaining execution time and verify deadline.
                remaining_time = tracker.remaining_seconds
                if remaining_time <= 0:
                    reason = (
                        f"Execution deadline exhausted: {tracker.elapsed_seconds:.4f}s "
                        f">= {active_budget.max_execution_seconds:.4f}s"
                    )
                    add_event(
                        ExecutionEvent.create(
                            "budget_exceeded",
                            {
                                "task_id": task.task_id,
                                "step": index,
                                "tool_name": call.tool_name,
                                "limit": "max_execution_seconds",
                                "reason": reason,
                                **tracker.snapshot(),
                            },
                        )
                    )
                    await self._notify_obs(
                        "on_budget_exceeded",
                        task.task_id,
                        "max_execution_seconds",
                        reason,
                        tracker.snapshot(),
                        call.tool_name,
                        call_id,
                    )
                    if self.persistence is not None:
                        await self.persistence.on_budget_exceeded(
                            task.task_id,
                            index,
                            call.tool_name,
                            "max_execution_seconds",
                            reason,
                            tracker.snapshot(),
                        )
                    raise ExecutionTimeoutError(reason)

                # 4g. Calculate effective timeout.
                effective_timeout = tracker.get_effective_tool_timeout()

                # 4h. Emit tool_call_started.
                add_event(
                    ExecutionEvent.create(
                        "tool_call_started",
                        {
                            "tool_name": call.tool_name,
                            "call_id": call_id,
                            "step": index,
                            "timeout": effective_timeout,
                        },
                    )
                )
                if call_id is not None:
                    await self._notify_obs(
                        "on_tool_start",
                        task.task_id,
                        call.tool_name,
                        call_id,
                        index,
                        effective_timeout,
                        call.arguments,
                    )
                if self.persistence is not None and call_id is not None:
                    await self.persistence.on_tool_started(
                        task.task_id,
                        call_id,
                        index,
                        call.tool_name,
                        effective_timeout,
                    )

                # 4i. Execute tool within timeout.
                tool_failed = False
                tool_output: Any = None
                step_error_str: str | None = None
                start_tool_time = time.monotonic()

                try:
                    tool_output = await asyncio.wait_for(
                        tool.invoke(call.arguments),
                        timeout=effective_timeout,
                    )
                except (asyncio.TimeoutError, TimeoutError) as timeout_exc:
                    tool_failed = True
                    has_step_failure = True
                    duration_seconds = time.monotonic() - start_tool_time

                    is_task_deadline_exceeded = (
                        tracker.is_deadline_exceeded()
                        or tracker.remaining_seconds <= 0
                        or effective_timeout < active_budget.max_tool_duration_seconds
                    )

                    if is_task_deadline_exceeded:
                        reason = (
                            f"Execution deadline exceeded during tool '{call.tool_name}': "
                            f"{tracker.elapsed_seconds:.4f}s >= "
                            f"{active_budget.max_execution_seconds:.4f}s"
                        )
                        add_event(
                            ExecutionEvent.create(
                                "budget_exceeded",
                                {
                                    "task_id": task.task_id,
                                    "step": index,
                                    "tool_name": call.tool_name,
                                    "limit": "max_execution_seconds",
                                    "reason": reason,
                                    **tracker.snapshot(),
                                },
                            )
                        )
                        await self._notify_obs(
                            "on_budget_exceeded",
                            task.task_id,
                            "max_execution_seconds",
                            reason,
                            tracker.snapshot(),
                            call.tool_name,
                            call_id,
                        )
                        if self.persistence is not None:
                            await self.persistence.on_budget_exceeded(
                                task.task_id,
                                index,
                                call.tool_name,
                                "max_execution_seconds",
                                reason,
                                tracker.snapshot(),
                            )
                        raise ExecutionTimeoutError(reason) from timeout_exc

                    add_event(
                        ExecutionEvent.create(
                            "tool_timeout",
                            {
                                "task_id": task.task_id,
                                "tool_name": call.tool_name,
                                "call_id": call_id,
                                "step": index,
                                "timeout_seconds": effective_timeout,
                                "elapsed_seconds": round(tracker.elapsed_seconds, 4),
                            },
                        )
                    )
                    step_error_str = (
                        f"ToolTimeoutError: Tool '{call.tool_name}' timed out after "
                        f"{effective_timeout:.2f}s"
                    )
                    last_failure_reason = step_error_str
                    tracker.record_tool_failure(is_timeout=True)

                    if call_id is not None:
                        await self._notify_obs(
                            "on_tool_failed",
                            task.task_id,
                            call.tool_name,
                            call_id,
                            index,
                            duration_seconds,
                            step_error_str,
                            True,
                            effective_timeout,
                            call.arguments,
                        )

                    if self.persistence is not None and call_id is not None:
                        await self.persistence.on_tool_failed(
                            task.task_id,
                            call_id,
                            index,
                            call.tool_name,
                            step_error_str,
                            duration_seconds,
                            is_timeout=True,
                            budget_snapshot=tracker.snapshot(),
                            effective_timeout=effective_timeout,
                        )

                except Exception as exc:
                    tool_failed = True
                    has_step_failure = True
                    duration_seconds = time.monotonic() - start_tool_time
                    step_error_str = f"{type(exc).__name__}: {exc}"
                    last_failure_reason = step_error_str
                    tracker.record_tool_failure(is_timeout=False)

                    if call_id is not None:
                        await self._notify_obs(
                            "on_tool_failed",
                            task.task_id,
                            call.tool_name,
                            call_id,
                            index,
                            duration_seconds,
                            step_error_str,
                            False,
                            None,
                            call.arguments,
                        )

                    if self.persistence is not None and call_id is not None:
                        await self.persistence.on_tool_failed(
                            task.task_id,
                            call_id,
                            index,
                            call.tool_name,
                            step_error_str,
                            duration_seconds,
                            is_timeout=False,
                            budget_snapshot=tracker.snapshot(),
                        )

                # 4j. Handle timeout/failure.
                if tool_failed:
                    add_event(
                        ExecutionEvent.create(
                            "tool_call_completed",
                            {
                                "tool_name": call.tool_name,
                                "call_id": call_id,
                                "step": index,
                                "status": "failure",
                                "error": step_error_str,
                            },
                        )
                    )
                    add_event(
                        ExecutionEvent.create(
                            "budget_updated",
                            {
                                "task_id": task.task_id,
                                "step": index,
                                "tool_name": call.tool_name,
                                "consumed_tool_calls": tracker.tool_calls_reserved,
                                "remaining_tool_calls": tracker.remaining_tool_calls,
                                "output_bytes_consumed": tracker.cumulative_output_bytes,
                                "remaining_output_budget": tracker.remaining_output_bytes,
                                "elapsed_seconds": round(tracker.elapsed_seconds, 6),
                                "remaining_seconds": round(tracker.remaining_seconds, 6),
                                "failure_count": tracker.consecutive_failures,
                                **tracker.snapshot(),
                            },
                        )
                    )
                    await self._notify_obs("on_budget_updated", task.task_id, tracker.snapshot())

                    if tracker.is_consecutive_failures_exceeded():
                        reason = (
                            f"Consecutive tool failure limit reached: "
                            f"{tracker.consecutive_failures} >= "
                            f"{active_budget.max_consecutive_failures}"
                        )
                        add_event(
                            ExecutionEvent.create(
                                "budget_exceeded",
                                {
                                    "task_id": task.task_id,
                                    "step": index,
                                    "tool_name": call.tool_name,
                                    "limit": "max_consecutive_failures",
                                    "reason": reason,
                                    **tracker.snapshot(),
                                },
                            )
                        )
                        await self._notify_obs(
                            "on_budget_exceeded",
                            task.task_id,
                            "max_consecutive_failures",
                            reason,
                            tracker.snapshot(),
                            call.tool_name,
                            call_id,
                        )
                        if self.persistence is not None:
                            await self.persistence.on_budget_exceeded(
                                task.task_id,
                                index,
                                call.tool_name,
                                "max_consecutive_failures",
                                reason,
                                tracker.snapshot(),
                            )
                        raise ConsecutiveFailuresExceededError(reason)

                    continue

                duration_seconds = time.monotonic() - start_tool_time

                # 4k. Validate returned output size.
                output_bytes = calculate_output_bytes(tool_output)
                if tracker.cumulative_output_bytes + output_bytes > active_budget.max_output_bytes:
                    reason = (
                        f"Output size limit exceeded: adding {output_bytes} bytes to "
                        f"{tracker.cumulative_output_bytes} bytes exceeds maximum of "
                        f"{active_budget.max_output_bytes} bytes"
                    )
                    add_event(
                        ExecutionEvent.create(
                            "budget_exceeded",
                            {
                                "task_id": task.task_id,
                                "step": index,
                                "tool_name": call.tool_name,
                                "limit": "max_output_bytes",
                                "reason": reason,
                                **tracker.snapshot(),
                            },
                        )
                    )
                    await self._notify_obs(
                        "on_budget_exceeded",
                        task.task_id,
                        "max_output_bytes",
                        reason,
                        tracker.snapshot(),
                        call.tool_name,
                        call_id,
                    )
                    if self.persistence is not None:
                        await self.persistence.on_budget_exceeded(
                            task.task_id,
                            index,
                            call.tool_name,
                            "max_output_bytes",
                            reason,
                            tracker.snapshot(),
                        )
                    raise OutputSizeExceededError(reason)

                # 4l. Store accepted output.
                context.outputs[f"step_{index}"] = tool_output

                # 4m. Update counters
                tracker.record_tool_success(output_bytes)
                if call_id is not None and call_id not in completed_calls:
                    completed_calls.append(call_id)

                # 4n. Emit tool_call_completed and budget_updated.
                add_event(
                    ExecutionEvent.create(
                        "tool_call_completed",
                        {
                            "tool_name": call.tool_name,
                            "call_id": call_id,
                            "step": index,
                            "status": "success",
                            "output": tool_output,
                        },
                    )
                )
                add_event(
                    ExecutionEvent.create(
                        "budget_updated",
                        {
                            "task_id": task.task_id,
                            "step": index,
                            "tool_name": call.tool_name,
                            "consumed_tool_calls": tracker.tool_calls_reserved,
                            "remaining_tool_calls": tracker.remaining_tool_calls,
                            "output_bytes_consumed": tracker.cumulative_output_bytes,
                            "remaining_output_budget": tracker.remaining_output_bytes,
                            "elapsed_seconds": round(tracker.elapsed_seconds, 6),
                            "remaining_seconds": round(tracker.remaining_seconds, 6),
                            "failure_count": tracker.consecutive_failures,
                            **tracker.snapshot(),
                        },
                    )
                )

                if call_id is not None:
                    await self._notify_obs(
                        "on_tool_completed",
                        task.task_id,
                        call.tool_name,
                        call_id,
                        index,
                        duration_seconds,
                        tool_output,
                        call.arguments,
                    )
                await self._notify_obs("on_budget_updated", task.task_id, tracker.snapshot())

                if self.persistence is not None and call_id is not None:
                    await self.persistence.on_tool_completed(
                        task=task,
                        tool_call_id=call_id,
                        step=index,
                        tool_name=call.tool_name,
                        output=tool_output,
                        duration_seconds=duration_seconds,
                        budget_snapshot=tracker.snapshot(),
                        partial_outputs=context.outputs,
                        completed_call_ids=completed_calls,
                    )
                    await self._notify_obs(
                        "on_checkpoint_created",
                        task.task_id,
                        f"chk-{task.task_id}-{index}",
                        index + 1,
                    )

            # 5. Transition task to COMPLETED if all steps succeed.
            if has_step_failure:
                task.transition(TaskStatus.FAILED)
                add_event(
                    ExecutionEvent.create(
                        "task_failed",
                        {
                            "task_id": task.task_id,
                            "error_type": "ToolExecutionError",
                            "error": last_failure_reason or "One or more tool calls failed",
                        },
                    )
                )
                await self._notify_obs(
                    "on_task_failed",
                    task,
                    "ToolExecutionError",
                    last_failure_reason or "One or more tool calls failed",
                )
                if self.persistence is not None:
                    await self.persistence.on_task_failed(
                        task,
                        "ToolExecutionError",
                        last_failure_reason or "One or more tool calls failed",
                    )
                    events = await self.persistence.load_execution_events(task.task_id)

                return ExecutionResult(
                    task_id=task.task_id,
                    status=task.status,
                    outputs=context.outputs,
                    events=events,
                    error=last_failure_reason or "One or more tool calls failed",
                )

            task.transition(TaskStatus.COMPLETED)
            add_event(
                ExecutionEvent.create(
                    "task_completed",
                    {
                        "task_id": task.task_id,
                        "steps": len(tool_calls),
                    },
                )
            )
            await self._notify_obs(
                "on_task_completed",
                task,
                len(tool_calls),
                context.outputs,
            )
            if self.persistence is not None:
                await self.persistence.on_task_completed(task, len(tool_calls))
                events = await self.persistence.load_execution_events(task.task_id)

            return ExecutionResult(
                task_id=task.task_id,
                status=task.status,
                outputs=context.outputs,
                events=events,
            )

        except asyncio.CancelledError:
            if task.status == TaskStatus.RUNNING:
                task.transition(TaskStatus.CANCELLED)
            add_event(
                ExecutionEvent.create(
                    "task_cancelled",
                    {"task_id": task.task_id},
                )
            )
            await self._notify_obs("on_task_cancelled", task)
            if self.persistence is not None:
                await self.persistence.on_task_cancelled(task)
            raise

        except Exception as exc:
            # 6. On failure or budget exhaustion: transition to FAILED and preserve outputs
            if task.status == TaskStatus.RUNNING:
                task.transition(TaskStatus.FAILED)

            # Check specific diagnostic conditions
            if isinstance(exc, ToolNotFoundError):
                if self.observability is not None:
                    try:
                        trace = self.observability.tracer.get_trace_by_task(task.task_id)
                        trace_id = trace.trace_id if trace else f"trace-{task.task_id}"
                        clean_name = (
                            str(exc).replace("Tool '", "").replace("' is not registered.", "")
                        )
                        self.observability.diagnostics.diagnose_unknown_tool(
                            task_id=task.task_id,
                            trace_id=trace_id,
                            tool_name=clean_name,
                        )
                    except Exception:
                        pass
            elif isinstance(exc, ValidationError):
                if self.observability is not None:
                    try:
                        trace = self.observability.tracer.get_trace_by_task(task.task_id)
                        trace_id = trace.trace_id if trace else f"trace-{task.task_id}"
                        self.observability.diagnostics.diagnose_tool_validation(
                            task_id=task.task_id,
                            trace_id=trace_id,
                            tool_name="",
                            error=str(exc),
                        )
                    except Exception:
                        pass
            elif isinstance(exc, IdempotencyConflictError):
                if self.observability is not None:
                    try:
                        trace = self.observability.tracer.get_trace_by_task(task.task_id)
                        trace_id = trace.trace_id if trace else f"trace-{task.task_id}"
                        self.observability.diagnostics.diagnose_idempotency_conflict(
                            task_id=task.task_id,
                            trace_id=trace_id,
                            call_id="",
                            tool_name="",
                            details={"error": str(exc)},
                        )
                    except Exception:
                        pass

            if isinstance(exc, BudgetExceededError) and not any(
                e.event_type == "budget_exceeded" for e in events
            ):
                add_event(
                    ExecutionEvent.create(
                        "budget_exceeded",
                        {
                            "task_id": task.task_id,
                            "error": str(exc),
                            **tracker.snapshot(),
                        },
                    )
                )

            add_event(
                ExecutionEvent.create(
                    "task_failed",
                    {
                        "task_id": task.task_id,
                        "error_type": type(exc).__name__,
                        "error": str(exc),
                    },
                )
            )
            await self._notify_obs("on_task_failed", task, type(exc).__name__, str(exc))
            if self.persistence is not None:
                await self.persistence.on_task_failed(
                    task,
                    type(exc).__name__,
                    str(exc),
                )
                try:
                    events = await self.persistence.load_execution_events(task.task_id)
                except Exception:
                    pass

            return ExecutionResult(
                task_id=task.task_id,
                status=task.status,
                outputs=context.outputs,
                events=events,
                error=f"{type(exc).__name__}: {exc}",
            )

    async def cancel(self, task: Task) -> None:
        if task.status in (TaskStatus.CREATED, TaskStatus.RUNNING):
            task.transition(TaskStatus.CANCELLED)
            if self.persistence is not None:
                await self.persistence.on_task_cancelled(task)
            await self._notify_obs("on_task_cancelled", task)
