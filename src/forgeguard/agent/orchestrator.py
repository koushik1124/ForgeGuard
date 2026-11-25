from __future__ import annotations

import logging
import time
from typing import Any

from forgeguard.agent.context import AgentContext
from forgeguard.agent.exceptions import (
    ProviderError,
)
from forgeguard.agent.models import (
    AgentResult,
    AgentStatus,
    FinalAction,
    ToolAction,
)
from forgeguard.agent.prompts import build_system_prompt, registry_to_tool_definitions
from forgeguard.agent.provider import BaseLLMProvider
from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.budgets.exceptions import BudgetExceededError
from forgeguard.core.task import Task
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.session import ExecutionSession, ToolExecutionOutcome
from forgeguard.execution.tool_call import ToolCall
from forgeguard.observability.models import SpanType

logger = logging.getLogger("forgeguard.agent.orchestrator")


class Agent:
    """Governed AI Agent orchestrator.

    The Agent deliberates via an LLM provider, producing validated decisions.
    All tool calls are authorized, budgeted, persisted, and observed strictly
    through the ForgeGuard runtime.
    """

    def __init__(
        self,
        engine: ExecutionEngine,
        provider: BaseLLMProvider,
        max_iterations: int = 10,
        max_context_entries: int = 20,
        custom_instructions: str | None = None,
    ) -> None:
        self.engine = engine
        self.provider = provider
        self.max_iterations = max_iterations
        self.max_context_entries = max_context_entries
        self.custom_instructions = custom_instructions

    def _get_trace_id(self, task_id: str) -> str | None:
        if self.engine.observability is not None:
            trace = self.engine.observability.tracer.get_trace_by_task(task_id)
            if trace:
                return trace.trace_id
        return None

    def _get_diagnostics(self, task_id: str) -> list[dict[str, Any]]:
        if self.engine.observability is not None:
            return [d.to_dict() for d in self.engine.observability.get_diagnostics(task_id)]
        return []

    async def run(
        self,
        task: Task | str,
        budget: ExecutionBudget | None = None,
    ) -> AgentResult:
        """Execute a governed agent reasoning loop for a task."""
        start_time = time.monotonic()
        fg_task = task if isinstance(task, Task) else Task(description=str(task))

        session = await self.engine.create_session(fg_task, budget=budget)
        tools = registry_to_tool_definitions(self.engine.registry)
        system_prompt = build_system_prompt(tools, self.custom_instructions)

        context = AgentContext(
            user_task=fg_task.description,
            system_prompt=system_prompt,
            max_history_entries=self.max_context_entries,
        )

        return await self._run_loop(
            session=session,
            context=context,
            tools=tools,
            start_time=start_time,
            start_iteration=0,
        )

    async def resume(
        self,
        task_id: str,
        budget: ExecutionBudget | None = None,
    ) -> AgentResult:
        """Resume an interrupted agent task execution from checkpoints."""
        start_time = time.monotonic()
        session = await self.engine.resume_session(task_id, budget=budget)

        tools = registry_to_tool_definitions(self.engine.registry)
        system_prompt = build_system_prompt(tools, self.custom_instructions)

        context = AgentContext(
            user_task=session.task.description,
            system_prompt=system_prompt,
            max_history_entries=self.max_context_entries,
        )

        # Restore completed outputs into context
        for key, output in session.context.outputs.items():
            context.add_system_notice(f"Resumed execution. Previous step '{key}' output: {output}")

        return await self._run_loop(
            session=session,
            context=context,
            tools=tools,
            start_time=start_time,
            start_iteration=session.step_counter,
        )

    async def _run_loop(
        self,
        session: ExecutionSession,
        context: AgentContext,
        tools: list[dict[str, Any]],
        start_time: float,
        start_iteration: int,
    ) -> AgentResult:
        task_id = session.task.task_id
        iteration = start_iteration
        tool_call_count = 0
        successful_tool_count = 0
        failed_tool_count = 0
        policy_denial_count = 0
        errors: list[str] = []
        cumulative_usage: dict[str, int] = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

        while iteration < self.max_iterations:
            iteration += 1

            # Observability: Start iteration span
            iter_span_id: str | None = None
            if self.engine.observability is not None:
                trace_id = self._get_trace_id(task_id)
                if trace_id:
                    span = self.engine.observability.tracer.start_span(
                        trace_id=trace_id,
                        operation_name=f"agent_iteration_{iteration}",
                        span_type=SpanType.AGENT_ITERATION,
                        attributes={"iteration": iteration, "task_id": task_id},
                    )
                    iter_span_id = span.span_id

            # 1. Ask provider for next structured decision
            try:
                response = await self.provider.complete(context.to_messages(), tools=tools)
            except ProviderError as exc:
                err_msg = f"ProviderError: {exc}"
                errors.append(err_msg)
                if iter_span_id and self.engine.observability is not None:
                    self.engine.observability.tracer.end_span(
                        iter_span_id, status="failed", error=err_msg
                    )
                await session.fail(err_msg)
                return AgentResult(
                    task_id=task_id,
                    trace_id=self._get_trace_id(task_id),
                    status=AgentStatus.FAILED,
                    final_response=None,
                    iterations=iteration,
                    tool_call_count=tool_call_count,
                    successful_tool_count=successful_tool_count,
                    failed_tool_count=failed_tool_count,
                    policy_denial_count=policy_denial_count,
                    budget_summary=session.tracker.snapshot(),
                    duration_seconds=time.monotonic() - start_time,
                    errors=errors,
                    diagnostics=self._get_diagnostics(task_id),
                    history=context.get_history_summary(),
                    usage=cumulative_usage,
                )

            # Accumulate token usage
            cumulative_usage["prompt_tokens"] += response.usage.prompt_tokens
            cumulative_usage["completion_tokens"] += response.usage.completion_tokens
            cumulative_usage["total_tokens"] += response.usage.total_tokens

            decision = response.decision
            context.add_assistant_decision(decision)

            # 2. Handle Final Action
            if isinstance(decision, FinalAction):
                if iter_span_id and self.engine.observability is not None:
                    self.engine.observability.tracer.end_span(
                        iter_span_id, status="completed", attributes={"action": "final"}
                    )
                await session.complete(final_response=decision.final_response)
                return AgentResult(
                    task_id=task_id,
                    trace_id=self._get_trace_id(task_id),
                    status=AgentStatus.COMPLETED,
                    final_response=decision.final_response,
                    iterations=iteration,
                    tool_call_count=tool_call_count,
                    successful_tool_count=successful_tool_count,
                    failed_tool_count=failed_tool_count,
                    policy_denial_count=policy_denial_count,
                    budget_summary=session.tracker.snapshot(),
                    duration_seconds=time.monotonic() - start_time,
                    errors=errors,
                    diagnostics=self._get_diagnostics(task_id),
                    history=context.get_history_summary(),
                    usage=cumulative_usage,
                )

            # 3. Handle Tool Action
            elif isinstance(decision, ToolAction):
                tool_call_count += 1
                call = ToolCall(tool_name=decision.tool_name, arguments=decision.arguments)

                try:
                    outcome: ToolExecutionOutcome = await session.execute_tool(call)
                except BudgetExceededError as exc:
                    err_msg = f"{type(exc).__name__}: {exc}"
                    errors.append(err_msg)
                    if iter_span_id and self.engine.observability is not None:
                        self.engine.observability.tracer.end_span(
                            iter_span_id, status="failed", error=err_msg
                        )
                    await session.fail(err_msg)
                    return AgentResult(
                        task_id=task_id,
                        trace_id=self._get_trace_id(task_id),
                        status=AgentStatus.BUDGET_EXHAUSTED,
                        final_response=None,
                        iterations=iteration,
                        tool_call_count=tool_call_count,
                        successful_tool_count=successful_tool_count,
                        failed_tool_count=failed_tool_count,
                        policy_denial_count=policy_denial_count,
                        budget_summary=session.tracker.snapshot(),
                        duration_seconds=time.monotonic() - start_time,
                        errors=errors,
                        diagnostics=self._get_diagnostics(task_id),
                        history=context.get_history_summary(),
                        usage=cumulative_usage,
                    )
                except Exception as exc:
                    err_msg = f"{type(exc).__name__}: {exc}"
                    errors.append(err_msg)
                    if iter_span_id and self.engine.observability is not None:
                        self.engine.observability.tracer.end_span(
                            iter_span_id, status="failed", error=err_msg
                        )
                    await session.fail(err_msg)
                    return AgentResult(
                        task_id=task_id,
                        trace_id=self._get_trace_id(task_id),
                        status=AgentStatus.FAILED,
                        final_response=None,
                        iterations=iteration,
                        tool_call_count=tool_call_count,
                        successful_tool_count=successful_tool_count,
                        failed_tool_count=failed_tool_count,
                        policy_denial_count=policy_denial_count,
                        budget_summary=session.tracker.snapshot(),
                        duration_seconds=time.monotonic() - start_time,
                        errors=errors,
                        diagnostics=self._get_diagnostics(task_id),
                        history=context.get_history_summary(),
                        usage=cumulative_usage,
                    )

                # Process tool outcome
                if outcome.is_policy_denied:
                    policy_denial_count += 1
                    denial_reason = outcome.error or "Action denied by security policy."
                    context.add_policy_denial(decision.tool_name, denial_reason)
                elif not outcome.success:
                    failed_tool_count += 1
                    context.add_tool_result(
                        decision.tool_name,
                        outcome.call_id or "",
                        outcome.error or "Tool execution failed",
                        is_error=True,
                    )
                else:
                    successful_tool_count += 1
                    context.add_tool_result(
                        decision.tool_name,
                        outcome.call_id or "",
                        outcome.output,
                        is_error=False,
                    )

                if iter_span_id and self.engine.observability is not None:
                    self.engine.observability.tracer.end_span(
                        iter_span_id,
                        status="completed" if outcome.success else "failed",
                        attributes={
                            "action": "tool",
                            "tool_name": decision.tool_name,
                            "success": outcome.success,
                        },
                    )

        # Iteration limit reached without FinalAction
        limit_err = (
            f"Agent reached maximum reasoning iterations ({self.max_iterations}) "
            "without concluding."
        )
        errors.append(limit_err)
        await session.fail(limit_err)
        return AgentResult(
            task_id=task_id,
            trace_id=self._get_trace_id(task_id),
            status=AgentStatus.ITERATION_LIMIT_REACHED,
            final_response=None,
            iterations=iteration,
            tool_call_count=tool_call_count,
            successful_tool_count=successful_tool_count,
            failed_tool_count=failed_tool_count,
            policy_denial_count=policy_denial_count,
            budget_summary=session.tracker.snapshot(),
            duration_seconds=time.monotonic() - start_time,
            errors=errors,
            diagnostics=self._get_diagnostics(task_id),
            history=context.get_history_summary(),
            usage=cumulative_usage,
        )
