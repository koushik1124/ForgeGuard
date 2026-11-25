from __future__ import annotations

from pathlib import Path

import pytest

from forgeguard.agent.tools.calculator import create_calculator_tool
from forgeguard.agent.tools.text_analysis import create_text_analysis_tool
from forgeguard.agent.tools.workspace import create_workspace_tools


@pytest.mark.asyncio
async def test_calculator_arithmetic_operations() -> None:
    calc = create_calculator_tool()

    res1 = await calc.invoke({"expression": "2 + 3 * 4"})
    assert res1["result"] == 14

    res2 = await calc.invoke({"expression": "(100 - 25) / 5"})
    assert res2["result"] == 15.0

    res3 = await calc.invoke({"expression": "2 ** 8"})
    assert res3["result"] == 256

    res4 = await calc.invoke({"expression": "17 % 5"})
    assert res4["result"] == 2

    res5 = await calc.invoke({"expression": "19 // 4"})
    assert res5["result"] == 4


@pytest.mark.asyncio
async def test_calculator_division_by_zero() -> None:
    calc = create_calculator_tool()
    with pytest.raises(ZeroDivisionError, match="Division by zero"):
        await calc.invoke({"expression": "10 / 0"})


@pytest.mark.asyncio
async def test_calculator_security_rejects_code_injection() -> None:
    calc = create_calculator_tool()

    malicious_expressions = [
        "__import__('os').system('ls')",
        "eval('2+2')",
        "exec('print(1)')",
        "open('test.txt', 'r')",
        "globals()",
        "locals()",
        "lambda x: x",
        "os.name",
    ]

    for expr in malicious_expressions:
        with pytest.raises((ValueError, SyntaxError)):
            await calc.invoke({"expression": expr})


@pytest.mark.asyncio
async def test_calculator_rejects_huge_exponent() -> None:
    calc = create_calculator_tool()
    with pytest.raises(ValueError, match="exceeds safe limit"):
        await calc.invoke({"expression": "2 ** 10000"})


@pytest.mark.asyncio
async def test_text_analysis_operations() -> None:
    text_tool = create_text_analysis_tool()

    sample = "The quick brown fox jumps over the lazy dog.\nSecond line here."

    words_res = await text_tool.invoke({"text": sample, "operation": "word_count"})
    assert words_res["count"] == 12

    chars_res = await text_tool.invoke({"text": sample, "operation": "char_count"})
    assert chars_res["total_chars"] == len(sample)

    lines_res = await text_tool.invoke({"text": sample, "operation": "line_count"})
    assert lines_res["count"] == 2

    freq_res = await text_tool.invoke(
        {"text": sample, "operation": "search_frequency", "query": "the"}
    )
    assert freq_res["occurrences"] == 2


@pytest.mark.asyncio
async def test_restricted_workspace_tools(tmp_path: Path) -> None:
    # Setup workspace directory
    ws_root = tmp_path / "sandbox"
    ws_root.mkdir()
    file_a = ws_root / "notes.txt"
    file_a.write_text("Hello from secure workspace!", encoding="utf-8")
    sub_dir = ws_root / "subdir"
    sub_dir.mkdir()
    file_b = sub_dir / "data.json"
    file_b.write_text('{"key": "value"}', encoding="utf-8")

    list_tool, read_tool = create_workspace_tools(ws_root)

    # 1. List files
    list_res = await list_tool.invoke({"subpath": ""})
    assert list_res["total_entries"] == 2
    names = [e["name"] for e in list_res["entries"]]
    assert "notes.txt" in names
    assert "subdir" in names

    # 2. Read file
    read_res = await read_tool.invoke({"relative_path": "notes.txt"})
    assert read_res["content"] == "Hello from secure workspace!"
    assert read_res["is_truncated"] is False

    # 3. Read nested file
    read_sub = await read_tool.invoke({"relative_path": "subdir/data.json"})
    assert '{"key": "value"}' in read_sub["content"]


@pytest.mark.asyncio
async def test_workspace_security_path_traversal(tmp_path: Path) -> None:
    ws_root = tmp_path / "sandbox"
    ws_root.mkdir()
    secret_file = tmp_path / "secret.txt"
    secret_file.write_text("SUPER_SECRET_DATA", encoding="utf-8")

    list_tool, read_tool = create_workspace_tools(ws_root)

    # Traversal attempts
    with pytest.raises(PermissionError, match="escapes workspace root"):
        await read_tool.invoke({"relative_path": "../secret.txt"})

    with pytest.raises(PermissionError, match="escapes workspace root"):
        await read_tool.invoke({"relative_path": "../../secret.txt"})

    with pytest.raises(PermissionError, match="escapes workspace root"):
        await list_tool.invoke({"subpath": "../"})
