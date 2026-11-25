from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from forgeguard.tools.tool import Tool


class WorkspaceListFilesInput(BaseModel):
    """Input contract for listing files in the approved workspace."""

    model_config = ConfigDict(extra="forbid")

    subpath: str = Field(
        default="",
        description="Relative directory path within the approved workspace root",
    )


class WorkspaceReadFileInput(BaseModel):
    """Input contract for reading a file in the approved workspace."""

    model_config = ConfigDict(extra="forbid")

    relative_path: str = Field(
        ...,
        min_length=1,
        description="Relative file path within the approved workspace root",
    )
    max_bytes: int = Field(
        default=50_000,
        ge=1,
        le=500_000,
        description="Maximum bytes to read from file",
    )


class RestrictedWorkspaceManager:
    """Safely confines filesystem inspections to an approved workspace root."""

    def __init__(self, workspace_root: str | Path) -> None:
        self.workspace_root = Path(workspace_root).resolve()

    def _resolve_safe_path(self, relative_path: str) -> Path:
        target = (self.workspace_root / relative_path).resolve()
        try:
            target.relative_to(self.workspace_root)
        except ValueError as exc:
            raise PermissionError(
                f"Path traversal denied: '{relative_path}' escapes workspace root "
                f"'{self.workspace_root}'."
            ) from exc
        return target

    def list_files(self, subpath: str = "") -> dict[str, Any]:
        target_dir = self._resolve_safe_path(subpath)
        if not target_dir.exists():
            raise FileNotFoundError(f"Directory not found: '{subpath}'")
        if not target_dir.is_dir():
            raise NotADirectoryError(f"Path is not a directory: '{subpath}'")

        entries: list[dict[str, Any]] = []
        for item in sorted(target_dir.iterdir()):
            is_file = item.is_file()
            rel = str(item.relative_to(self.workspace_root)).replace("\\", "/")
            entries.append(
                {
                    "name": item.name,
                    "relative_path": rel,
                    "is_directory": item.is_dir(),
                    "size_bytes": item.stat().st_size if is_file else None,
                }
            )

        return {
            "subpath": subpath,
            "total_entries": len(entries),
            "entries": entries,
        }

    def read_file(self, relative_path: str, max_bytes: int = 50_000) -> dict[str, Any]:
        target_file = self._resolve_safe_path(relative_path)
        if not target_file.exists():
            raise FileNotFoundError(f"File not found: '{relative_path}'")
        if not target_file.is_file():
            raise IsADirectoryError(f"Path is a directory, not a file: '{relative_path}'")

        file_size = target_file.stat().st_size
        bytes_to_read = min(file_size, max_bytes)

        with target_file.open("rb") as f:
            raw_bytes = f.read(bytes_to_read)

        content = raw_bytes.decode("utf-8", errors="replace")
        is_truncated = file_size > bytes_to_read

        return {
            "relative_path": relative_path,
            "size_bytes": file_size,
            "read_bytes": len(raw_bytes),
            "is_truncated": is_truncated,
            "content": content,
        }


def create_workspace_tools(
    workspace_root: str | Path,
) -> tuple[Tool, Tool]:
    """Create restricted workspace inspection tools for an approved root."""
    manager = RestrictedWorkspaceManager(workspace_root)

    list_tool = Tool(
        name="workspace_list_files",
        description=(
            "List files and directories within the approved workspace. "
            "Enforces strict path containment."
        ),
        handler=manager.list_files,
        input_model=WorkspaceListFilesInput,
    )

    read_tool = Tool(
        name="workspace_read_file",
        description=(
            "Read UTF-8 text from a file within the approved workspace with size limits. "
            "Enforces strict path containment."
        ),
        handler=manager.read_file,
        input_model=WorkspaceReadFileInput,
    )

    return list_tool, read_tool
