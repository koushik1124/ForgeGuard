from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from forgeguard.agent.providers.mock import MockProvider
from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService
from forgeguard.sdk import (
    AsyncForgeGuardClient,
    AuthenticationError,
    ConflictError,
    ForgeGuardClient,
    NotFoundError,
)


@pytest.fixture
def sdk_server(tmp_path: Path) -> tuple[FastAPI, Path]:
    db_file = tmp_path / "sdk_test.db"
    settings = ForgeGuardSettings(
        auth_disabled=False,
        api_key="sdk-secret-key",
        db_path=str(db_file),
    )
    provider = MockProvider()
    for _ in range(10):
        provider.queue_response(
            {
                "action_type": "final",
                "final_response": "SDK processed",
                "summary": "Done",
            }
        )
    service = RuntimeService(settings=settings, provider=provider)
    app = create_app(settings=settings, runtime_service=service)
    return app, tmp_path


def test_sync_sdk_client_operations(sdk_server: tuple[FastAPI, Path]) -> None:
    app, tmp_path = sdk_server

    with TestClient(app) as test_client:
        with ForgeGuardClient(api_key="sdk-secret-key", http_client=test_client) as client:
            # 1. Register a workspace
            ws_dir = tmp_path / "sdk_project"
            ws_dir.mkdir()
            ws = client.register_workspace(name="SDK Project", root_path=str(ws_dir))
            assert ws.name == "SDK Project"
            assert ws.workspace_id.startswith("ws-")

            # 2. Submit task
            task = client.submit(
                prompt="Hello from Sync SDK",
                workspace_id=ws.workspace_id,
                idempotency_key="sdk-key-1",
            )
            assert task.task_id.startswith("task-")
            assert task.status == "created"

            # 3. Get task
            info = client.get_task(task.task_id)
            assert info.task_id == task.task_id

            # 4. List tasks
            tasks = client.list_tasks(limit=10)
            assert len(tasks) >= 1

            # 5. Cancel task
            cancel_info = client.cancel(task.task_id)
            assert cancel_info.task_id == task.task_id
            assert cancel_info.status in {"cancelled", "completed", "running"}

            # 6. Diagnostics
            diag = client.get_diagnostics(task.task_id)
            assert diag.task_id == task.task_id
            assert isinstance(diag.timeline, list)

            # 7. Workspace list and inspect
            workspaces = client.list_workspaces()
            assert len(workspaces) == 1
            inspected = client.get_workspace(ws.workspace_id)
            assert inspected.name == "SDK Project"

            # 8. Unregister workspace
            assert client.delete_workspace(ws.workspace_id) is True


@pytest.mark.asyncio
async def test_async_sdk_client_operations(sdk_server: tuple[FastAPI, Path]) -> None:
    app, tmp_path = sdk_server
    transport = httpx.ASGITransport(app=app)

    async with AsyncForgeGuardClient(api_key="sdk-secret-key", transport=transport) as client:
        # 1. Register workspace
        ws_dir = tmp_path / "async_project"
        ws_dir.mkdir()
        ws = await client.register_workspace(name="Async Project", root_path=str(ws_dir))
        assert ws.name == "Async Project"

        # 2. Submit task
        task = await client.submit(prompt="Hello from Async SDK")
        assert task.task_id.startswith("task-")

        # 3. Get task
        info = await client.get_task(task.task_id)
        assert info.task_id == task.task_id

        # 4. List tasks
        items = await client.list_tasks()
        assert len(items) >= 1

        # 5. Cancel task
        cancelled = await client.cancel(task.task_id)
        assert cancelled.task_id == task.task_id
        assert cancelled.status in {"cancelled", "completed", "running"}


def test_sdk_error_handling(sdk_server: tuple[FastAPI, Path]) -> None:
    app, _ = sdk_server

    with TestClient(app) as test_client:
        # 1. Authentication failure
        with ForgeGuardClient(api_key="invalid-key", http_client=test_client) as client:
            with pytest.raises(AuthenticationError) as auth_exc:
                client.list_tasks()
            assert auth_exc.value.status_code == 401
            assert auth_exc.value.code == "FG-AUTH-401"

        # 2. Not found error
        with ForgeGuardClient(api_key="sdk-secret-key", http_client=test_client) as client:
            with pytest.raises(NotFoundError) as not_found_exc:
                client.get_task("task-nonexistent-12345")
            assert not_found_exc.value.status_code == 404
            assert not_found_exc.value.code == "FG-TASK-404"

        # 3. Idempotency conflict error
        with ForgeGuardClient(api_key="sdk-secret-key", http_client=test_client) as client:
            client.submit(prompt="Original prompt", idempotency_key="conflict-key")
            with pytest.raises(ConflictError) as conflict_exc:
                client.submit(prompt="Conflicting prompt", idempotency_key="conflict-key")
            assert conflict_exc.value.status_code == 409
            assert conflict_exc.value.code == "FG-IDEMP-409"
