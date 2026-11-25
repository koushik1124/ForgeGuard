from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from forgeguard.cli import cli
from forgeguard.sdk.models import (
    TaskCancelInfo,
    TaskInfo,
    WorkspaceInfo,
)

runner = CliRunner()


def test_cli_help_and_subcommand_structure() -> None:
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "task" in result.stdout
    assert "workspace" in result.stdout
    assert "eval" in result.stdout
    assert "server" in result.stdout


def test_cli_eval_subcommand_integration() -> None:
    # Verify that M7 eval commands are seamlessly integrated
    result = runner.invoke(cli, ["eval", "list"], env={"COLUMNS": "200"})
    assert result.exit_code == 0
    assert "rel_01_success" in result.stdout
    assert "sec_01_unauthorized_tool" in result.stdout


@patch("forgeguard.cli._get_client")
def test_cli_task_submit(mock_get_client: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.submit.return_value = TaskInfo(
        task_id="task-cli-123",
        description="Test prompt",
        status="created",
        created_at="2026-11-21T12:00:00Z",
    )
    mock_get_client.return_value.__enter__.return_value = mock_client

    result = runner.invoke(cli, ["task", "submit", "Test prompt", "--mode", "agent"])
    assert result.exit_code == 0
    assert "task-cli-123" in result.stdout
    assert "created" in result.stdout


@patch("forgeguard.cli._get_client")
def test_cli_task_get(mock_get_client: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.get_task.return_value = TaskInfo(
        task_id="task-cli-123",
        description="Inspecting task",
        status="completed",
        created_at="2026-11-21T12:00:00Z",
        finished_at="2026-11-21T12:00:05Z",
        tool_call_count=3,
    )
    mock_get_client.return_value.__enter__.return_value = mock_client

    result = runner.invoke(cli, ["task", "get", "task-cli-123"])
    assert result.exit_code == 0
    assert "task-cli-123" in result.stdout
    assert "completed" in result.stdout


@patch("forgeguard.cli._get_client")
def test_cli_task_list(mock_get_client: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.list_tasks.return_value = [
        TaskInfo(
            task_id="task-1",
            description="First task",
            status="completed",
            created_at="2026-11-21T12:00:00Z",
        ),
        TaskInfo(
            task_id="task-2",
            description="Second task",
            status="running",
            created_at="2026-11-21T12:01:00Z",
        ),
    ]
    mock_get_client.return_value.__enter__.return_value = mock_client

    result = runner.invoke(cli, ["task", "list"])
    assert result.exit_code == 0
    assert "task-1" in result.stdout
    assert "task-2" in result.stdout


@patch("forgeguard.cli._get_client")
def test_cli_task_cancel(mock_get_client: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.cancel.return_value = TaskCancelInfo(
        task_id="task-cancel-1",
        status="cancelled",
        cancelled=True,
        message="Task execution successfully cancelled.",
    )
    mock_get_client.return_value.__enter__.return_value = mock_client

    result = runner.invoke(cli, ["task", "cancel", "task-cancel-1"])
    assert result.exit_code == 0
    assert "cancelled" in result.stdout.lower()


@patch("forgeguard.cli._get_client")
def test_cli_workspace_commands(mock_get_client: MagicMock, tmp_path: Path) -> None:
    mock_client = MagicMock()
    ws_path = str(tmp_path / "ws_cli")
    mock_client.register_workspace.return_value = WorkspaceInfo(
        workspace_id="ws-cli-1",
        name="CLI Workspace",
        root_path=ws_path,
        created_at="2026-11-21T12:00:00Z",
    )
    mock_client.list_workspaces.return_value = [
        WorkspaceInfo(
            workspace_id="ws-cli-1",
            name="CLI Workspace",
            root_path=ws_path,
            created_at="2026-11-21T12:00:00Z",
        )
    ]
    mock_client.get_workspace.return_value = WorkspaceInfo(
        workspace_id="ws-cli-1",
        name="CLI Workspace",
        root_path=ws_path,
        created_at="2026-11-21T12:00:00Z",
    )
    mock_get_client.return_value.__enter__.return_value = mock_client

    # 1. Add workspace
    res_add = runner.invoke(
        cli, ["workspace", "add", ws_path, "--name", "CLI Workspace", "--id", "ws-cli-1"]
    )
    assert res_add.exit_code == 0
    assert "ws-cli-1" in res_add.stdout

    # 2. List workspaces
    res_list = runner.invoke(cli, ["workspace", "list"])
    assert res_list.exit_code == 0
    assert "ws-cli-1" in res_list.stdout

    # 3. Inspect workspace
    res_insp = runner.invoke(cli, ["workspace", "inspect", "ws-cli-1"])
    assert res_insp.exit_code == 0
    assert "CLI Workspace" in res_insp.stdout


@patch("uvicorn.run")
@patch("forgeguard.api.app.create_app")
def test_cli_server_loads_environment_configuration(
    mock_create_app: MagicMock,
    mock_uvicorn_run: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGEGUARD_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_env_key_123")
    monkeypatch.setenv("FORGEGUARD_DEFAULT_MODEL", "qwen/qwen3.8-27b")
    monkeypatch.setenv("FORGEGUARD_HOST", "0.0.0.0")
    monkeypatch.setenv("FORGEGUARD_PORT", "9090")

    result = runner.invoke(cli, ["server"])
    assert result.exit_code == 0
    mock_create_app.assert_called_once()
    settings = mock_create_app.call_args.kwargs["settings"]
    assert settings.provider == "groq"
    assert settings.groq_api_key == "gsk_env_key_123"
    assert settings.default_model == "qwen/qwen3.8-27b"
    assert settings.host == "0.0.0.0"
    assert settings.port == 9090
    mock_uvicorn_run.assert_called_once_with(
        mock_create_app.return_value, host="0.0.0.0", port=9090, log_level="info"
    )


@patch("uvicorn.run")
@patch("forgeguard.api.app.create_app")
def test_cli_server_explicit_arguments_override_environment(
    mock_create_app: MagicMock,
    mock_uvicorn_run: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGEGUARD_HOST", "127.0.0.1")
    monkeypatch.setenv("FORGEGUARD_PORT", "8000")
    monkeypatch.setenv("FORGEGUARD_DB_PATH", "default.db")

    result = runner.invoke(
        cli,
        ["server", "--host", "192.168.1.100", "--port", "5555", "--dev", "--db", "override.db"],
    )
    assert result.exit_code == 0
    mock_create_app.assert_called_once()
    settings = mock_create_app.call_args.kwargs["settings"]
    assert settings.host == "192.168.1.100"
    assert settings.port == 5555
    assert settings.db_path == "override.db"
    assert settings.auth_disabled is True
    mock_uvicorn_run.assert_called_once_with(
        mock_create_app.return_value, host="192.168.1.100", port=5555, log_level="info"
    )


def test_cli_server_missing_groq_key_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORGEGUARD_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    result = runner.invoke(cli, ["server"])
    assert result.exit_code == 1
    assert "Configuration error" in result.stdout
    assert "GROQ_API_KEY is missing or empty" in result.stdout
