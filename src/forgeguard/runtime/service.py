from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from forgeguard.agent.exceptions import ProviderConfigurationError
from forgeguard.agent.models import AgentStatus
from forgeguard.agent.orchestrator import Agent
from forgeguard.agent.provider import BaseLLMProvider
from forgeguard.agent.providers.mock import MockProvider
from forgeguard.agent.tools.calculator import create_calculator_tool
from forgeguard.agent.tools.text_analysis import create_text_analysis_tool
from forgeguard.agent.tools.workspace import create_workspace_tools
from forgeguard.api.errors import APIException
from forgeguard.api.schemas import (
    BudgetOverrideSchema,
    TaskCancelResponse,
    TaskDiagnosticsResponse,
    TaskListResponse,
    TaskResponse,
    TaskResultResponse,
    TaskResumeResponse,
    TaskSubmitRequest,
)
from forgeguard.budgets.budget import ExecutionBudget
from forgeguard.config import ForgeGuardSettings, get_settings
from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.evaluation.service import EvaluationRunnerService
from forgeguard.execution.engine import ExecutionEngine
from forgeguard.execution.tool_call import ToolCall
from forgeguard.observability.manager import ObservabilityManager
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import TaskIdempotencyRecord, TaskRecord
from forgeguard.persistence.recovery import RecoveryEngine
from forgeguard.persistence.repository import deserialize_json, serialize_json, utc_iso_now
from forgeguard.policies.policy import Policy, PolicyEngine
from forgeguard.tools.registry import ToolRegistry
from forgeguard.workspaces.manager import WorkspaceRegistry

logger = logging.getLogger("forgeguard.runtime.service")


class RuntimeService:
    """Core application service coordinating governed task execution, state, and streaming."""

    def __init__(
        self,
        settings: ForgeGuardSettings | None = None,
        persistence: PersistenceManager | None = None,
        observability: ObservabilityManager | None = None,
        provider: BaseLLMProvider | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.persistence = persistence or PersistenceManager(db_path=self.settings.db_path)
        self.observability = observability or ObservabilityManager()
        self.workspace_registry = WorkspaceRegistry(self.persistence)
        self.evaluation_runner = EvaluationRunnerService(reports_dir=self.settings.eval_reports_dir)

        # Provider configuration
        provider_name = (self.settings.provider or "").strip().lower()
        if provider is not None:
            self.provider = provider
            logger.info(
                "RuntimeService configured with custom provider: %s",
                type(provider).__name__,
            )
        elif provider_name == "groq":
            if not self.settings.groq_api_key or not self.settings.groq_api_key.strip():
                raise ProviderConfigurationError(
                    "Groq provider was selected (FORGEGUARD_PROVIDER=groq), "
                    "but GROQ_API_KEY is missing or empty. Set the 'GROQ_API_KEY' "
                    "environment variable or provide a valid key in settings."
                )
            from forgeguard.agent.providers.groq import GroqProvider

            self.provider = GroqProvider(
                api_key=self.settings.groq_api_key,
                model=self.settings.default_model,
            )
            logger.info(
                "RuntimeService configured with GroqProvider (model=%s)",
                self.settings.default_model,
            )
        elif provider_name == "mock":
            logger.warning(
                "Using MockProvider for agent execution. Real LLM inference is disabled. "
                "Set FORGEGUARD_PROVIDER=groq and GROQ_API_KEY to enable real models."
            )
            self.provider = MockProvider()
        else:
            logger.warning(
                "Unknown provider '%s' requested; falling back to MockProvider. "
                "Real LLM inference is disabled. Set FORGEGUARD_PROVIDER=groq "
                "and GROQ_API_KEY to enable real models.",
                self.settings.provider,
            )
            self.provider = MockProvider()

        # Concurrency & background management
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}
        self._task_locks: dict[str, asyncio.Lock] = {}
        self._task_results: dict[str, TaskResultResponse] = {}
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize persistence and observability subsystems and reconcile interrupted tasks."""
        if not self._initialized:
            await self.persistence.initialize()
            await self.observability.initialize()

            # Startup reconciliation: reconcile any interrupted tasks left in RUNNING state
            # from an abrupt termination or prior process crash.
            active_tasks = await self.persistence.repository.list_active_tasks()
            for task_rec in active_tasks:
                if task_rec.status == TaskStatus.RUNNING.value:
                    await self.persistence.repository.update_task_status(
                        task_id=task_rec.task_id,
                        status=TaskStatus.FAILED.value,
                        recovery_status="interrupted",
                    )
                    self._task_results[task_rec.task_id] = TaskResultResponse(
                        task_id=task_rec.task_id,
                        status=TaskStatus.FAILED.value,
                        completed=False,
                        error="Execution interrupted by runtime restart.",
                    )
                    logger.info(
                        "Reconciled interrupted task %s on startup: status set to failed (interrupted).",
                        task_rec.task_id,
                    )
            self._initialized = True

    async def close(self) -> None:
        """Gracefully cancel active tasks and close persistence."""
        for _task_id, active_task in list(self._active_tasks.items()):
            if not active_task.done():
                active_task.cancel()
        await self.evaluation_runner.close()
        await self.persistence.close()

    def _get_task_lock(self, task_id: str) -> asyncio.Lock:
        if task_id not in self._task_locks:
            self._task_locks[task_id] = asyncio.Lock()
        return self._task_locks[task_id]

    def _build_budget(self, override: BudgetOverrideSchema | None) -> ExecutionBudget:
        """Apply configured defaults and clamp overrides within server bounds."""
        max_calls = self.settings.max_tool_calls
        max_secs = self.settings.max_execution_seconds
        max_bytes = self.settings.max_output_bytes
        max_tool_secs = self.settings.max_tool_duration_seconds

        if override:
            if override.max_tool_calls is not None:
                max_calls = min(override.max_tool_calls, max_calls)
            if override.max_execution_seconds is not None:
                max_secs = min(override.max_execution_seconds, max_secs)
            if override.max_output_bytes is not None:
                max_bytes = min(override.max_output_bytes, max_bytes)
            if override.max_tool_duration_seconds is not None:
                max_tool_secs = min(override.max_tool_duration_seconds, max_tool_secs)

        return ExecutionBudget(
            max_tool_calls=max_calls,
            max_execution_seconds=max_secs,
            max_consecutive_failures=self.settings.max_consecutive_failures,
            max_output_bytes=max_bytes,
            max_tool_duration_seconds=max_tool_secs,
        )

    def _build_engine(
        self,
        workspace_id: str | None = None,
        workspace_path: str | None = None,
    ) -> ExecutionEngine:
        """Construct governed ExecutionEngine with policy, tools, and observability."""
        registry = ToolRegistry()
        allowed_tools = {"calculator", "text_analysis"}
        registry.register(create_calculator_tool())
        registry.register(create_text_analysis_tool())

        if workspace_path:
            allowed_tools.update({"workspace_list_files", "workspace_read_file"})
            ws_list, ws_read = create_workspace_tools(workspace_path)
            registry.register(ws_list)
            registry.register(ws_read)

        policy = Policy(allowed_tools=frozenset(allowed_tools))
        policy_engine = PolicyEngine(policy)
        default_budget = self._build_budget(None)

        return ExecutionEngine(
            registry=registry,
            policy_engine=policy_engine,
            budget=default_budget,
            persistence=self.persistence,
            observability=self.observability,
        )

    def broadcast_event(self, task_id: str, event_data: dict[str, Any]) -> None:
        """Push an execution event to all live SSE listeners for a task."""
        if task_id in self._subscribers:
            for q in list(self._subscribers[task_id]):
                try:
                    q.put_nowait(event_data)
                except asyncio.QueueFull:
                    logger.warning("Subscriber queue full for task %s; dropping event", task_id)

    async def submit_task(
        self,
        request: TaskSubmitRequest,
        idempotency_key: str | None = None,
    ) -> TaskResponse:
        """Submit a new governed execution request with idempotency and state safety."""
        await self.initialize()

        # 1. Idempotency handling
        req_json = request.model_dump_json()
        req_hash = hashlib.sha256(req_json.encode("utf-8")).hexdigest()

        if idempotency_key:
            existing_idemp = await self.persistence.get_idempotency(idempotency_key)
            if existing_idemp is not None:
                if existing_idemp.request_hash == req_hash:
                    # Return existing task
                    return await self.get_task(existing_idemp.task_id)
                raise APIException(
                    status_code=409,
                    code="FG-IDEMP-409",
                    message=(
                        f"Idempotency key '{idempotency_key}' already used with "
                        "conflicting request parameters."
                    ),
                )

        # 2. Workspace resolution
        workspace_path: str | None = None
        task_meta = dict(request.metadata)
        if request.workspace_id:
            ws_record = await self.workspace_registry.get_workspace(request.workspace_id)
            workspace_path = ws_record.root_path
            task_meta["workspace_id"] = request.workspace_id
            if ws_record.name:
                task_meta["workspace_name"] = ws_record.name

        # 3. Create persistent task record
        task_id = f"task-{uuid4().hex[:12]}"
        now = utc_iso_now()
        task_record = TaskRecord(
            task_id=task_id,
            description=request.prompt,
            status=TaskStatus.CREATED.value,
            created_at=now,
            last_updated_at=now,
            metadata_json=serialize_json(task_meta),
        )
        await self.persistence.repository.create_task(task_record)

        if idempotency_key:
            await self.persistence.record_idempotency(
                TaskIdempotencyRecord(
                    idempotency_key=idempotency_key,
                    task_id=task_id,
                    request_hash=req_hash,
                    created_at=now,
                )
            )

        # 4. Schedule background governed execution
        budget = self._build_budget(request.budget)
        engine = self._build_engine(request.workspace_id, workspace_path)

        # Launch background task
        bg_task = asyncio.create_task(
            self._execute_governed_task(
                task_id=task_id,
                prompt=request.prompt,
                execution_mode=request.execution_mode,
                tool_calls=request.tool_calls,
                budget=budget,
                engine=engine,
                metadata=task_meta,
            )
        )
        self._active_tasks[task_id] = bg_task

        return TaskResponse(
            task_id=task_id,
            description=request.prompt,
            status=TaskStatus.CREATED.value,
            created_at=now,
            metadata=task_meta,
        )

    async def _execute_governed_task(
        self,
        task_id: str,
        prompt: str,
        execution_mode: str,
        tool_calls: list[Any] | None,
        budget: ExecutionBudget,
        engine: ExecutionEngine,
        metadata: dict[str, Any],
    ) -> None:
        """Governed execution lifecycle run in background."""
        fg_task = Task(description=prompt, task_id=task_id, metadata=metadata)
        start_mono = asyncio.get_running_loop().time()

        try:
            if execution_mode == "tool_calls" and tool_calls:
                calls = [
                    ToolCall(
                        tool_name=c.tool_name,
                        arguments=c.arguments,
                        call_id=c.call_id or f"{task_id}:call:{i}",
                    )
                    for i, c in enumerate(tool_calls)
                ]
                result = await engine.execute(fg_task, calls, budget=budget)
                duration = asyncio.get_running_loop().time() - start_mono

                self._task_results[task_id] = TaskResultResponse(
                    task_id=task_id,
                    status=result.status.value,
                    completed=result.status == TaskStatus.COMPLETED,
                    final_response=None,
                    outputs=result.outputs,
                    error=result.error,
                    iterations=len(calls),
                    tool_call_count=len(calls),
                    duration_seconds=round(duration, 4),
                )
            else:
                agent = Agent(
                    engine=engine,
                    provider=self.provider,
                    max_iterations=budget.max_tool_calls,
                )
                agent_result = await agent.run(fg_task, budget=budget)
                duration = asyncio.get_running_loop().time() - start_mono

                self._task_results[task_id] = TaskResultResponse(
                    task_id=task_id,
                    status=agent_result.status.value,
                    completed=agent_result.status == AgentStatus.COMPLETED,
                    final_response=agent_result.final_response,
                    outputs={"final_response": agent_result.final_response}
                    if agent_result.final_response
                    else {},
                    error="; ".join(agent_result.errors) if agent_result.errors else None,
                    iterations=agent_result.iterations,
                    tool_call_count=agent_result.tool_call_count,
                    duration_seconds=round(duration, 4),
                )
        except asyncio.CancelledError:
            logger.info("Task %s execution was cancelled", task_id)
            task_rec = await self.persistence.repository.get_task(task_id)
            if task_rec and task_rec.status != TaskStatus.CANCELLED.value:
                if fg_task.status == TaskStatus.RUNNING:
                    fg_task.transition(TaskStatus.CANCELLED)
                await self.persistence.on_task_cancelled(fg_task)
            self._task_results[task_id] = TaskResultResponse(
                task_id=task_id,
                status=TaskStatus.CANCELLED.value,
                completed=False,
                error="Task was cancelled by client request.",
            )
        except Exception as exc:
            logger.exception("Task %s failed unexpectedly: %s", task_id, exc)
            if fg_task.status in (TaskStatus.CREATED, TaskStatus.RUNNING):
                fg_task.transition(TaskStatus.FAILED)
                await self.persistence.on_task_failed(fg_task, type(exc).__name__, str(exc))
            self._task_results[task_id] = TaskResultResponse(
                task_id=task_id,
                status=TaskStatus.FAILED.value,
                completed=False,
                error=f"{type(exc).__name__}: {exc}",
            )
        finally:
            self._active_tasks.pop(task_id, None)

    async def get_task(self, task_id: str) -> TaskResponse:
        """Retrieve task details and current status."""
        await self.initialize()
        record = await self.persistence.repository.get_task(task_id)
        if record is None:
            raise APIException(
                status_code=404,
                code="FG-TASK-404",
                message=f"Task '{task_id}' not found.",
                task_id=task_id,
            )

        metadata = deserialize_json(record.metadata_json) if record.metadata_json else {}
        tool_executions = await self.persistence.repository.list_tool_executions(task_id)
        tool_count = len(tool_executions)

        latest_cp = await self.persistence.repository.get_latest_checkpoint(task_id)
        budget_summary = (
            deserialize_json(latest_cp.budget_state_json)
            if latest_cp and latest_cp.budget_state_json
            else None
        )

        return TaskResponse(
            task_id=record.task_id,
            description=record.description,
            status=record.status,
            created_at=record.created_at,
            started_at=record.started_at,
            finished_at=record.finished_at,
            metadata=metadata,
            iteration_count=record.current_position or None,
            tool_call_count=tool_count,
            budget_summary=budget_summary,
            cancellation_status="cancelled" if record.status == "cancelled" else None,
            recovery_status=record.recovery_status,
            error_summary=self._task_results.get(
                task_id, TaskResultResponse(task_id=task_id, status=record.status, completed=False)
            ).error,
        )

    async def list_tasks(
        self,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> TaskListResponse:
        """List tasks with deterministic pagination."""
        await self.initialize()
        clamped_limit = min(limit, self.settings.max_page_size)
        records = await self.persistence.repository.list_tasks(
            status=status, limit=clamped_limit, offset=offset
        )

        items = []
        for r in records:
            meta = deserialize_json(r.metadata_json) if r.metadata_json else {}
            items.append(
                TaskResponse(
                    task_id=r.task_id,
                    description=r.description,
                    status=r.status,
                    created_at=r.created_at,
                    started_at=r.started_at,
                    finished_at=r.finished_at,
                    metadata=meta,
                    iteration_count=r.current_position or None,
                    recovery_status=r.recovery_status,
                )
            )

        return TaskListResponse(
            items=items,
            total=len(items),
            limit=clamped_limit,
            offset=offset,
        )

    async def get_task_result(self, task_id: str) -> TaskResultResponse:
        """Retrieve final task result if completed or failed."""
        task = await self.get_task(task_id)
        if task.status in (TaskStatus.CREATED.value, TaskStatus.RUNNING.value):
            raise APIException(
                status_code=400,
                code="FG-TASK-NOT-READY",
                message=f"Task '{task_id}' is still in progress (status: {task.status}).",
                task_id=task_id,
            )

        if task_id in self._task_results:
            return self._task_results[task_id]

        # Reconstruct result from latest checkpoint or persisted state
        latest_cp = await self.persistence.repository.get_latest_checkpoint(task_id)
        outputs = (
            deserialize_json(latest_cp.partial_outputs_json)
            if latest_cp and latest_cp.partial_outputs_json
            else {}
        )

        return TaskResultResponse(
            task_id=task_id,
            status=task.status,
            completed=task.status == TaskStatus.COMPLETED.value,
            final_response=None,
            outputs=outputs,
            error=None,
        )

    async def cancel_task(self, task_id: str) -> TaskCancelResponse:
        """Cancel a running or created task safely."""
        async with self._get_task_lock(task_id):
            task_info = await self.get_task(task_id)

            if task_info.status in (
                TaskStatus.COMPLETED.value,
                TaskStatus.FAILED.value,
                TaskStatus.CANCELLED.value,
            ):
                return TaskCancelResponse(
                    task_id=task_id,
                    status=task_info.status,
                    cancelled=False,
                    message=f"Task is already in terminal state '{task_info.status}'.",
                )

            # Signal cancellation
            if task_id in self._active_tasks:
                self._active_tasks[task_id].cancel()

            fg_task = Task(description=task_info.description, task_id=task_id)
            fg_task.status = TaskStatus(task_info.status)
            fg_task.transition(TaskStatus.CANCELLED)
            await self.persistence.on_task_cancelled(fg_task)

            # Notify observers
            await self.observability.on_task_cancelled(fg_task)

            return TaskCancelResponse(
                task_id=task_id,
                status=TaskStatus.CANCELLED.value,
                cancelled=True,
                message="Task execution successfully cancelled.",
            )

    async def resume_task(self, task_id: str) -> TaskResumeResponse:
        """Safely resume an interrupted or recoverable task from checkpoints."""
        async with self._get_task_lock(task_id):
            task_info = await self.get_task(task_id)

            active_job = self._active_tasks.get(task_id)
            if (active_job is not None and not active_job.done()) or task_info.status == TaskStatus.RUNNING.value:
                raise APIException(
                    status_code=409,
                    code="FG-STATE-409",
                    message=f"Cannot resume task '{task_id}': task is currently active.",
                    task_id=task_id,
                )

            # Run recovery assessment
            recovery_engine = RecoveryEngine(self.persistence)
            report = await recovery_engine.recover_task(task_id)

            if not report.can_resume_safely:
                reasons = "; ".join(report.warnings) or "Unrecoverable side-effects detected."
                raise APIException(
                    status_code=409,
                    code="FG-RECOVERY-409",
                    message=f"Task '{task_id}' cannot be safely resumed: {reasons}",
                    task_id=task_id,
                    details={
                        "warnings": report.warnings,
                        "uncertain_calls": report.uncertain_calls,
                    },
                )

            workspace_id = (task_info.metadata or {}).get("workspace_id")
            workspace_path = None
            if workspace_id:
                ws_rec = await self.workspace_registry.get_workspace(workspace_id)
                if ws_rec:
                    workspace_path = ws_rec.root_path

            engine = self._build_engine(workspace_id=workspace_id, workspace_path=workspace_path)
            budget = self._build_budget(None)

            # Spawn resumed agent execution
            async def _bg_resume() -> None:
                fg_task = Task(description=task_info.description, task_id=task_id)
                agent = Agent(
                    engine=engine,
                    provider=self.provider,
                    max_iterations=budget.max_tool_calls,
                )
                try:
                    res = await agent.resume(task_id, budget=budget)
                    self._task_results[task_id] = TaskResultResponse(
                        task_id=task_id,
                        status=res.status.value,
                        completed=res.status == AgentStatus.COMPLETED,
                        final_response=res.final_response,
                        outputs=(
                            {"final_response": res.final_response}
                            if res.final_response
                            else {}
                        ),
                        error="; ".join(res.errors) if res.errors else None,
                    )
                except Exception as exc:
                    logger.exception("Resume for task %s failed: %s", task_id, exc)
                    fg_task.status = TaskStatus.FAILED
                    await self.persistence.on_task_failed(fg_task, type(exc).__name__, str(exc))

            bg_task = asyncio.create_task(_bg_resume())
            self._active_tasks[task_id] = bg_task

            return TaskResumeResponse(
                task_id=task_id,
                status=TaskStatus.RUNNING.value,
                resumed=True,
                message="Task successfully resumed from checkpoint.",
                completed_calls=report.completed_calls,
            )

    async def get_task_diagnostics(self, task_id: str) -> TaskDiagnosticsResponse:
        """Retrieve task timeline, policy decisions, budget consumption, and trace."""
        await self.get_task(task_id)  # verify existence
        trace = self.observability.get_trace_by_task(task_id)
        timeline = self.observability.get_timeline(task_id)
        diagnostics = self.observability.get_diagnostics(task_id)

        latest_cp = await self.persistence.repository.get_latest_checkpoint(task_id)
        budget_snapshot = (
            deserialize_json(latest_cp.budget_state_json)
            if latest_cp and latest_cp.budget_state_json
            else None
        )

        recovery_info = None
        recovery_engine = RecoveryEngine(self.persistence)
        try:
            report = await recovery_engine.recover_task(task_id, read_only=True)
            recovery_info = {
                "can_resume_safely": report.can_resume_safely,
                "completed_calls": report.completed_calls,
                "uncertain_calls": report.uncertain_calls,
                "warnings": report.warnings,
            }
        except Exception:
            pass

        return TaskDiagnosticsResponse(
            task_id=task_id,
            trace_id=trace.trace_id if trace else None,
            timeline=[t.to_dict() for t in timeline],
            diagnostics=[d.to_dict() for d in diagnostics],
            budget_snapshot=budget_snapshot,
            recovery_info=recovery_info,
        )

    async def stream_task_events(
        self,
        task_id: str,
        last_event_id: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream real-time SSE events with replay and heartbeat support."""
        await self.get_task(task_id)  # verify existence

        # 1. Replay historical events
        last_seq = 0
        if last_event_id:
            try:
                last_seq = int(last_event_id)
            except ValueError:
                last_seq = 0

        past_events = (
            await self.persistence.repository.get_events_after(task_id, last_seq)
            if last_seq > 0
            else await self.persistence.repository.get_events(task_id)
        )

        for pe in past_events:
            payload = deserialize_json(pe.payload_json) if pe.payload_json else {}
            yield (
                f"id: {pe.sequence_number}\nevent: {pe.event_type}\ndata: {json.dumps(payload)}\n\n"
            )
            last_seq = max(last_seq, pe.sequence_number)

        # 2. Check if task is already terminal
        task_record = await self.persistence.repository.get_task(task_id)
        if task_record and task_record.status in (
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.CANCELLED.value,
        ):
            close_data = json.dumps({"status": task_record.status})
            yield f"id: {last_seq + 1}\nevent: stream_closed\ndata: {close_data}\n\n"
            return

        # 3. Subscribe to live events
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        if task_id not in self._subscribers:
            self._subscribers[task_id] = set()
        self._subscribers[task_id].add(queue)

        try:
            terminal_types = {
                "task_completed",
                "task_failed",
                "task_cancelled",
                "stream_closed",
            }
            while True:
                try:
                    event_data = await asyncio.wait_for(
                        queue.get(),
                        timeout=self.settings.sse_heartbeat_seconds,
                    )
                    last_seq += 1
                    etype = event_data.get("type", "message")
                    yield f"id: {last_seq}\nevent: {etype}\ndata: {json.dumps(event_data)}\n\n"

                    # If stream closing event
                    if etype in terminal_types:
                        break
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield ": keepalive\n\n"

                # Check if task finished in persistence while waiting, only if queue is drained
                if queue.empty():
                    task_check = await self.persistence.repository.get_task(task_id)
                    if task_check and task_check.status in (
                        TaskStatus.COMPLETED.value,
                        TaskStatus.FAILED.value,
                        TaskStatus.CANCELLED.value,
                    ):
                        close_data = json.dumps({"status": task_check.status})
                        yield f"id: {last_seq + 1}\nevent: stream_closed\ndata: {close_data}\n\n"
                        break
        finally:
            if task_id in self._subscribers:
                self._subscribers[task_id].discard(queue)
                if not self._subscribers[task_id]:
                    self._subscribers.pop(task_id, None)
