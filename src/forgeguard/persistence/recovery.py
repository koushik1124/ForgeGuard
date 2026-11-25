from __future__ import annotations

from typing import Any

from forgeguard.core.enums import TaskStatus
from forgeguard.persistence.exceptions import RecordNotFoundError
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import (
    RecoveryReport,
    ToolExecutionStatus,
)
from forgeguard.persistence.repository import deserialize_json


class RecoveryEngine:
    """Engine responsible for inspecting, classifying, and reconstructing interrupted tasks."""

    def __init__(self, persistence: PersistenceManager) -> None:
        self.persistence = persistence
        self.repository = persistence.repository

    async def inspect_interrupted_tasks(self) -> list[RecoveryReport]:
        """Inspect all tasks in created or running state and generate recovery reports."""
        await self.persistence.initialize()
        active_tasks = await self.repository.list_active_tasks()
        reports = []
        for task_rec in active_tasks:
            reports.append(await self.recover_task(task_rec.task_id))
        return reports

    async def recover_task(self, task_id: str, read_only: bool = False) -> RecoveryReport:
        """Inspect and reconstruct the durable state of a task after process restart."""
        await self.persistence.initialize()

        task_record = await self.repository.get_task(task_id)
        if task_record is None:
            raise RecordNotFoundError(f"Task with ID '{task_id}' not found.")

        warnings: list[str] = []
        can_resume = True

        # If previous status was running, mark recovery status as interrupted (only when not read-only)
        if task_record.status == TaskStatus.RUNNING.value:
            if not read_only:
                await self.repository.update_task_status(
                    task_id=task_id,
                    status=task_record.status,
                    recovery_status="interrupted",
                )
                warnings.append(
                    f"Task '{task_id}' was running when execution stopped; marked as interrupted."
                )
            elif task_record.recovery_status == "interrupted":
                warnings.append(
                    f"Task '{task_id}' was running when execution stopped; marked as interrupted."
                )

        # Inspect tool execution records
        tool_records = await self.repository.list_tool_executions(task_id)
        completed_calls: list[str] = []
        pending_calls: list[str] = []
        failed_calls: list[str] = []
        uncertain_calls: list[str] = []
        tool_outputs: dict[str, Any] = {}

        for rec in tool_records:
            if rec.status == ToolExecutionStatus.COMPLETED.value:
                completed_calls.append(rec.tool_call_id)
                if rec.result_json is not None:
                    tool_outputs[f"step_{rec.sequence_number}"] = deserialize_json(rec.result_json)
            elif rec.status == ToolExecutionStatus.FAILED.value:
                failed_calls.append(rec.tool_call_id)
            elif rec.status == ToolExecutionStatus.PENDING.value:
                pending_calls.append(rec.tool_call_id)
            elif rec.status in (
                ToolExecutionStatus.RUNNING.value,
                ToolExecutionStatus.UNCERTAIN.value,
            ):
                # An incomplete tool execution is classified as uncertain
                uncertain_calls.append(rec.tool_call_id)
                if not read_only and rec.status == ToolExecutionStatus.RUNNING.value:
                    await self.repository.update_tool_execution(
                        task_id=task_id,
                        tool_call_id=rec.tool_call_id,
                        status=ToolExecutionStatus.UNCERTAIN.value,
                        recovery_classification="uncertain",
                    )
                warnings.append(
                    f"Tool call '{rec.tool_call_id}' ({rec.tool_name}) was interrupted; "
                    "classified as uncertain."
                )
                can_resume = False

        # Load latest checkpoint
        checkpoint = await self.repository.get_latest_checkpoint(task_id)
        reconstructed_position = 0
        partial_outputs: dict[str, Any] = {}
        budget_snapshot: dict[str, Any] | None = None
        checkpoint_id: str | None = None

        if checkpoint is not None:
            checkpoint_id = checkpoint.checkpoint_id
            reconstructed_position = checkpoint.execution_position
            try:
                chk_completed = deserialize_json(checkpoint.completed_calls_json)
                for call_id in chk_completed:
                    if call_id not in completed_calls:
                        completed_calls.append(call_id)

                partial_outputs = deserialize_json(checkpoint.partial_outputs_json)
                budget_snapshot = deserialize_json(checkpoint.budget_state_json)
            except Exception as exc:
                warnings.append(f"Failed to parse checkpoint '{checkpoint.checkpoint_id}': {exc}")
                can_resume = False
        else:
            # Reconstruct from tool execution records when no checkpoint exists
            partial_outputs = tool_outputs
            reconstructed_position = len(completed_calls)

        # Merge tool outputs into partial_outputs
        for k, v in tool_outputs.items():
            if k not in partial_outputs:
                partial_outputs[k] = v

        # Check terminal state restrictions
        if task_record.status in (TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value):
            can_resume = False
            warnings.append(
                f"Task '{task_id}' has terminal status '{task_record.status}' and cannot resume."
            )

        # Check budget metrics in recovered state for informational warnings
        if budget_snapshot is not None:
            remaining_calls = budget_snapshot.get("remaining_tool_calls", 1)
            remaining_time = budget_snapshot.get("remaining_seconds", 1.0)
            if remaining_calls <= 0:
                warnings.append("Remaining tool call budget is exhausted in snapshot.")
            if remaining_time <= 0:
                warnings.append("Remaining execution time budget is exhausted in snapshot.")

        return RecoveryReport(
            task_id=task_id,
            previous_status=task_record.status,
            reconstructed_position=reconstructed_position,
            completed_calls=completed_calls,
            pending_calls=pending_calls,
            failed_calls=failed_calls,
            uncertain_calls=uncertain_calls,
            checkpoint_id=checkpoint_id,
            partial_outputs=partial_outputs,
            budget_snapshot=budget_snapshot,
            warnings=warnings,
            can_resume_safely=can_resume,
        )
