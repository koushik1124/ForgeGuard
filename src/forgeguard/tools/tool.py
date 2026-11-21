from __future__ import annotations

import asyncio
import inspect
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ConfigDict


class EmptyToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Tool:
    def __init__(
        self,
        name: str,
        description: str,
        handler: Callable[..., Any],
        input_model: type[BaseModel] = EmptyToolInput,
    ) -> None:
        if not name.strip():
            raise ValueError("Tool name cannot be empty")

        if not callable(handler):
            raise ValueError("Tool handler must be callable")

        if not issubclass(input_model, BaseModel):
            raise TypeError("input_model must be a Pydantic model")

        self.name = name
        self.description = description
        self.handler = handler
        self.input_model = input_model

    def validate_input(self, arguments: dict[str, Any]) -> dict[str, Any]:
        validated = self.input_model.model_validate(arguments)
        return validated.model_dump()

    async def invoke(self, arguments: dict[str, Any]) -> Any:
        validated_arguments = self.validate_input(arguments)

        if inspect.iscoroutinefunction(self.handler):
            return await self.handler(**validated_arguments)

        result = await asyncio.to_thread(
            self.handler,
            **validated_arguments,
        )

        if inspect.isawaitable(result):
            return await result

        return result