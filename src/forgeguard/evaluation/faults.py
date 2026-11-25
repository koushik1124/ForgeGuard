from __future__ import annotations

import asyncio
import inspect
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from forgeguard.tools.tool import Tool


class FaultType(str, Enum):
    """Types of faults that can be injected during evaluation."""

    TOOL_EXCEPTION = "tool_exception"
    TOOL_TIMEOUT = "tool_timeout"
    TOOL_OVERSIZED_OUTPUT = "tool_oversized_output"
    TOOL_FAIL_N_TIMES = "tool_fail_n_times"
    PROVIDER_TIMEOUT = "provider_timeout"
    PROVIDER_RATE_LIMIT = "provider_rate_limit"
    PROVIDER_MALFORMED_JSON = "provider_malformed_json"
    PROVIDER_UNEXPECTED_SCHEMA = "provider_unexpected_schema"
    CRASH_DURING_TOOL = "crash_during_tool"


@dataclass
class FaultPoint:
    """A configured fault injection rule."""

    fault_type: FaultType
    target_name: str
    trigger_step: int | None = None
    trigger_count: int = 1
    parameters: dict[str, Any] = field(default_factory=dict)
    _invocations: int = field(default=0, init=False)

    def should_trigger(self, step: int | None = None) -> bool:
        if self.trigger_step is not None:
            if step is not None and step != self.trigger_step:
                return False
        if self._invocations >= self.trigger_count:
            return False
        self._invocations += 1
        return True


class FaultInjector:
    """Manages deterministic test-only fault injection."""

    def __init__(self) -> None:
        self.fault_points: list[FaultPoint] = []
        self._active = False

    def add_fault(self, fault: FaultPoint) -> None:
        self.fault_points.append(fault)

    def clear(self) -> None:
        self.fault_points.clear()
        self._active = False

    def wrap_tool(self, tool: Tool) -> Tool:
        """Wraps a Tool with active fault points."""
        original_handler = tool.handler
        is_async = inspect.iscoroutinefunction(original_handler)
        invocation_count = 0

        if is_async:

            async def fault_aware_async_handler(*args: Any, **kwargs: Any) -> Any:
                nonlocal invocation_count
                step_idx = invocation_count
                invocation_count += 1

                for fault in self.fault_points:
                    if fault.target_name == tool.name and fault.should_trigger(step_idx):
                        if fault.fault_type == FaultType.TOOL_EXCEPTION:
                            err_msg = fault.parameters.get(
                                "message", f"Injected fault for {tool.name}"
                            )
                            raise RuntimeError(err_msg)

                        elif fault.fault_type == FaultType.TOOL_TIMEOUT:
                            delay = fault.parameters.get("delay_seconds", 35.0)
                            await asyncio.sleep(delay)

                        elif fault.fault_type == FaultType.TOOL_OVERSIZED_OUTPUT:
                            size_bytes = fault.parameters.get("size_bytes", 2_000_000)
                            return "X" * size_bytes

                        elif fault.fault_type == FaultType.TOOL_FAIL_N_TIMES:
                            max_fails = fault.parameters.get("failures", 1)
                            if fault._invocations <= max_fails:
                                raise RuntimeError(
                                    f"Transient failure {fault._invocations}/{max_fails}"
                                )

                return await original_handler(*args, **kwargs)

            handler = fault_aware_async_handler
        else:

            def fault_aware_sync_handler(*args: Any, **kwargs: Any) -> Any:
                nonlocal invocation_count
                step_idx = invocation_count
                invocation_count += 1

                for fault in self.fault_points:
                    if fault.target_name == tool.name and fault.should_trigger(step_idx):
                        if fault.fault_type == FaultType.TOOL_EXCEPTION:
                            err_msg = fault.parameters.get(
                                "message", f"Injected fault for {tool.name}"
                            )
                            raise RuntimeError(err_msg)

                        elif fault.fault_type == FaultType.TOOL_TIMEOUT:
                            delay = fault.parameters.get("delay_seconds", 35.0)
                            time.sleep(delay)

                        elif fault.fault_type == FaultType.TOOL_OVERSIZED_OUTPUT:
                            size_bytes = fault.parameters.get("size_bytes", 2_000_000)
                            return "X" * size_bytes

                        elif fault.fault_type == FaultType.TOOL_FAIL_N_TIMES:
                            max_fails = fault.parameters.get("failures", 1)
                            if fault._invocations <= max_fails:
                                raise RuntimeError(
                                    f"Transient failure {fault._invocations}/{max_fails}"
                                )

                return original_handler(*args, **kwargs)

            handler = fault_aware_sync_handler

        return Tool(
            name=tool.name,
            description=tool.description,
            handler=handler,
            input_model=tool.input_model,
        )
