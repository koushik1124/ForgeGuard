from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService


@pytest.fixture
def eval_runner_client(tmp_path: Path) -> Iterator[tuple[TestClient, Path, RuntimeService]]:
    db_file = tmp_path / "test_eval_runner.db"
    reports_dir = tmp_path / "eval_reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    settings = ForgeGuardSettings(
        auth_disabled=False,
        api_key="eval-runner-key",
        db_path=str(db_file),
        eval_reports_dir=str(reports_dir),
    )
    service = RuntimeService(settings=settings)
    app = create_app(settings=settings, runtime_service=service)

    with TestClient(app) as client:
        yield client, reports_dir, service


def test_start_run_validation_errors(eval_runner_client: tuple[TestClient, Path, RuntimeService]) -> None:
    client, _, _ = eval_runner_client
    headers = {"X-API-Key": "eval-runner-key"}

    # 1. Empty suites and scenario_ids
    res = client.post(
        "/api/v1/evaluations/runs",
        headers=headers,
        json={"name": "test_empty", "suites": [], "scenario_ids": []},
    )
    assert res.status_code == 400
    assert "FG-EVAL-400" in res.text

    # 2. Unknown suite
    res = client.post(
        "/api/v1/evaluations/runs",
        headers=headers,
        json={"name": "test_invalid_suite", "suites": ["nonexistent_suite"]},
    )
    assert res.status_code == 400
    assert "FG-EVAL-400" in res.text

    # 3. Unknown scenario ID
    res = client.post(
        "/api/v1/evaluations/runs",
        headers=headers,
        json={"name": "test_invalid_scenario", "scenario_ids": ["nonexistent_scenario_123"]},
    )
    assert res.status_code == 400
    assert "FG-EVAL-400" in res.text


def test_start_run_and_concurrency(eval_runner_client: tuple[TestClient, Path, RuntimeService]) -> None:
    client, _, service = eval_runner_client
    headers = {"X-API-Key": "eval-runner-key"}

    # Start a fast scenario: "rel_01_success"
    res = client.post(
        "/api/v1/evaluations/runs",
        headers=headers,
        json={
            "name": "governed_test_run",
            "scenario_ids": ["rel_01_success"],
        },
    )
    assert res.status_code == 202
    data = res.json()
    run_id = data["run_id"]
    assert data["name"] == "governed_test_run"
    assert data["status"] in ("queued", "running", "completed")
    assert data["total_scenarios"] == 1

    # Attempting to start another run immediately should trigger 409 Conflict if still active
    # (or succeeds if already completed due to speed)
    active_id = service.evaluation_runner.get_active_run_id()
    if active_id is not None:
        conflict_res = client.post(
            "/api/v1/evaluations/runs",
            headers=headers,
            json={
                "name": "conflicting_run",
                "scenario_ids": ["rel_01_success"],
            },
        )
        assert conflict_res.status_code == 409
        assert "FG-EVAL-409" in conflict_res.text

    # List runs
    list_res = client.get("/api/v1/evaluations/runs", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total_runs"] >= 1
    run_ids = [r["run_id"] for r in list_data["runs"]]
    assert run_id in run_ids

    # Get run details
    get_res = client.get(f"/api/v1/evaluations/runs/{run_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["run_id"] == run_id

    # Nonexistent run -> 404
    missing_res = client.get("/api/v1/evaluations/runs/nonexistent-run-999", headers=headers)
    assert missing_res.status_code == 404
    assert "FG-EVAL-404" in missing_res.text


def test_stream_run_events(eval_runner_client: tuple[TestClient, Path, RuntimeService]) -> None:
    client, reports_dir, _ = eval_runner_client
    headers = {"X-API-Key": "eval-runner-key"}

    # Start a run
    res = client.post(
        "/api/v1/evaluations/runs",
        headers=headers,
        json={
            "name": "stream_test_run",
            "scenario_ids": ["rel_01_success"],
        },
    )
    assert res.status_code == 202
    run_id = res.json()["run_id"]

    # Stream events via SSE endpoint
    with client.stream("GET", f"/api/v1/evaluations/runs/{run_id}/events", headers=headers) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        chunks = []
        for chunk in response.iter_text():
            chunks.append(chunk)
            if "stream_closed" in chunk or len(chunks) > 10:
                break

        full_stream = "".join(chunks)
        assert "event:" in full_stream

    # Wait for completion if needed
    for _ in range(50):
        run_res = client.get(f"/api/v1/evaluations/runs/{run_id}", headers=headers)
        if run_res.json()["status"] == "completed":
            break
        time.sleep(0.1)

    completed_state = client.get(f"/api/v1/evaluations/runs/{run_id}", headers=headers).json()
    assert completed_state["status"] == "completed"
    assert completed_state["completed_scenarios"] == 1
    assert completed_state["passed"] >= 1

    # Verify report was exported to disk
    report_file = reports_dir / f"report_{run_id}.json"
    assert report_file.exists()


def test_eval_run_id_validation_rejects_traversal(
    eval_runner_client: tuple[TestClient, Path, RuntimeService],
) -> None:
    client, _, _ = eval_runner_client
    headers = {"X-API-Key": "eval-runner-key"}

    # Path traversal and invalid characters in run_id
    res1 = client.get("/api/v1/evaluations/runs/invalid..id", headers=headers)
    assert res1.status_code == 400
    assert "FG-EVAL-400" in res1.text

    res2 = client.get("/api/v1/evaluations/runs/invalid;run!id/events", headers=headers)
    assert res2.status_code == 400
    assert "FG-EVAL-400" in res2.text


@pytest.mark.asyncio
async def test_eval_runner_cancellation_lifecycle(tmp_path: Path) -> None:
    from forgeguard.evaluation.service import EvaluationRunnerService, EvaluationRunStatus
    from forgeguard.evaluation.scenarios import get_scenario_by_id

    reports_dir = tmp_path / "eval_cancel_reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    service = EvaluationRunnerService(reports_dir=reports_dir)

    # Launch run
    state = await service.start_evaluation_run(
        name="cancel_test",
        scenario_ids=["rel_01_success"],
    )
    run_id = state.run_id

    # Cancel via close()
    await service.close()

    # Verify state was marked FAILED and completed_at is set
    cancelled_state = service.get_run(run_id)
    assert cancelled_state is not None
    assert cancelled_state.status == EvaluationRunStatus.FAILED
    assert "cancelled" in (cancelled_state.error_summary or "").lower()
    assert cancelled_state.completed_at is not None

    # Verify lock is released and new run can start
    new_state = await service.start_evaluation_run(
        name="after_cancel",
        scenario_ids=["rel_01_success"],
    )
    assert new_state.run_id != run_id
    await service.close()

