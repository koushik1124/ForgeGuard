from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from forgeguard.api.auth import verify_api_key
from forgeguard.api.dependencies import get_runtime_service
from forgeguard.api.errors import APIException
from forgeguard.api.schemas import (
    WorkspaceDirectoryResponse,
    WorkspaceFileEntry,
    WorkspaceFilePreviewResponse,
    WorkspaceListResponse,
    WorkspaceRegisterRequest,
    WorkspaceResponse,
)
from forgeguard.runtime.service import RuntimeService
from forgeguard.workspaces.security import (
    guess_mime_type,
    is_binary_file,
    is_hidden_path,
    is_sensitive_file,
)

router = APIRouter(
    prefix="/api/v1/workspaces",
    tags=["workspaces"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("", response_model=WorkspaceResponse, status_code=201)
async def register_workspace(
    request: WorkspaceRegisterRequest,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> WorkspaceResponse:
    """Register an approved workspace root directory."""
    record = await service.workspace_registry.register_workspace(
        name=request.name,
        root_path=request.root_path,
        workspace_id=request.workspace_id,
        description=request.description,
    )
    return WorkspaceResponse(
        workspace_id=record.workspace_id,
        name=record.name,
        root_path=record.root_path,
        created_at=record.created_at,
        description=record.description,
    )


@router.get("", response_model=WorkspaceListResponse)
async def list_workspaces(
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> WorkspaceListResponse:
    """List all registered and approved workspace paths."""
    records = await service.workspace_registry.list_workspaces()
    items = [
        WorkspaceResponse(
            workspace_id=r.workspace_id,
            name=r.name,
            root_path=r.root_path,
            created_at=r.created_at,
            description=r.description,
        )
        for r in records
    ]
    return WorkspaceListResponse(workspaces=items)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> WorkspaceResponse:
    """Retrieve details for a specific registered workspace."""
    record = await service.workspace_registry.get_workspace(workspace_id)
    return WorkspaceResponse(
        workspace_id=record.workspace_id,
        name=record.name,
        root_path=record.root_path,
        created_at=record.created_at,
        description=record.description,
    )


@router.delete("/{workspace_id}", status_code=204, response_class=Response)
async def delete_workspace(
    workspace_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
) -> Response:
    """Unregister a workspace (safe: never deletes user files on disk)."""
    await service.workspace_registry.unregister_workspace(workspace_id)
    return Response(status_code=204)


@router.get("/{workspace_id}/files", response_model=WorkspaceDirectoryResponse)
async def list_workspace_files(
    workspace_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
    subpath: str = Query("", description="Relative directory subpath within workspace root"),
    include_hidden: bool = Query(False, description="Whether to include hidden files (default false)"),
) -> WorkspaceDirectoryResponse:
    """List directory contents within an approved workspace with strict path containment."""
    record = await service.workspace_registry.get_workspace(workspace_id)
    manager = service.workspace_registry.get_workspace_manager(record)

    try:
        raw_result = manager.list_files(subpath=subpath)
    except PermissionError as exc:
        raise APIException(
            status_code=403,
            code="FG-WORKSPACE-403",
            message=str(exc),
        ) from exc
    except FileNotFoundError as exc:
        raise APIException(
            status_code=404,
            code="FG-WORKSPACE-404",
            message=f"Directory not found: '{subpath}'",
        ) from exc
    except NotADirectoryError as exc:
        raise APIException(
            status_code=400,
            code="FG-WORKSPACE-400",
            message=f"Path is not a directory: '{subpath}'",
        ) from exc
    except Exception as exc:
        raise APIException(
            status_code=400,
            code="FG-WORKSPACE-400",
            message=f"Invalid subpath '{subpath}': {exc}",
        ) from exc

    entries: list[WorkspaceFileEntry] = []
    for item in raw_result.get("entries", []):
        name = item["name"]
        rel = item["relative_path"]

        # Filter hidden files by default unless explicitly requested
        if not include_hidden and (name.startswith(".") or is_hidden_path(rel)):
            continue

        entries.append(
            WorkspaceFileEntry(
                name=name,
                relative_path=rel,
                is_directory=item["is_directory"],
                size_bytes=item["size_bytes"],
                extension=Path(name).suffix.lower() if not item["is_directory"] else "",
            )
        )

    return WorkspaceDirectoryResponse(
        workspace_id=record.workspace_id,
        subpath=raw_result.get("subpath", subpath),
        total_entries=len(entries),
        entries=entries,
    )


@router.get("/{workspace_id}/file", response_model=WorkspaceFilePreviewResponse)
async def preview_workspace_file(
    workspace_id: str,
    service: Annotated[RuntimeService, Depends(get_runtime_service)],
    path: str = Query(..., min_length=1, description="Relative file path within workspace root"),
    max_bytes: int = Query(50_000, ge=1, le=500_000, description="Maximum preview bytes to read"),
) -> WorkspaceFilePreviewResponse:
    """Read-only preview of a file within an approved workspace with security protections."""
    record = await service.workspace_registry.get_workspace(workspace_id)
    manager = service.workspace_registry.get_workspace_manager(record)

    # 1. Resolve safe path with path traversal protection
    try:
        target_file = manager._resolve_safe_path(path)
    except PermissionError as exc:
        raise APIException(
            status_code=403,
            code="FG-WORKSPACE-403",
            message=str(exc),
        ) from exc
    except Exception as exc:
        raise APIException(
            status_code=400,
            code="FG-WORKSPACE-400",
            message=f"Invalid file path '{path}': {exc}",
        ) from exc

    # 2. Verify file existence and type
    if not target_file.exists():
        raise APIException(
            status_code=404,
            code="FG-WORKSPACE-404",
            message=f"File not found: '{path}'",
        )
    if not target_file.is_file():
        raise APIException(
            status_code=400,
            code="FG-WORKSPACE-400",
            message=f"Path is a directory, not a file: '{path}'",
        )

    # 3. Sensitive & credential file protection (backend enforced)
    if is_sensitive_file(target_file.name) or is_sensitive_file(path) or is_hidden_path(path):
        raise APIException(
            status_code=403,
            code="FG-WORKSPACE-403",
            message="Access denied: previewing sensitive credential or secret files is blocked.",
        )

    # 4. Safe read with size bounding and binary detection
    file_size = target_file.stat().st_size
    bytes_to_read = min(file_size, max_bytes)

    try:
        with target_file.open("rb") as f:
            raw_bytes = f.read(bytes_to_read)
    except Exception as exc:
        raise APIException(
            status_code=500,
            code="FG-WORKSPACE-500",
            message=f"Failed to read file: {exc}",
        ) from exc

    ext = target_file.suffix.lower()
    mime = guess_mime_type(target_file.name)
    binary = is_binary_file(target_file.name, raw_bytes)

    if binary:
        content = None
    else:
        content = raw_bytes.decode("utf-8", errors="replace")

    rel_str = str(target_file.relative_to(manager.workspace_root)).replace("\\", "/")

    return WorkspaceFilePreviewResponse(
        workspace_id=record.workspace_id,
        relative_path=rel_str,
        name=target_file.name,
        size_bytes=file_size,
        read_bytes=len(raw_bytes),
        is_truncated=file_size > bytes_to_read,
        is_binary=binary,
        content=content,
        extension=ext,
        mime_type=mime,
    )
