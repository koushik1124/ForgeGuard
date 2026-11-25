from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from forgeguard.tools.tool import Tool

TextOperation = Literal[
    "word_count",
    "char_count",
    "line_count",
    "uppercase",
    "lowercase",
    "search_frequency",
]


class TextAnalysisInput(BaseModel):
    """Input contract for deterministic text analysis operations."""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., description="Text content to analyze or normalize")
    operation: TextOperation = Field(
        default="word_count",
        description="Analysis operation: word_count, char_count, line_count, etc.",
    )
    query: str | None = Field(
        default=None,
        description="Search term when operation is 'search_frequency'",
    )


def text_analysis_handler(
    text: str,
    operation: TextOperation = "word_count",
    query: str | None = None,
) -> dict[str, Any]:
    """Execute deterministic text analysis operations."""
    if operation == "word_count":
        words = re.findall(r"\b\w+\b", text)
        return {"operation": operation, "count": len(words)}

    elif operation == "char_count":
        return {
            "operation": operation,
            "total_chars": len(text),
            "non_whitespace_chars": len(re.sub(r"\s+", "", text)),
        }

    elif operation == "line_count":
        lines = text.splitlines()
        return {"operation": operation, "count": len(lines)}

    elif operation == "uppercase":
        return {"operation": operation, "result": text.upper()}

    elif operation == "lowercase":
        return {"operation": operation, "result": text.lower()}

    elif operation == "search_frequency":
        if not query:
            raise ValueError("Query string is required for 'search_frequency' operation.")
        count = text.lower().count(query.lower())
        return {
            "operation": operation,
            "query": query,
            "occurrences": count,
        }

    raise ValueError(f"Unknown text analysis operation '{operation}'.")


def create_text_analysis_tool() -> Tool:
    """Create and return the governed text analysis Tool."""
    return Tool(
        name="text_analysis",
        description=(
            "Performs deterministic text analysis: word count, character count, "
            "line count, case normalization, and substring search frequency."
        ),
        handler=text_analysis_handler,
        input_model=TextAnalysisInput,
    )
