from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from forgeguard.agent.providers.mock import MockProvider
from forgeguard.api.errors import APIException
from forgeguard.api.schemas import TaskResponse, TaskSubmitRequest
from forgeguard.config import ForgeGuardSettings
from forgeguard.core.enums import TaskStatus
from forgeguard.core.exceptions import InvalidStateTransitionError
from forgeguard.core.task import Task
from forgeguard.runtime.service import RuntimeService


def test_task_state_transition_machine() -> None:
    task = Task(description="Lifecycle test")
    assert task.status.value == TaskStatus.CREATED.value

    # Valid transitions
    task.transition(TaskStatus.RUNNING)
    assert task.status.value == TaskStatus.RUNNING.value
    assert task.started_at is not None

    task.transition(TaskStatus.COMPLETED)
    assert task.status.value == TaskStatus.COMPLETED.value
    assert task.finished_at is not None

    # Invalid transitions from terminal state
    with pytest.raises(InvalidStateTransitionError):
        task.transition(TaskStatus.RUNNING)

    with pytest.raises(InvalidStateTransitionError):
        task.transition(TaskStatus.CANCELLED)


@pytest.mark.asyncio
async def test_concurrent_task_submissions(tmp_path: Path) -> None:
    db_file = tmp_path / "concurrent_sub.db"
    settings = ForgeGuardSettings(
        auth_disabled=True,
        db_path=str(db_file),
    )
    provider = MockProvider()
    for _ in range(10):
        provider.queue_response(
            {
                "action_type": "final",
                "final_response": "Processed",
                "summary": "Done",
            }
        )
    service = RuntimeService(settings=settings, provider=provider)
    await service.initialize()

    async def _submit(i: int) -> TaskResponse:
        req = TaskSubmitRequest(prompt=f"Concurrent task {i}", metadata={"idx": i})
        return await service.submit_task(req)

    # Submit 5 concurrent tasks simultaneously
    results = await asyncio.gather(*[_submit(i) for i in range(5)])
    assert len(results) == 5
    task_ids = {r.task_id for r in results}
    assert len(task_ids) == 5  # Each task gets a distinct unique ID

    # Verify all tasks are listed in persistence
    listed = await service.list_tasks(limit=10)
    assert listed.total == 5

    await service.close()


@pytest.mark.asyncio
async def test_double_start_prevention(tmp_path: Path) -> None:
    db_file = tmp_path / "double_start.db"
    settings = ForgeGuardSettings(
        auth_disabled=True,
        db_path=str(db_file),
    )
    service = RuntimeService(settings=settings)
    await service.initialize()

    # Create task manually in RUNNING state
    task_id = "task-running-active"
    from forgeguard.persistence.models import TaskRecord
    from forgeguard.persistence.repository import utc_iso_now

    now = utc_iso_now()
    await service.persistence.repository.create_task(
        TaskRecord(
            task_id=task_id,
            description="Active running task",
            status=TaskStatus.RUNNING.value,
            created_at=now,
            last_updated_at=now,
        )
    )

    # Attempting to resume an actively running task must raise 409 FG-STATE-409
    with pytest.raises(APIException) as exc_info:
        await service.resume_task(task_id)
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "FG-STATE-409"

    await service.close()
