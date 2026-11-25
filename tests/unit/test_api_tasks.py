from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forgeguard.agent.providers.mock import MockProvider
from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService


@pytest.fixture
def test_env(tmp_path: Path) -> Iterator[tuple[TestClient, RuntimeService, MockProvider]]:
    db_file = tmp_path / "test_tasks.db"
    settings = ForgeGuardSettings(
        auth_disabled=False,
        api_key="secret-api-key",
        db_path=str(db_file),
    )
    provider = MockProvider()
    provider.queue_response(
        {
            "action_type": "final",
            "final_response": "The answer is 42.",
            "summary": "Done",
        }
    )

    service = RuntimeService(settings=settings, provider=provider)
    app = create_app(settings=settings, runtime_service=service)

    with TestClient(app) as client:
        yield client, service, provider


def test_authentication_required_and_enforced(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env

    # 1. Missing header -> 401
    res = client.get("/api/v1/tasks")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "FG-AUTH-401"

    # 2. Invalid API key -> 401
    res = client.get("/api/v1/tasks", headers={"X-API-Key": "wrong-key"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "FG-AUTH-401"

    # 3. Valid API key via X-API-Key -> 200
    res = client.get("/api/v1/tasks", headers={"X-API-Key": "secret-api-key"})
    assert res.status_code == 200

    # 4. Valid API key via Authorization Bearer -> 200
    res = client.get("/api/v1/tasks", headers={"Authorization": "Bearer secret-api-key"})
    assert res.status_code == 200


def test_task_submission_and_retrieval(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    # 1. Submit a valid task
    payload = {"prompt": "Calculate 10 + 20", "metadata": {"test": "val"}}
    res = client.post("/api/v1/tasks", json=payload, headers=headers)
    assert res.status_code == 202
    data = res.json()
    task_id = data["task_id"]
    assert task_id.startswith("task-")
    assert data["description"] == "Calculate 10 + 20"
    assert data["status"] == "created"
    assert data["metadata"]["test"] == "val"

    # 2. Get task details
    res_get = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert res_get.status_code == 200
    task_data = res_get.json()
    assert task_data["task_id"] == task_id

    # 3. Nonexistent task ID returns 404
    res_404 = client.get("/api/v1/tasks/task-nonexistent", headers=headers)
    assert res_404.status_code == 404
    assert res_404.json()["error"]["code"] == "FG-TASK-404"


def test_task_submission_validation(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    # 1. Missing prompt -> 422
    res = client.post("/api/v1/tasks", json={}, headers=headers)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "FG-REQ-422"

    # 2. Empty prompt -> 422
    res = client.post("/api/v1/tasks", json={"prompt": ""}, headers=headers)
    assert res.status_code == 422

    # 3. Extra forbidden field -> 422
    res = client.post(
        "/api/v1/tasks",
        json={"prompt": "Valid", "unknown_field": "disallowed"},
        headers=headers,
    )
    assert res.status_code == 422


def test_idempotent_task_submission(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env
    headers = {"X-API-Key": "secret-api-key", "Idempotency-Key": "idemp-test-key-1"}

    payload1 = {"prompt": "Run arithmetic analysis"}

    # 1. First submission succeeds
    res1 = client.post("/api/v1/tasks", json=payload1, headers=headers)
    assert res1.status_code == 202
    task_id_1 = res1.json()["task_id"]

    # 2. Second identical submission with same idempotency key returns exact same task
    res2 = client.post("/api/v1/tasks", json=payload1, headers=headers)
    assert res2.status_code == 200 or res2.status_code == 202
    task_id_2 = res2.json()["task_id"]
    assert task_id_1 == task_id_2

    # 3. Reusing same idempotency key with conflicting payload raises 409
    payload_conflict = {"prompt": "Completely different prompt"}
    res3 = client.post("/api/v1/tasks", json=payload_conflict, headers=headers)
    assert res3.status_code == 409
    assert res3.json()["error"]["code"] == "FG-IDEMP-409"


def test_task_cancellation(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    # Submit task
    res = client.post("/api/v1/tasks", json={"prompt": "Long task"}, headers=headers)
    task_id = res.json()["task_id"]

    # Cancel task
    res_cancel = client.post(f"/api/v1/tasks/{task_id}/cancel", headers=headers)
    assert res_cancel.status_code == 200
    cancel_data = res_cancel.json()
    assert cancel_data["cancelled"] is True
    assert cancel_data["status"] == "cancelled"

    # Cancelling again returns cancelled=False with informative message
    res_cancel2 = client.post(f"/api/v1/tasks/{task_id}/cancel", headers=headers)
    assert res_cancel2.status_code == 200
    assert res_cancel2.json()["cancelled"] is False


def test_task_listing_and_filtering(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    # Create several tasks
    for i in range(3):
        client.post("/api/v1/tasks", json={"prompt": f"Task number {i}"}, headers=headers)

    res = client.get("/api/v1/tasks?limit=2&offset=0", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 2
    assert data["limit"] == 2
    assert data["offset"] == 0


def test_task_diagnostics(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, _, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    res = client.post("/api/v1/tasks", json={"prompt": "Diagnostics test"}, headers=headers)
    task_id = res.json()["task_id"]

    diag_res = client.get(f"/api/v1/tasks/{task_id}/diagnostics", headers=headers)
    assert diag_res.status_code == 200
    diag_data = diag_res.json()
    assert diag_data["task_id"] == task_id
    assert "timeline" in diag_data
    assert "diagnostics" in diag_data


def test_task_submission_preserves_workspace_metadata(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
    tmp_path: Path,
) -> None:
    client, service, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    # Register workspace
    ws_dir = tmp_path / "custom_ws"
    ws_dir.mkdir()
    reg_res = client.post(
        "/api/v1/workspaces",
        json={"workspace_id": "test-ws-meta", "root_path": str(ws_dir), "name": "Custom Workspace"},
        headers=headers,
    )
    assert reg_res.status_code == 201

    # Submit task with workspace_id
    sub_res = client.post(
        "/api/v1/tasks",
        json={
            "prompt": "Test workspace metadata",
            "workspace_id": "test-ws-meta",
            "metadata": {"user": "analyst"},
        },
        headers=headers,
    )
    assert sub_res.status_code == 202
    sub_data = sub_res.json()
    task_id = sub_data["task_id"]
    assert sub_data["metadata"]["workspace_id"] == "test-ws-meta"
    assert sub_data["metadata"]["workspace_name"] == "Custom Workspace"
    assert sub_data["metadata"]["user"] == "analyst"

    # Get task detail
    get_res = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["metadata"]["workspace_id"] == "test-ws-meta"
    assert get_data["metadata"]["workspace_name"] == "Custom Workspace"


def test_task_diagnostics_does_not_mutate_active_task_status(
    test_env: tuple[TestClient, RuntimeService, MockProvider],
) -> None:
    client, service, _ = test_env
    headers = {"X-API-Key": "secret-api-key"}

    res = client.post("/api/v1/tasks", json={"prompt": "Diagnostics read-only check"}, headers=headers)
    task_id = res.json()["task_id"]

    # Call diagnostics
    diag_res = client.get(f"/api/v1/tasks/{task_id}/diagnostics", headers=headers)
    assert diag_res.status_code == 200

    # Verify task status in repository was not marked interrupted by the read-only diagnostics call
    task_res = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert task_res.status_code == 200
    task_data = task_res.json()
    assert task_data["recovery_status"] != "interrupted"

