from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.budgets.exceptions import (
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
from forgeguard.persistence.exceptions import (
    UnrecoverableTaskError,
)
from forgeguard.persistence.models import ToolExecutionStatus
from forgeguard.persistence.repository import deserialize_json

if TYPE_CHECKING:
    from forgeguard.execution.engine import ExecutionEngine

logger = logging.getLogger("forgeguard.execution.session")


@dataclass
class ToolExecutionOutcome:
    """Outcome of a single tool execution within an execution session."""

    success: bool
    output: Any = None
    error: str | None = None
    call_id: str | None = None
    tool_name: str = ""
    duration_seconds: float = 0.0
    is_timeout: bool = False
    is_policy_denied: bool = False


class ExecutionSession:
    """Task-scoped governed execution session for iterative agent reasoning.

    Maintains task identity, budget tracking, policy enforcement, persistence,
    and observability correlation across multiple discrete tool calls.
    """

    def __init__(
        self,
        engine: ExecutionEngine,
        task: Task,
        active_budget: ExecutionBudget,
        tracker: BudgetTracker,
        context: ExecutionContext,
        completed_calls: list[str] | None = None,
        step_counter: int = 0,
        is_resumed: bool = False,
    ) -> None:
        self.engine = engine
        self.task = task
        self.active_budget = active_budget
        self.tracker = tracker
        self.context = context
        self.completed_calls: list[str] = completed_calls or []
        self.step_counter: int = step_counter
        self.is_resumed: bool = is_resumed
        self.events: list[ExecutionEvent] = []

    def add_event(self, event: ExecutionEvent) -> ExecutionEvent:
        self.events.append(event)
        self.engine._record_obs_event(self.task.task_id, event)
        return event

    async def execute_tool(self, call: ToolCall) -> ToolExecutionOutcome:
        """Execute a single tool call through ForgeGuard's governed runtime.

        Enforces:
        - Tool resolution
        - Security authorization policy
        - Pre-execution budget reservation
        - Monotonic execution deadlines
        - Dynamic effective tool timeouts
        - Idempotency & duplicate protection
        - Output byte size limits
        - Checkpoint persistence and observability correlation
        """
        if self.task.status != TaskStatus.RUNNING:
            return ToolExecutionOutcome(
                success=False,
                error=(
                    f"Task is in terminal state '{self.task.status.value}' "
                    "and cannot execute tools."
                ),
                call_id=call.call_id,
                tool_name=call.tool_name,
            )

        index = self.step_counter
        self.step_counter += 1

        call_id = call.call_id or (
            self.engine.persistence.generate_call_id(self.task.task_id, index, call.tool_name)
            if self.engine.persistence
            else f"call_{index}_{call.tool_name}_{uuid4().hex[:6]}"
        )

        # 1. Idempotency & completion check
        if call_id in self.completed_calls or f"step_{index}" in self.context.outputs:
            cached_output = self.context.outputs.get(
                f"step_{index}", self.context.outputs.get(call_id)
            )
            return ToolExecutionOutcome(
                success=True,
                output=cached_output,
                call_id=call_id,
                tool_name=call.tool_name,
            )

        if self.engine.persistence is not None:
            intent = await self.engine.persistence.on_tool_intent(self.task.task_id, call, index)
            if intent.status == ToolExecutionStatus.COMPLETED.value:
                cached_output = (
                    deserialize_json(intent.result_json) if intent.result_json is not None else None
                )
                self.context.outputs[f"step_{index}"] = cached_output
                self.context.outputs[call_id] = cached_output
                if call_id not in self.completed_calls:
                    self.completed_calls.append(call_id)
                return ToolExecutionOutcome(
                    success=True,
                    output=cached_output,
                    call_id=call_id,
                    tool_name=call.tool_name,
                )
            if intent.status == ToolExecutionStatus.UNCERTAIN.value:
                raise UnrecoverableTaskError(
                    f"Tool call '{call_id}' is in uncertain state and cannot execute."
                )

        # 2. Check overall task deadline
        if self.tracker.is_deadline_exceeded() or self.tracker.remaining_seconds <= 0:
            reason = (
                f"Execution deadline exceeded: elapsed {self.tracker.elapsed_seconds:.4f}s "
                f">= {self.active_budget.max_execution_seconds:.4f}s"
            )
            self.add_event(
                ExecutionEvent.create(
                    "budget_exceeded",
                    {
                        "task_id": self.task.task_id,
                        "step": index,
                        "tool_name": call.tool_name,
                        "limit": "max_execution_seconds",
                        "reason": reason,
                        **self.tracker.snapshot(),
                    },
                )
            )
            await self.engine._notify_obs(
                "on_budget_exceeded",
                self.task.task_id,
                "max_execution_seconds",
                reason,
                self.tracker.snapshot(),
                call.tool_name,
                call_id,
            )
            if self.engine.persistence is not None:
                await self.engine.persistence.on_budget_exceeded(
                    self.task.task_id,
                    index,
                    call.tool_name,
                    "max_execution_seconds",
                    reason,
                    self.tracker.snapshot(),
                )
            raise ExecutionTimeoutError(reason)

        # 3. Resolve tool existence
        try:
            tool = self.engine.registry.get(call.tool_name)
        except ToolNotFoundError as exc:
            if self.engine.observability is not None:
                try:
                    trace = self.engine.observability.tracer.get_trace_by_task(self.task.task_id)
                    trace_id = trace.trace_id if trace else f"trace-{self.task.task_id}"
                    self.engine.observability.diagnostics.diagnose_unknown_tool(
                        task_id=self.task.task_id,
                        trace_id=trace_id,
                        tool_name=call.tool_name,
                        call_id=call_id,
                    )
                except Exception:
                    pass
            return ToolExecutionOutcome(
                success=False,
                error=str(exc),
                call_id=call_id,
                tool_name=call.tool_name,
            )

        # 4. Evaluate authorization policy
        decision = self.engine.policy_engine.evaluate(
            tool_name=call.tool_name,
            metadata={
                "task_id": self.task.task_id,
                "step": index,
                "call_id": call_id,
            },
        )
        self.add_event(
            ExecutionEvent.create(
                "policy_decision",
                {
                    "tool_name": call.tool_name,
                    "allowed": decision.allowed,
                    "reason": decision.reason,
                    "matched_rule": decision.matched_rule,
                    "task_id": self.task.task_id,
                    "step": index,
                    "call_id": call_id,
                },
            )
        )
        await self.engine._notify_obs(
            "on_policy_decision",
            self.task.task_id,
            call.tool_name,
            call_id,
            decision.allowed,
            decision.reason,
            decision.matched_rule,
        )
        if self.engine.persistence is not None:
            await self.engine.persistence.on_policy_decision(
                self.task.task_id,
                index,
                call.tool_name,
                call_id,
                decision.allowed,
                decision.reason,
                decision.matched_rule,
            )

        # Reject unauthorized tools
        if not decision.allowed:
            self.add_event(
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
            if self.engine.persistence is not None:
                await self.engine.persistence.on_tool_rejected(
                    self.task.task_id,
                    index,
                    call.tool_name,
                    call_id,
                    decision.reason,
                )
            return ToolExecutionOutcome(
                success=False,
                error=f"PermissionError: {decision.reason}",
                call_id=call_id,
                tool_name=call.tool_name,
                is_policy_denied=True,
            )

        # 5. Reserve tool-call budget
        if not self.tracker.can_reserve_tool_call():
            reason = (
                f"Tool call limit reached: "
                f"{self.tracker.tool_calls_reserved} >= {self.active_budget.max_tool_calls}"
            )
            self.add_event(
                ExecutionEvent.create(
                    "budget_exceeded",
                    {
                        "task_id": self.task.task_id,
                        "step": index,
                        "tool_name": call.tool_name,
                        "limit": "max_tool_calls",
                        "reason": reason,
                        **self.tracker.snapshot(),
                    },
                )
            )
            await self.engine._notify_obs(
                "on_budget_exceeded",
                self.task.task_id,
                "max_tool_calls",
                reason,
                self.tracker.snapshot(),
                call.tool_name,
                call_id,
            )
            if self.engine.persistence is not None:
                await self.engine.persistence.on_budget_exceeded(
                    self.task.task_id,
                    index,
                    call.tool_name,
                    "max_tool_calls",
                    reason,
                    self.tracker.snapshot(),
                )
            raise ToolCallLimitExceededError(reason)

        self.tracker.reserve_tool_call()

        # 6. Check remaining execution time
        if self.tracker.remaining_seconds <= 0:
            reason = (
                f"Execution deadline exhausted: {self.tracker.elapsed_seconds:.4f}s "
                f">= {self.active_budget.max_execution_seconds:.4f}s"
            )
            self.add_event(
                ExecutionEvent.create(
                    "budget_exceeded",
                    {
                        "task_id": self.task.task_id,
                        "step": index,
                        "tool_name": call.tool_name,
                        "limit": "max_execution_seconds",
                        "reason": reason,
                        **self.tracker.snapshot(),
                    },
                )
            )
            await self.engine._notify_obs(
                "on_budget_exceeded",
                self.task.task_id,
                "max_execution_seconds",
                reason,
                self.tracker.snapshot(),
                call.tool_name,
                call_id,
            )
            if self.engine.persistence is not None:
                await self.engine.persistence.on_budget_exceeded(
                    self.task.task_id,
                    index,
                    call.tool_name,
                    "max_execution_seconds",
                    reason,
                    self.tracker.snapshot(),
                )
            raise ExecutionTimeoutError(reason)

        # 7. Effective timeout
        effective_timeout = self.tracker.get_effective_tool_timeout()

        self.add_event(
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
        await self.engine._notify_obs(
            "on_tool_start",
            self.task.task_id,
            call.tool_name,
            call_id,
            index,
            effective_timeout,
            call.arguments,
        )
        if self.engine.persistence is not None:
            await self.engine.persistence.on_tool_started(
                self.task.task_id,
                call_id,
                index,
                call.tool_name,
                effective_timeout,
            )

        # 8. Execute tool handler
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
            duration_seconds = time.monotonic() - start_tool_time
            is_task_deadline_exceeded = (
                self.tracker.is_deadline_exceeded()
                or self.tracker.remaining_seconds <= 0
                or effective_timeout < self.active_budget.max_tool_duration_seconds
            )

            if is_task_deadline_exceeded:
                reason = (
                    f"Execution deadline exceeded during tool '{call.tool_name}': "
                    f"{self.tracker.elapsed_seconds:.4f}s >= "
                    f"{self.active_budget.max_execution_seconds:.4f}s"
                )
                self.add_event(
                    ExecutionEvent.create(
                        "budget_exceeded",
                        {
                            "task_id": self.task.task_id,
                            "step": index,
                            "tool_name": call.tool_name,
                            "limit": "max_execution_seconds",
                            "reason": reason,
                            **self.tracker.snapshot(),
                        },
                    )
                )
                await self.engine._notify_obs(
                    "on_budget_exceeded",
                    self.task.task_id,
                    "max_execution_seconds",
                    reason,
                    self.tracker.snapshot(),
                    call.tool_name,
                    call_id,
                )
                if self.engine.persistence is not None:
                    await self.engine.persistence.on_budget_exceeded(
                        self.task.task_id,
                        index,
                        call.tool_name,
                        "max_execution_seconds",
                        reason,
                        self.tracker.snapshot(),
                    )
                raise ExecutionTimeoutError(reason) from timeout_exc

            self.add_event(
                ExecutionEvent.create(
                    "tool_timeout",
                    {
                        "task_id": self.task.task_id,
                        "tool_name": call.tool_name,
                        "call_id": call_id,
                        "step": index,
                        "timeout_seconds": effective_timeout,
                        "elapsed_seconds": round(self.tracker.elapsed_seconds, 4),
                    },
                )
            )
            step_error_str = (
                f"ToolTimeoutError: Tool '{call.tool_name}' timed out after "
                f"{effective_timeout:.2f}s"
            )
            self.tracker.record_tool_failure(is_timeout=True)

            await self.engine._notify_obs(
                "on_tool_failed",
                self.task.task_id,
                call.tool_name,
                call_id,
                index,
                duration_seconds,
                step_error_str,
                True,
                effective_timeout,
                call.arguments,
            )
            if self.engine.persistence is not None:
                await self.engine.persistence.on_tool_failed(
                    self.task.task_id,
                    call_id,
                    index,
                    call.tool_name,
                    step_error_str,
                    duration_seconds,
                    is_timeout=True,
                    budget_snapshot=self.tracker.snapshot(),
                    effective_timeout=effective_timeout,
                )

        except Exception as exc:
            tool_failed = True
            duration_seconds = time.monotonic() - start_tool_time
            step_error_str = f"{type(exc).__name__}: {exc}"
            self.tracker.record_tool_failure(is_timeout=False)

            await self.engine._notify_obs(
                "on_tool_failed",
                self.task.task_id,
                call.tool_name,
                call_id,
                index,
                duration_seconds,
                step_error_str,
                False,
                None,
                call.arguments,
            )
            if self.engine.persistence is not None:
                await self.engine.persistence.on_tool_failed(
                    self.task.task_id,
                    call_id,
                    index,
                    call.tool_name,
                    step_error_str,
                    duration_seconds,
                    is_timeout=False,
                    budget_snapshot=self.tracker.snapshot(),
                )

        # Handle tool failure
        if tool_failed:
            self.add_event(
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
            self.add_event(
                ExecutionEvent.create(
                    "budget_updated",
                    {
                        "task_id": self.task.task_id,
                        "step": index,
                        "tool_name": call.tool_name,
                        "consumed_tool_calls": self.tracker.tool_calls_reserved,
                        "remaining_tool_calls": self.tracker.remaining_tool_calls,
                        "output_bytes_consumed": self.tracker.cumulative_output_bytes,
                        "remaining_output_budget": self.tracker.remaining_output_bytes,
                        "elapsed_seconds": round(self.tracker.elapsed_seconds, 6),
                        "remaining_seconds": round(self.tracker.remaining_seconds, 6),
                        "failure_count": self.tracker.consecutive_failures,
                        **self.tracker.snapshot(),
                    },
                )
            )
            await self.engine._notify_obs(
                "on_budget_updated", self.task.task_id, self.tracker.snapshot()
            )

            if self.tracker.is_consecutive_failures_exceeded():
                reason = (
                    f"Consecutive tool failure limit reached: "
                    f"{self.tracker.consecutive_failures} >= "
                    f"{self.active_budget.max_consecutive_failures}"
                )
                self.add_event(
                    ExecutionEvent.create(
                        "budget_exceeded",
                        {
                            "task_id": self.task.task_id,
                            "step": index,
                            "tool_name": call.tool_name,
                            "limit": "max_consecutive_failures",
                            "reason": reason,
                            **self.tracker.snapshot(),
                        },
                    )
                )
                await self.engine._notify_obs(
                    "on_budget_exceeded",
                    self.task.task_id,
                    "max_consecutive_failures",
                    reason,
                    self.tracker.snapshot(),
                    call.tool_name,
                    call_id,
                )
                if self.engine.persistence is not None:
                    await self.engine.persistence.on_budget_exceeded(
                        self.task.task_id,
                        index,
                        call.tool_name,
                        "max_consecutive_failures",
                        reason,
                        self.tracker.snapshot(),
                    )
                raise ConsecutiveFailuresExceededError(reason)

            return ToolExecutionOutcome(
                success=False,
                error=step_error_str,
                call_id=call_id,
                tool_name=call.tool_name,
                duration_seconds=duration_seconds,
            )

        duration_seconds = time.monotonic() - start_tool_time

        # 9. Validate output size
        output_bytes = calculate_output_bytes(tool_output)
        if (
            self.tracker.cumulative_output_bytes + output_bytes
            > self.active_budget.max_output_bytes
        ):
            reason = (
                f"Output size limit exceeded: adding {output_bytes} bytes to "
                f"{self.tracker.cumulative_output_bytes} bytes exceeds maximum of "
                f"{self.active_budget.max_output_bytes} bytes"
            )
            self.add_event(
                ExecutionEvent.create(
                    "budget_exceeded",
                    {
                        "task_id": self.task.task_id,
                        "step": index,
                        "tool_name": call.tool_name,
                        "limit": "max_output_bytes",
                        "reason": reason,
                        **self.tracker.snapshot(),
                    },
                )
            )
            await self.engine._notify_obs(
                "on_budget_exceeded",
                self.task.task_id,
                "max_output_bytes",
                reason,
                self.tracker.snapshot(),
                call.tool_name,
                call_id,
            )
            if self.engine.persistence is not None:
                await self.engine.persistence.on_budget_exceeded(
                    self.task.task_id,
                    index,
                    call.tool_name,
                    "max_output_bytes",
                    reason,
                    self.tracker.snapshot(),
                )
            raise OutputSizeExceededError(reason)

        # 10. Store output and update tracker
        self.context.outputs[f"step_{index}"] = tool_output
        self.context.outputs[call_id] = tool_output
        self.tracker.record_tool_success(output_bytes)
        if call_id not in self.completed_calls:
            self.completed_calls.append(call_id)

        # 11. Emit completion events
        self.add_event(
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
        self.add_event(
            ExecutionEvent.create(
                "budget_updated",
                {
                    "task_id": self.task.task_id,
                    "step": index,
                    "tool_name": call.tool_name,
                    "consumed_tool_calls": self.tracker.tool_calls_reserved,
                    "remaining_tool_calls": self.tracker.remaining_tool_calls,
                    "output_bytes_consumed": self.tracker.cumulative_output_bytes,
                    "remaining_output_budget": self.tracker.remaining_output_bytes,
                    "elapsed_seconds": round(self.tracker.elapsed_seconds, 6),
                    "remaining_seconds": round(self.tracker.remaining_seconds, 6),
                    "failure_count": self.tracker.consecutive_failures,
                    **self.tracker.snapshot(),
                },
            )
        )
        await self.engine._notify_obs(
            "on_tool_completed",
            self.task.task_id,
            call.tool_name,
            call_id,
            index,
            duration_seconds,
            tool_output,
            call.arguments,
        )
        await self.engine._notify_obs(
            "on_budget_updated", self.task.task_id, self.tracker.snapshot()
        )

        if self.engine.persistence is not None:
            await self.engine.persistence.on_tool_completed(
                task=self.task,
                tool_call_id=call_id,
                step=index,
                tool_name=call.tool_name,
                output=tool_output,
                duration_seconds=duration_seconds,
                budget_snapshot=self.tracker.snapshot(),
                partial_outputs=self.context.outputs,
                completed_call_ids=self.completed_calls,
            )
            await self.engine._notify_obs(
                "on_checkpoint_created",
                self.task.task_id,
                f"chk-{self.task.task_id}-{index}",
                index + 1,
            )

        return ToolExecutionOutcome(
            success=True,
            output=tool_output,
            call_id=call_id,
            tool_name=call.tool_name,
            duration_seconds=duration_seconds,
        )

    async def complete(self, final_response: str | None = None) -> ExecutionResult:
        """Mark task as COMPLETED and finalize persistence and observability."""
        if self.task.status == TaskStatus.RUNNING:
            self.task.transition(TaskStatus.COMPLETED)

        self.add_event(
            ExecutionEvent.create(
                "task_completed",
                {
                    "task_id": self.task.task_id,
                    "steps": self.step_counter,
                    "final_response": final_response,
                },
            )
        )
        await self.engine._notify_obs(
            "on_task_completed",
            self.task,
            self.step_counter,
            self.context.outputs,
        )
        if self.engine.persistence is not None:
            await self.engine.persistence.on_task_completed(self.task, self.step_counter)
            events = await self.engine.persistence.load_execution_events(self.task.task_id)
        else:
            events = self.events

        return ExecutionResult(
            task_id=self.task.task_id,
            status=self.task.status,
            outputs=self.context.outputs,
            events=events,
        )

    async def fail(self, error: str) -> ExecutionResult:
        """Mark task as FAILED and finalize persistence and observability."""
        if self.task.status == TaskStatus.RUNNING:
            self.task.transition(TaskStatus.FAILED)

        self.add_event(
            ExecutionEvent.create(
                "task_failed",
                {
                    "task_id": self.task.task_id,
                    "error_type": "AgentExecutionError",
                    "error": error,
                },
            )
        )
        await self.engine._notify_obs(
            "on_task_failed",
            self.task,
            "AgentExecutionError",
            error,
        )
        if self.engine.persistence is not None:
            await self.engine.persistence.on_task_failed(self.task, "AgentExecutionError", error)
            events = await self.engine.persistence.load_execution_events(self.task.task_id)
        else:
            events = self.events

        return ExecutionResult(
            task_id=self.task.task_id,
            status=self.task.status,
            outputs=self.context.outputs,
            events=events,
            error=error,
        )

    async def cancel(self, reason: str = "Task cancelled") -> ExecutionResult:
        """Mark task as CANCELLED and finalize persistence and observability."""
        if self.task.status == TaskStatus.RUNNING:
            self.task.transition(TaskStatus.CANCELLED)

        self.add_event(
            ExecutionEvent.create(
                "task_cancelled",
                {"task_id": self.task.task_id, "reason": reason},
            )
        )
        await self.engine._notify_obs("on_task_cancelled", self.task)
        if self.engine.persistence is not None:
            await self.engine.persistence.on_task_cancelled(self.task)
            events = await self.engine.persistence.load_execution_events(self.task.task_id)
        else:
            events = self.events

        return ExecutionResult(
            task_id=self.task.task_id,
            status=self.task.status,
            outputs=self.context.outputs,
            events=events,
            error=f"TaskCancelled: {reason}",
        )
