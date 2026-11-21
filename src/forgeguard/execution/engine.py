from __future__ import annotations

from forgeguard.core.enums import TaskStatus
from forgeguard.core.task import Task
from forgeguard.events.event import ExecutionEvent
from forgeguard.execution.context import ExecutionContext
from forgeguard.execution.result import ExecutionResult
from forgeguard.execution.tool_call import ToolCall
from forgeguard.tools.registry import ToolRegistry


class ExecutionEngine:
    def __init__(self, registry: ToolRegistry) -> None:
        self.registry = registry

    async def execute(
        self,
        task: Task,
        tool_calls: list[ToolCall],
    ) -> ExecutionResult:
        events: list[ExecutionEvent] = []
        context = ExecutionContext(task=task)

        try:
            task.transition(TaskStatus.RUNNING)

            events.append(
                ExecutionEvent.create(
                    "task_started",
                    {"task_id": task.task_id},
                )
            )

            for index, call in enumerate(tool_calls):
                events.append(
                    ExecutionEvent.create(
                        "tool_call_started",
                        {
                            "tool_name": call.tool_name,
                            "call_id": call.call_id,
                            "step": index,
                        },
                    )
                )

                tool = self.registry.get(call.tool_name)

                output = await tool.invoke(call.arguments)

                context.outputs[f"step_{index}"] = output

                events.append(
                    ExecutionEvent.create(
                        "tool_call_completed",
                        {
                            "tool_name": call.tool_name,
                            "call_id": call.call_id,
                            "step": index,
                            "status": "success",
                            "output": output,
                        },
                    )
                )

            task.transition(TaskStatus.COMPLETED)

            events.append(
                ExecutionEvent.create(
                    "task_completed",
                    {
                    "task_id": task.task_id,
                    "steps": len(tool_calls),
                    },
                )
            )

            return ExecutionResult(
                task_id=task.task_id,
                status=task.status,
                outputs=context.outputs,
                events=events,
            )

        except Exception as exc:
            if task.status == TaskStatus.RUNNING:
                task.transition(TaskStatus.FAILED)

            events.append(
                ExecutionEvent.create(
                    "task_failed",
                    {
                        "task_id": task.task_id,
                        "error_type": type(exc).__name__,
                        "error": str(exc),
                    },
                )
            )

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