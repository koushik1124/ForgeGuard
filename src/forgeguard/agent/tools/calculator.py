from __future__ import annotations

import ast
import operator
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from forgeguard.tools.tool import Tool

# Allowed binary operators
SAFE_OPERATORS: dict[type[ast.AST], Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

# Allowed unary operators
SAFE_UNARY_OPERATORS: dict[type[ast.AST], Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

MAX_EXPONENT = 1000.0


def _safe_eval_ast(node: ast.AST) -> float | int:
    if isinstance(node, ast.Expression):
        return _safe_eval_ast(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value).__name__}")

    if isinstance(node, ast.BinOp):
        left = _safe_eval_ast(node.left)
        right = _safe_eval_ast(node.right)
        bin_op_type = type(node.op)

        if bin_op_type not in SAFE_OPERATORS:
            raise ValueError(f"Unsupported binary operator: {bin_op_type.__name__}")

        if bin_op_type in (ast.Div, ast.FloorDiv, ast.Mod) and right == 0:
            raise ZeroDivisionError("Division by zero is not permitted.")

        if bin_op_type is ast.Pow and abs(right) > MAX_EXPONENT:
            raise ValueError(f"Exponent magnitude {right} exceeds safe limit of {MAX_EXPONENT}.")

        val = SAFE_OPERATORS[bin_op_type](left, right)
        return float(val) if isinstance(val, float) else int(val)

    if isinstance(node, ast.UnaryOp):
        operand = _safe_eval_ast(node.operand)
        unary_op_type = type(node.op)

        if unary_op_type not in SAFE_UNARY_OPERATORS:
            raise ValueError(f"Unsupported unary operator: {unary_op_type.__name__}")

        uval = SAFE_UNARY_OPERATORS[unary_op_type](operand)
        return float(uval) if isinstance(uval, float) else int(uval)

    raise ValueError(
        f"Unsupported AST node type '{type(node).__name__}' in mathematical expression."
    )


class CalculatorInput(BaseModel):
    """Input contract for safe mathematical evaluation."""

    model_config = ConfigDict(extra="forbid")

    expression: str = Field(
        ...,
        min_length=1,
        description="Mathematical expression to evaluate (e.g. '24 * 7 + 15' or '(100 - 35) / 5')",
    )


def safe_calculator_handler(expression: str) -> dict[str, Any]:
    """Safely evaluates a mathematical expression without eval() or exec()."""
    cleaned = expression.strip()
    if not cleaned:
        raise ValueError("Expression cannot be empty.")

    try:
        parsed_ast = ast.parse(cleaned, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid mathematical syntax: {exc}") from exc

    result = _safe_eval_ast(parsed_ast)
    return {
        "expression": cleaned,
        "result": result,
    }


def create_calculator_tool() -> Tool:
    """Create and return the governed calculator Tool."""
    return Tool(
        name="calculator",
        description=(
            "Safely evaluates mathematical expressions containing numbers, parentheses, "
            "and standard operators (+, -, *, /, //, %, **). Does not permit arbitrary code."
        ),
        handler=safe_calculator_handler,
        input_model=CalculatorInput,
    )
