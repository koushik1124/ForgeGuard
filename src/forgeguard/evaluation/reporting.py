from __future__ import annotations

from pathlib import Path

from forgeguard.evaluation.models import EvaluationStatus, ExperimentReport


class ReportGenerator:
    """Generates human-readable Markdown and machine-readable JSON evaluation reports."""

    @staticmethod
    def generate_markdown(report: ExperimentReport) -> str:
        status_badge = (
            "✅ PASS"
            if report.overall_status == EvaluationStatus.PASS
            else "❌ " + report.overall_status.value.upper()
        )

        lines: list[str] = [
            f"# ForgeGuard Evaluation Report — {report.experiment_id}",
            "",
            "**Tagline:** Control. Recover. Observe. Evaluate.",
            "",
            "## 1. Executive Summary",
            "",
            f"- **Status:** {status_badge}",
            f"- **Experiment Name:** `{report.name}`",
            f"- **Timestamp:** `{report.timestamp}`",
            f"- **Total Duration:** `{report.duration_ms:.2f} ms`",
            f"- **Total Scenarios:** `{report.total_scenarios}`",
            f"- **Passed:** `{report.passed}`",
            f"- **Failed:** `{report.failed}`",
            f"- **Errors:** `{report.errors}`",
            f"- **Skipped:** `{report.skipped}`",
            f"- **Pass Rate:** `{report.summary_metrics.get('pass_rate_pct', 0.0)}%`",
            "",
            "## 2. Environment Information",
            "",
            f"- **Platform:** `{report.environment_info.get('platform')}`",
            f"- **Python Version:** `{report.environment_info.get('python_version')}`",
            f"- **Architecture:** `{report.environment_info.get('architecture')}`",
            "",
            "## 3. Scenario Results Breakdown",
            "",
            "| Scenario ID | Name | Category | Severity | Status | Duration (ms) | Assertions |",
            "|---|---|---|---|---|---|---|",
        ]

        for s in report.scenario_results:
            status_icon = "PASS" if s.status == EvaluationStatus.PASS else s.status.value.upper()
            assert_str = f"{s.assertions_passed}/{len(s.assertions)}"
            lines.append(
                f"| `{s.scenario_id}` | {s.name} | `{s.category.value}` | "
                f"`{s.severity.value}` | **{status_icon}** | {s.duration_ms:.2f} | {assert_str} |"
            )

        # Performance benchmarks section
        if report.benchmarks:
            lines.extend(
                [
                    "",
                    "## 4. Performance Benchmarks & Baseline Comparisons",
                    "",
                    "| Benchmark ID | Workload | Mean (ms) | Median (ms) | "
                    "P95 (ms) | Min (ms) | Max (ms) | Relative Overhead vs Baseline |",
                    "|---|---|---|---|---|---|---|---|",
                ]
            )
            for b in report.benchmarks:
                rel = (
                    f"+{b.relative_overhead_pct}%"
                    if b.relative_overhead_pct is not None
                    else "Baseline (0%)"
                )
                lines.append(
                    f"| `{b.benchmark_id}` | {b.name} | {b.mean_ms:.4f} | "
                    f"{b.median_ms:.4f} | {b.p95_ms:.4f} | {b.min_ms:.4f} | "
                    f"{b.max_ms:.4f} | **{rel}** |"
                )

        # Evidence and failures
        failures = [s for s in report.scenario_results if s.status != EvaluationStatus.PASS]
        if failures:
            lines.extend(
                [
                    "",
                    "## 5. Failure Analysis & Diagnostics",
                    "",
                ]
            )
            for f in failures:
                lines.append(f"### Scenario `{f.scenario_id}`: {f.name}")
                lines.append(f"- **Reason:** `{f.failure_reason}`")
                lines.append("- **Failed Assertions:**")
                for a in f.assertions:
                    if not a.passed:
                        lines.append(
                            f"  - `{a.name}`: expected `{a.expected}`, got `{a.actual}`: "
                            f"{a.message}"
                        )
                lines.append("")

        return "\n".join(lines)

    @classmethod
    def export(
        cls,
        report: ExperimentReport,
        output_dir: str | Path,
    ) -> tuple[Path, Path]:
        """Export report as JSON and Markdown files in the target directory."""
        target_dir = Path(output_dir)
        target_dir.mkdir(parents=True, exist_ok=True)

        json_path = target_dir / f"report_{report.experiment_id}.json"
        md_path = target_dir / f"report_{report.experiment_id}.md"

        json_path.write_text(report.to_json(), encoding="utf-8")
        md_path.write_text(cls.generate_markdown(report), encoding="utf-8")

        return json_path, md_path
