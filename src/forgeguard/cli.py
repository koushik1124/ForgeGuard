from __future__ import annotations

import json
import os
import sys

import typer
from rich.console import Console
from rich.table import Table

from forgeguard.evaluation.cli import app as eval_app
from forgeguard.sdk.client import ForgeGuardClient
from forgeguard.sdk.exceptions import ForgeGuardSDKError

cli = typer.Typer(
    name="forgeguard",
    help="ForgeGuard — Reliable AI Agent Execution Runtime CLI",
    no_args_is_help=True,
)
task_app = typer.Typer(name="task", help="Manage and inspect governed execution tasks.")
workspace_app = typer.Typer(name="workspace", help="Manage and inspect approved workspace roots.")

cli.add_typer(task_app, name="task")
cli.add_typer(workspace_app, name="workspace")
cli.add_typer(eval_app, name="eval", help="Run reliability evaluations and benchmarks.")

console = Console()


def _get_client(base_url: str | None = None, api_key: str | None = None) -> ForgeGuardClient:
    url = (
        base_url
        or os.environ.get("FORGEGUARD_BASE_URL")
        or os.environ.get("FORGEGUARD_API_URL")
        or "http://127.0.0.1:8000"
    )
    key = api_key or os.environ.get("FORGEGUARD_API_KEY")
    return ForgeGuardClient(base_url=url, api_key=key)


# ============================================================================
# Server Command
# ============================================================================


@cli.command("server")
def run_server(
    host: str | None = typer.Option(
        None, "--host", "-h", help="Bind host address [default: 127.0.0.1]"
    ),
    port: int | None = typer.Option(
        None, "--port", "-p", help="Bind port number [default: 8000]"
    ),
    dev: bool = typer.Option(
        False,
        "--dev",
        help="Enable unauthenticated development mode (loopback only)",
    ),
    db_path: str | None = typer.Option(
        None, "--db", help="SQLite database path [default: forgeguard.db]"
    ),
) -> None:
    """Start the ForgeGuard FastAPI runtime server."""
    import uvicorn

    from forgeguard.agent.exceptions import ProviderConfigurationError
    from forgeguard.api.app import create_app
    from forgeguard.config import ForgeGuardSettings

    settings = ForgeGuardSettings.from_env()

    if host is not None:
        settings.host = host
    if port is not None:
        settings.port = port
    if db_path is not None:
        settings.db_path = db_path
    if dev:
        settings.auth_disabled = True

    if settings.auth_disabled:
        console.print(
            "[yellow]Warning: Running in unauthenticated development mode (loopback only).[/yellow]"
        )

    try:
        app = create_app(settings=settings)
    except ProviderConfigurationError as exc:
        console.print(f"[bold red]Configuration error: {exc}[/bold red]")
        raise typer.Exit(code=1) from exc

    console.print(
        f"[bold green]Starting ForgeGuard API on {settings.host}:{settings.port}...[/bold green]"
    )
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


# ============================================================================
# Task Commands
# ============================================================================


@task_app.command("submit")
def task_submit(
    prompt: str = typer.Argument(..., help="Prompt or task goal for governed execution"),
    workspace_id: str | None = typer.Option(None, "--workspace", "-w", help="Workspace ID"),
    mode: str = typer.Option("agent", "--mode", "-m", help="Mode: agent or tool_calls"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Submit a governed execution task."""
    try:
        with _get_client(url, api_key) as client:
            info = client.submit(prompt=prompt, workspace_id=workspace_id, execution_mode=mode)
            if json_output:
                console.print(json.dumps(info.__dict__, indent=2))
            else:
                console.print("[bold green]Task submitted successfully![/bold green]")
                console.print(f"Task ID: [cyan]{info.task_id}[/cyan]")
                console.print(f"Status:  [yellow]{info.status}[/yellow]")
                console.print(f"Created: {info.created_at}")
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Submission failed ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@task_app.command("get")
def task_get(
    task_id: str = typer.Argument(..., help="Task ID to inspect"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Retrieve detailed state and lifecycle information for a task."""
    try:
        with _get_client(url, api_key) as client:
            info = client.get_task(task_id)
            if json_output:
                console.print(json.dumps(info.__dict__, indent=2))
            else:
                table = Table(title=f"Task Details: {task_id}")
                table.add_column("Property", style="cyan")
                table.add_column("Value", style="green")
                table.add_row("Task ID", info.task_id)
                table.add_row("Description", info.description[:80])
                table.add_row("Status", info.status)
                table.add_row("Created At", info.created_at)
                table.add_row("Started At", info.started_at or "N/A")
                table.add_row("Finished At", info.finished_at or "N/A")
                table.add_row("Tools Executed", str(info.tool_call_count or 0))
                if info.error_summary:
                    table.add_row("Error", info.error_summary)
                console.print(table)
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Failed to get task ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@task_app.command("list")
def task_list(
    status: str | None = typer.Option(None, "--status", "-s", help="Filter by status"),
    limit: int = typer.Option(20, "--limit", "-l", help="Number of tasks"),
    offset: int = typer.Option(0, "--offset", "-o", help="Offset"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """List tasks with status filtering and pagination."""
    try:
        with _get_client(url, api_key) as client:
            items = client.list_tasks(status=status, limit=limit, offset=offset)
            if json_output:
                console.print(json.dumps([i.__dict__ for i in items], indent=2))
            else:
                table = Table(title="Governed Tasks")
                table.add_column("Task ID", style="cyan")
                table.add_column("Description")
                table.add_column("Status", style="yellow")
                table.add_column("Created At")

                for it in items:
                    table.add_row(
                        it.task_id,
                        it.description[:50],
                        it.status,
                        it.created_at,
                    )
                console.print(table)
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Failed to list tasks ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@task_app.command("result")
def task_result(
    task_id: str = typer.Argument(..., help="Task ID to inspect results for"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Retrieve terminal outputs and result of a task."""
    try:
        with _get_client(url, api_key) as client:
            res = client.get_result(task_id)
            if json_output:
                console.print(json.dumps(res.__dict__, indent=2))
            else:
                console.print(f"[bold cyan]Result for {task_id}:[/bold cyan]")
                console.print(f"Status:    [yellow]{res.status}[/yellow]")
                console.print(f"Completed: [green]{res.completed}[/green]")
                if res.final_response:
                    console.print(f"\n[bold]Final Answer:[/bold]\n{res.final_response}")
                if res.outputs:
                    console.print(f"\n[bold]Step Outputs:[/bold] {res.outputs}")
                if res.error:
                    console.print(f"\n[bold red]Error:[/bold red] {res.error}")
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Failed to get result ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@task_app.command("cancel")
def task_cancel(
    task_id: str = typer.Argument(..., help="Task ID to cancel"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Safely request cancellation of an active task."""
    try:
        with _get_client(url, api_key) as client:
            info = client.cancel(task_id)
            color = "green" if info.cancelled else "yellow"
            console.print(f"[{color}]{info.message}[/{color}] (status: {info.status})")
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Cancellation failed ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@task_app.command("resume")
def task_resume(
    task_id: str = typer.Argument(..., help="Task ID to resume from checkpoints"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Resume execution of an interrupted or failed task from checkpoints."""
    try:
        with _get_client(url, api_key) as client:
            info = client.resume(task_id)
            console.print(f"[bold green]{info.message}[/bold green] (status: {info.status})")
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Resume failed ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@task_app.command("events")
def task_events(
    task_id: str = typer.Argument(..., help="Task ID to stream events for"),
    last_event_id: str | None = typer.Option(None, "--last-id", help="Replay events after this ID"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Stream real-time execution events using SSE."""
    try:
        with _get_client(url, api_key) as client:
            console.print(f"[bold cyan]Connecting to SSE stream for {task_id}...[/bold cyan]")
            for ev in client.stream_events(task_id, last_event_id=last_event_id):
                console.print(
                    f"[[yellow]{ev.event_id or '-'}[/yellow]] "
                    f"[bold magenta]{ev.event_type}[/bold magenta]: {ev.data}"
                )
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Streaming failed ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stream disconnected by user.[/yellow]")


# ============================================================================
# Workspace Commands
# ============================================================================


@workspace_app.command("add")
def workspace_add(
    path: str = typer.Argument(..., help="Filesystem path of the approved workspace"),
    name: str = typer.Option(..., "--name", "-n", help="Workspace display name"),
    workspace_id: str | None = typer.Option(None, "--id", help="Explicit workspace ID"),
    description: str = typer.Option("", "--description", "-d", help="Workspace description"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Register an approved workspace root directory."""
    try:
        with _get_client(url, api_key) as client:
            ws = client.register_workspace(
                name=name,
                root_path=path,
                workspace_id=workspace_id,
                description=description,
            )
            console.print("[bold green]Workspace registered successfully![/bold green]")
            console.print(f"ID:   [cyan]{ws.workspace_id}[/cyan]")
            console.print(f"Path: {ws.root_path}")
    except ForgeGuardSDKError as exc:
        console.print(
            f"[bold red]Workspace registration failed ({exc.code}):[/bold red] {exc.message}"
        )
        sys.exit(1)


@workspace_app.command("list")
def workspace_list(
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """List all registered workspaces."""
    try:
        with _get_client(url, api_key) as client:
            items = client.list_workspaces()
            if json_output:
                console.print(json.dumps([w.__dict__ for w in items], indent=2))
            else:
                table = Table(title="Approved Workspaces")
                table.add_column("Workspace ID", style="cyan")
                table.add_column("Name", style="green")
                table.add_column("Root Path")
                table.add_column("Created At")

                for w in items:
                    table.add_row(w.workspace_id, w.name, w.root_path, w.created_at)
                console.print(table)
    except ForgeGuardSDKError as exc:
        console.print(f"[bold red]Failed to list workspaces ({exc.code}):[/bold red] {exc.message}")
        sys.exit(1)


@workspace_app.command("inspect")
def workspace_inspect(
    workspace_id: str = typer.Argument(..., help="Workspace ID to inspect"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
    url: str | None = typer.Option(None, "--url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
) -> None:
    """Inspect registration details of an approved workspace."""
    try:
        with _get_client(url, api_key) as client:
            ws = client.get_workspace(workspace_id)
            if json_output:
                console.print(json.dumps(ws.__dict__, indent=2))
            else:
                console.print(f"[bold cyan]Workspace Details:[/bold cyan] {ws.workspace_id}")
                console.print(f"Name:        {ws.name}")
                console.print(f"Root Path:   {ws.root_path}")
                console.print(f"Created At:  {ws.created_at}")
                if ws.description:
                    console.print(f"Description: {ws.description}")
    except ForgeGuardSDKError as exc:
        console.print(
            f"[bold red]Failed to inspect workspace ({exc.code}):[/bold red] {exc.message}"
        )
        sys.exit(1)


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
