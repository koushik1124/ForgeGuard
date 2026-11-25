from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    db_file = tmp_path / "test_health.db"
    settings = ForgeGuardSettings(
        auth_disabled=True,
        db_path=str(db_file),
        api_key="test-key",
        max_request_bytes=5000,
    )
    service = RuntimeService(settings=settings)
    app = create_app(settings=settings, runtime_service=service)
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "timestamp" in data
    assert data["version"] == "0.1.0"
    assert "X-Request-ID" in res.headers


def test_readiness_endpoint(client: TestClient) -> None:
    res = client.get("/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["database"] is True
    assert data["engine"] is True


def test_max_request_size_middleware_rejection(client: TestClient) -> None:
    # Send a request exceeding the 5000 byte limit
    large_body = {"prompt": "x" * 6000}
    res = client.post("/api/v1/tasks", json=large_body)
    assert res.status_code == 413
    data = res.json()
    assert data["error"]["code"] == "FG-REQ-413"
    assert "Request entity too large" in data["error"]["message"]
