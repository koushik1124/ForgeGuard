from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


def fingerprint_arguments(arguments: dict[str, Any]) -> str:
    """Generate a safe, deterministic SHA-256 fingerprint for tool arguments."""
    try:
        serialized = json.dumps(arguments, sort_keys=True, default=str)
    except Exception:
        serialized = str(sorted(arguments.items()))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]


@dataclass
class BehaviorPatternSignal:
    pattern_type: str
    code: str
    tool_name: str
    message: str
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class BehaviorConfig:
    max_repeated_tool_calls: int = 3
    max_identical_arguments: int = 2
    max_repeated_tool_failures: int = 2
    duration_warning_threshold_seconds: float = 30.0


class BehaviorDetector:
    def __init__(self, config: BehaviorConfig | None = None) -> None:
        self.config = config or BehaviorConfig()

    def analyze_execution_history(
        self,
        tool_invocations: list[dict[str, Any]],
    ) -> list[BehaviorPatternSignal]:
        """Analyze a sequence of tool invocations for potential loops, repeats, or anomalies.

        Each invocation dict should contain:
        - tool_name: str
        - arguments: dict[str, Any]
        - status: str ("success", "failure")
        - duration_seconds: float
        """
        signals: list[BehaviorPatternSignal] = []
        if not tool_invocations:
            return signals

        # 1. Check for consecutive identical tool calls
        consecutive_tool: str | None = None
        consecutive_count = 0
        for inv in tool_invocations:
            tname = inv.get("tool_name", "")
            if tname == consecutive_tool:
                consecutive_count += 1
            else:
                consecutive_tool = tname
                consecutive_count = 1

            if consecutive_tool and consecutive_count >= self.config.max_repeated_tool_calls:
                signals.append(
                    BehaviorPatternSignal(
                        pattern_type="repeated_calls",
                        code="FG-LOOP-001",
                        tool_name=consecutive_tool,
                        message=(
                            f"Tool '{consecutive_tool}' was invoked {consecutive_count} "
                            f"times consecutively, which may indicate an execution loop."
                        ),
                        evidence={
                            "consecutive_count": consecutive_count,
                            "threshold": self.config.max_repeated_tool_calls,
                        },
                    )
                )

        # 2. Check for identical arguments (using safe fingerprint)
        fingerprint_counts: dict[tuple[str, str], int] = {}
        for inv in tool_invocations:
            tname = inv.get("tool_name", "")
            args = inv.get("arguments", {})
            fp = fingerprint_arguments(args)
            key = (tname, fp)
            fingerprint_counts[key] = fingerprint_counts.get(key, 0) + 1

            if fingerprint_counts[key] >= self.config.max_identical_arguments:
                signals.append(
                    BehaviorPatternSignal(
                        pattern_type="repeated_arguments",
                        code="FG-LOOP-002",
                        tool_name=tname,
                        message=(
                            f"Tool '{tname}' was invoked {fingerprint_counts[key]} times with "
                            f"identical arguments (fingerprint: {fp})."
                        ),
                        evidence={
                            "argument_fingerprint": fp,
                            "invocation_count": fingerprint_counts[key],
                            "threshold": self.config.max_identical_arguments,
                        },
                    )
                )

        # 3. Check for repeated failures of the same tool
        tool_consecutive_failures: dict[str, int] = {}
        for inv in tool_invocations:
            tname = inv.get("tool_name", "")
            status = inv.get("status", "success")
            if status == "failure":
                tool_consecutive_failures[tname] = tool_consecutive_failures.get(tname, 0) + 1
                if tool_consecutive_failures[tname] >= self.config.max_repeated_tool_failures:
                    signals.append(
                        BehaviorPatternSignal(
                            pattern_type="repeated_failures",
                            code="FG-LOOP-003",
                            tool_name=tname,
                            message=(
                                f"Tool '{tname}' experienced "
                                f"{tool_consecutive_failures[tname]} consecutive failures."
                            ),
                            evidence={
                                "consecutive_failures": tool_consecutive_failures[tname],
                                "threshold": self.config.max_repeated_tool_failures,
                            },
                        )
                    )
            else:
                tool_consecutive_failures[tname] = 0

        # 4. Check for abnormally long tool executions
        for inv in tool_invocations:
            tname = inv.get("tool_name", "")
            duration = inv.get("duration_seconds", 0.0)
            if duration >= self.config.duration_warning_threshold_seconds:
                signals.append(
                    BehaviorPatternSignal(
                        pattern_type="long_duration",
                        code="FG-PERF-001",
                        tool_name=tname,
                        message=(
                            f"Tool '{tname}' duration ({duration:.2f}s) exceeded performance "
                            f"threshold ({self.config.duration_warning_threshold_seconds:.2f}s)."
                        ),
                        evidence={
                            "duration_seconds": duration,
                            "threshold_seconds": (self.config.duration_warning_threshold_seconds),
                        },
                    )
                )

        return signals
