from __future__ import annotations

import asyncio

import typer
from rich.console import Console
from rich.table import Table

from forgeguard.evaluation.reporting import ReportGenerator
from forgeguard.evaluation.runner import EvaluationRunner
from forgeguard.evaluation.scenarios import (
    ALL_SCENARIO_CLASSES,
    PerformanceBenchmarkScenario,
    get_scenario_by_id,
)

app = typer.Typer(name="eval", help="ForgeGuard Evaluation and Benchmark CLI.")
console = Console()


@app.command("list")
def list_scenarios() -> None:
    """List all registered evaluation scenarios and suites."""
    table = Table(title="ForgeGuard Evaluation Scenarios")
    table.add_column("Scenario ID", style="cyan")
    table.add_column("Name", style="green")
    table.add_column("Category", style="magenta")
    table.add_column("Severity", style="yellow")
    table.add_column("Description")

    for cls in ALL_SCENARIO_CLASSES:
        table.add_row(
            cls.scenario_id,
            cls.name,
            cls.category.value,
            cls.severity.value,
            cls.description,
        )

    console.print(table)


@app.command("run")
def run_evaluation(
    suite: str | None = typer.Option(
        None,
        "--suite",
        "-s",
        help="Suite name (reliability, recovery, security, agent, benchmarks, all)",
    ),
    scenario: str | None = typer.Option(
        None, "--scenario", "-c", help="Specific scenario ID to execute"
    ),
    output_dir: str | None = typer.Option(
        "eval_reports", "--output", "-o", help="Output directory for reports"
    ),
) -> None:
    """Execute evaluation scenarios and generate report."""
    runner = EvaluationRunner()

    async def _async_run() -> None:
        if scenario:
            sc = get_scenario_by_id(scenario)
            if not sc:
                console.print(f"[red]Scenario '{scenario}' not found.[/red]")
                raise typer.Exit(1)
            report = await runner.run_experiment([sc])
        else:
            suite_name = suite or "all"
            report = await runner.run_suite(suite_name)

        # Print summary
        status_color = "green" if report.overall_status.value == "pass" else "red"
        status_val = report.overall_status.value.upper()
        console.print(
            f"\n[bold]Overall Status:[/bold] [{status_color}]{status_val}[/{status_color}]"
        )
        console.print(
            f"Total: {report.total_scenarios} | Passed: {report.passed} | "
            f"Failed: {report.failed} | Errors: {report.errors}"
        )
        pass_pct = report.summary_metrics.get("pass_rate_pct", 0.0)
        console.print(f"Pass Rate: {pass_pct}% | Duration: {report.duration_ms:.2f} ms")

        if output_dir:
            json_p, md_p = ReportGenerator.export(report, output_dir)
            console.print(f"\n[dim]Exported reports to {json_p} and {md_p}[/dim]")

    asyncio.run(_async_run())


@app.command("benchmark")
def run_benchmark(
    iterations: int = typer.Option(
        20, "--iterations", "-n", help="Iterations per benchmark workload"
    ),
) -> None:
    """Run performance benchmarks comparing direct execution to ForgeGuard controls."""

    async def _async_bm() -> None:
        console.print(
            f"[bold cyan]Running ForgeGuard performance benchmarks "
            f"({iterations} iterations)...[/bold cyan]"
        )
        sc = PerformanceBenchmarkScenario(iterations=iterations)
        runner = EvaluationRunner()
        report = await runner.run_experiment([sc])

        table = Table(title="ForgeGuard Runtime Overhead vs Baseline")
        table.add_column("Benchmark ID", style="cyan")
        table.add_column("Workload", style="green")
        table.add_column("Mean (ms)", justify="right")
        table.add_column("Median (ms)", justify="right")
        table.add_column("P95 (ms)", justify="right")
        table.add_column("Relative Overhead", justify="right", style="bold yellow")

        for b in report.benchmarks:
            rel = (
                f"+{b.relative_overhead_pct}%"
                if b.relative_overhead_pct is not None
                else "Baseline (0%)"
            )
            table.add_row(
                b.benchmark_id,
                b.name,
                f"{b.mean_ms:.4f}",
                f"{b.median_ms:.4f}",
                f"{b.p95_ms:.4f}",
                rel,
            )

        console.print(table)

    asyncio.run(_async_bm())


if __name__ == "__main__":
    app()
