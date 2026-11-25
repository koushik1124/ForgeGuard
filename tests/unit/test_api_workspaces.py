from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forgeguard.api.app import create_app
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService


@pytest.fixture
def workspace_client(tmp_path: Path) -> Iterator[tuple[TestClient, Path]]:
    db_file = tmp_path / "test_workspaces.db"
    settings = ForgeGuardSettings(
        auth_disabled=False,
        api_key="ws-test-key",
        db_path=str(db_file),
    )
    service = RuntimeService(settings=settings)
    app = create_app(settings=settings, runtime_service=service)

    with TestClient(app) as client:
        yield client, tmp_path


def test_workspace_registration_and_retrieval(
    workspace_client: tuple[TestClient, Path],
) -> None:
    client, tmp_path = workspace_client
    headers = {"X-API-Key": "ws-test-key"}

    # 1. Create a safe temporary directory
    valid_dir = tmp_path / "my_project"
    valid_dir.mkdir()

    # 2. Register workspace
    payload = {
        "name": "Project Alpha",
        "root_path": str(valid_dir),
        "workspace_id": "ws-alpha",
        "description": "Primary testing workspace",
    }
    res = client.post("/api/v1/workspaces", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["workspace_id"] == "ws-alpha"
    assert data["name"] == "Project Alpha"
    assert data["root_path"] == str(valid_dir.resolve())

    # 3. Retrieve workspace
    get_res = client.get("/api/v1/workspaces/ws-alpha", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Project Alpha"

    # 4. List workspaces
    list_res = client.get("/api/v1/workspaces", headers=headers)
    assert list_res.status_code == 200
    items = list_res.json()["workspaces"]
    assert len(items) == 1
    assert items[0]["workspace_id"] == "ws-alpha"


def test_workspace_security_validations(
    workspace_client: tuple[TestClient, Path],
) -> None:
    client, tmp_path = workspace_client
    headers = {"X-API-Key": "ws-test-key"}

    # 1. Nonexistent directory -> 400
    res_nonexistent = client.post(
        "/api/v1/workspaces",
        json={"name": "Fake", "root_path": str(tmp_path / "does_not_exist")},
        headers=headers,
    )
    assert res_nonexistent.status_code == 400
    assert res_nonexistent.json()["error"]["code"] == "FG-WORKSPACE-400"

    # 2. File instead of directory -> 400
    a_file = tmp_path / "file.txt"
    a_file.write_text("hello")
    res_file = client.post(
        "/api/v1/workspaces",
        json={"name": "File", "root_path": str(a_file)},
        headers=headers,
    )
    assert res_file.status_code == 400
    assert res_file.json()["error"]["code"] == "FG-WORKSPACE-400"

    # 3. Forbidden system root -> 400
    res_root = client.post(
        "/api/v1/workspaces",
        json={"name": "Root", "root_path": "/"},
        headers=headers,
    )
    assert res_root.status_code == 400
    assert res_root.json()["error"]["code"] == "FG-WORKSPACE-400"


def test_safe_workspace_unregistration(
    workspace_client: tuple[TestClient, Path],
) -> None:
    client, tmp_path = workspace_client
    headers = {"X-API-Key": "ws-test-key"}

    valid_dir = tmp_path / "del_project"
    valid_dir.mkdir()
    file_in_dir = valid_dir / "preserve_me.txt"
    file_in_dir.write_text("important user code")

    # Register
    client.post(
        "/api/v1/workspaces",
        json={"name": "Del", "root_path": str(valid_dir), "workspace_id": "ws-del"},
        headers=headers,
    )

    # Delete registration
    del_res = client.delete("/api/v1/workspaces/ws-del", headers=headers)
    assert del_res.status_code == 204

    # Getting deleted workspace returns 404
    get_res = client.get("/api/v1/workspaces/ws-del", headers=headers)
    assert get_res.status_code == 404

    # Crucial security guarantee: Disk files MUST NOT be deleted
    assert valid_dir.exists()
    assert file_in_dir.exists()
    assert file_in_dir.read_text() == "important user code"


def test_workspace_directory_listing_and_filtering(
    workspace_client: tuple[TestClient, Path],
) -> None:
    client, tmp_path = workspace_client
    headers = {"X-API-Key": "ws-test-key"}

    # Setup files in workspace
    ws_dir = tmp_path / "browse_ws"
    ws_dir.mkdir()
    (ws_dir / "main.py").write_text("print('hello')", encoding="utf-8")
    (ws_dir / "README.md").write_text("# Project", encoding="utf-8")
    (ws_dir / ".hidden_file").write_text("hidden", encoding="utf-8")
    (ws_dir / ".git").mkdir()
    (ws_dir / ".git" / "config").write_text("repo", encoding="utf-8")

    sub = ws_dir / "src"
    sub.mkdir()
    (sub / "app.py").write_text("app = 1", encoding="utf-8")

    # Register workspace
    client.post(
        "/api/v1/workspaces",
        json={"name": "Browse", "root_path": str(ws_dir), "workspace_id": "ws-browse"},
        headers=headers,
    )

    # 1. Root listing default (hidden files excluded)
    res = client.get("/api/v1/workspaces/ws-browse/files", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["workspace_id"] == "ws-browse"
    assert data["subpath"] == ""
    names = [e["name"] for e in data["entries"]]
    assert "main.py" in names
    assert "README.md" in names
    assert "src" in names
    assert ".hidden_file" not in names
    assert ".git" not in names

    # 2. Subdirectory listing
    res_sub = client.get(
        "/api/v1/workspaces/ws-browse/files",
        params={"subpath": "src"},
        headers=headers,
    )
    assert res_sub.status_code == 200
    sub_data = res_sub.json()
    assert len(sub_data["entries"]) == 1
    assert sub_data["entries"][0]["name"] == "app.py"
    assert sub_data["entries"][0]["relative_path"] == "src/app.py"
    assert sub_data["entries"][0]["is_directory"] is False

    # 3. Path traversal rejected with 403
    res_trav = client.get(
        "/api/v1/workspaces/ws-browse/files",
        params={"subpath": "../"},
        headers=headers,
    )
    assert res_trav.status_code == 403
    assert res_trav.json()["error"]["code"] == "FG-WORKSPACE-403"

    # 4. Nonexistent subdirectory returns 404
    res_404 = client.get(
        "/api/v1/workspaces/ws-browse/files",
        params={"subpath": "nonexistent_sub"},
        headers=headers,
    )
    assert res_404.status_code == 404
    assert res_404.json()["error"]["code"] == "FG-WORKSPACE-404"

    # 5. File targeted as directory returns 400
    res_file = client.get(
        "/api/v1/workspaces/ws-browse/files",
        params={"subpath": "main.py"},
        headers=headers,
    )
    assert res_file.status_code == 400
    assert res_file.json()["error"]["code"] == "FG-WORKSPACE-400"


def test_workspace_file_preview_security_and_truncation(
    workspace_client: tuple[TestClient, Path],
) -> None:
    client, tmp_path = workspace_client
    headers = {"X-API-Key": "ws-test-key"}

    ws_dir = tmp_path / "preview_ws"
    ws_dir.mkdir()
    (ws_dir / "normal.txt").write_text("Hello World Content", encoding="utf-8")
    (ws_dir / "large.txt").write_text("A" * 1000, encoding="utf-8")
    (ws_dir / ".env").write_text("SECRET_KEY=12345", encoding="utf-8")
    (ws_dir / "credentials.json").write_text('{"api_key": "secret"}', encoding="utf-8")
    (ws_dir / "server.key").write_text("-----BEGIN PRIVATE KEY-----", encoding="utf-8")
    (ws_dir / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

    outside_file = tmp_path / "outside.txt"
    outside_file.write_text("Escape Data", encoding="utf-8")

    client.post(
        "/api/v1/workspaces",
        json={"name": "Preview", "root_path": str(ws_dir), "workspace_id": "ws-prev"},
        headers=headers,
    )

    # 1. Normal text preview
    res = client.get(
        "/api/v1/workspaces/ws-prev/file",
        params={"path": "normal.txt"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "normal.txt"
    assert data["content"] == "Hello World Content"
    assert data["is_truncated"] is False
    assert data["is_binary"] is False
    assert data["size_bytes"] == len("Hello World Content")

    # 2. Truncation when max_bytes < file size
    res_trunc = client.get(
        "/api/v1/workspaces/ws-prev/file",
        params={"path": "large.txt", "max_bytes": 100},
        headers=headers,
    )
    assert res_trunc.status_code == 200
    data_trunc = res_trunc.json()
    assert data_trunc["is_truncated"] is True
    assert data_trunc["read_bytes"] == 100
    assert len(data_trunc["content"]) == 100

    # 3. Sensitive files blocked (403 Forbidden)
    for sensitive_name in [".env", "credentials.json", "server.key"]:
        res_sec = client.get(
            "/api/v1/workspaces/ws-prev/file",
            params={"path": sensitive_name},
            headers=headers,
        )
        assert res_sec.status_code == 403
        assert res_sec.json()["error"]["code"] == "FG-WORKSPACE-403"
        # Guarantee no content leakage in error
        assert "SECRET_KEY" not in res_sec.text
        assert "api_key" not in res_sec.text

    # 4. Binary file detected
    res_bin = client.get(
        "/api/v1/workspaces/ws-prev/file",
        params={"path": "image.png"},
        headers=headers,
    )
    assert res_bin.status_code == 200
    bin_data = res_bin.json()
    assert bin_data["is_binary"] is True
    assert bin_data["content"] is None

    # 5. Path traversal blocked (403 Forbidden)
    res_trav = client.get(
        "/api/v1/workspaces/ws-prev/file",
        params={"path": "../outside.txt"},
        headers=headers,
    )
    assert res_trav.status_code == 403
    assert res_trav.json()["error"]["code"] == "FG-WORKSPACE-403"

    # 6. Directory requested as file (400 Bad Request)
    sub = ws_dir / "subdir"
    sub.mkdir()
    res_dir = client.get(
        "/api/v1/workspaces/ws-prev/file",
        params={"path": "subdir"},
        headers=headers,
    )
    assert res_dir.status_code == 400
    assert res_dir.json()["error"]["code"] == "FG-WORKSPACE-400"


def test_workspace_unregister_204_response(
    workspace_client: tuple[TestClient, Path],
) -> None:
    client, tmp_path = workspace_client
    headers = {"X-API-Key": "ws-test-key"}

    ws_dir = tmp_path / "ws_delete_me"
    ws_dir.mkdir()

    # Register
    client.post(
        "/api/v1/workspaces",
        json={"name": "Temp WS", "root_path": str(ws_dir), "workspace_id": "ws-to-delete"},
        headers=headers,
    )

    # Delete workspace (safe unregister: 204 No Content)
    del_res = client.delete("/api/v1/workspaces/ws-to-delete", headers=headers)
    assert del_res.status_code == 204
    assert len(del_res.content) == 0

    # Ensure files on disk were not deleted
    assert ws_dir.exists()

