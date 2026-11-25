from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.core.enums import TaskStatus
from forgeguard.persistence.manager import PersistenceManager
from forgeguard.persistence.models import JournalEventRecord, TaskRecord
from forgeguard.persistence.repository import serialize_json, utc_iso_now
from forgeguard.runtime.service import RuntimeService


@pytest.fixture
def sse_app_env(
    tmp_path: Path,
) -> Iterator[tuple[TestClient, RuntimeService, PersistenceManager]]:
    db_file = tmp_path / "test_sse.db"
    settings = ForgeGuardSettings(
        auth_disabled=True,
        db_path=str(db_file),
        sse_heartbeat_seconds=1.0,
    )
    persistence = PersistenceManager(db_path=str(db_file))
    service = RuntimeService(settings=settings, persistence=persistence)
    app = create_app(settings=settings, runtime_service=service)

    with TestClient(app) as client:
        yield client, service, persistence


@pytest.mark.asyncio
async def test_sse_event_streaming_and_replay(
    sse_app_env: tuple[TestClient, RuntimeService, PersistenceManager],
) -> None:
    client, service, persistence = sse_app_env
    await service.initialize()

    # 1. Create a task in persistence
    task_id = "task-sse-test-1"
    now = utc_iso_now()
    await persistence.repository.create_task(
        TaskRecord(
            task_id=task_id,
            description="SSE testing",
            status=TaskStatus.COMPLETED.value,
            created_at=now,
            last_updated_at=now,
        )
    )

    # 2. Append journal events
    for seq in range(1, 4):
        await persistence.repository.append_event(
            JournalEventRecord(
                event_id=f"ev-{seq}",
                task_id=task_id,
                sequence_number=seq,
                event_type="tool_completed" if seq < 3 else "task_completed",
                timestamp=now,
                payload_json=serialize_json({"step": seq, "result": seq * 10}),
            )
        )

    # 3. Stream all events
    with client.stream("GET", f"/api/v1/tasks/{task_id}/events") as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        lines = list(response.iter_lines())

    # Verify event lines
    content = "\n".join(lines)
    assert "event: tool_completed" in content
    assert "event: task_completed" in content
    assert "id: 1" in content
    assert "id: 2" in content
    assert "id: 3" in content


@pytest.mark.asyncio
async def test_sse_last_event_id_reconnection(
    sse_app_env: tuple[TestClient, RuntimeService, PersistenceManager],
) -> None:
    client, service, persistence = sse_app_env
    await service.initialize()

    task_id = "task-sse-replay-2"
    now = utc_iso_now()
    await persistence.repository.create_task(
        TaskRecord(
            task_id=task_id,
            description="Replay test",
            status=TaskStatus.COMPLETED.value,
            created_at=now,
            last_updated_at=now,
        )
    )

    # Append 5 events
    for seq in range(1, 6):
        await persistence.repository.append_event(
            JournalEventRecord(
                event_id=f"ev-rep-{seq}",
                task_id=task_id,
                sequence_number=seq,
                event_type=f"step_{seq}",
                timestamp=now,
                payload_json=serialize_json({"step_num": seq}),
            )
        )

    # Client reconnects specifying Last-Event-ID = 3
    # Should only receive event 4 and 5
    with client.stream(
        "GET",
        f"/api/v1/tasks/{task_id}/events",
        headers={"Last-Event-ID": "3"},
    ) as response:
        assert response.status_code == 200
        content = "\n".join(response.iter_lines())

    assert "id: 1" not in content
    assert "id: 2" not in content
    assert "id: 3" not in content
    assert "id: 4" in content
    assert "id: 5" in content
    assert "event: step_4" in content
    assert "event: step_5" in content
