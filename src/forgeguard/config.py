from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, Field


class ForgeGuardSettings(BaseModel):
    """Central configuration for the ForgeGuard runtime and API platform."""

    model_config = ConfigDict(extra="ignore")

    # Server configuration
    host: str = Field(default="127.0.0.1", description="API server bind host")
    port: int = Field(default=8000, ge=1, le=65535, description="API server bind port")
    api_key: str | None = Field(default=None, description="API key for authentication")
    auth_disabled: bool = Field(
        default=False,
        description="Explicit development switch to disable API authentication (loopback only)",
    )

    # Persistence & storage
    db_path: str = Field(
        default="forgeguard.db",
        description="Path to SQLite persistence database (or :memory:)",
    )
    workspace_root: str = Field(
        default="workspaces",
        description="Approved directory root containing safe agent workspaces",
    )
    eval_reports_dir: str = Field(
        default="eval_reports",
        description="Approved directory root containing evaluation reports and artifacts",
    )

    # Input validation & limits
    max_request_bytes: int = Field(
        default=1_000_000,
        ge=1024,
        le=50_000_000,
        description="Maximum HTTP request body size in bytes",
    )
    max_prompt_length: int = Field(
        default=50_000,
        ge=1,
        le=500_000,
        description="Maximum prompt character length",
    )
    max_page_size: int = Field(
        default=100,
        ge=1,
        le=500,
        description="Maximum items per page in list operations",
    )
    default_page_size: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Default items per page in list operations",
    )

    # Default runtime budgets
    max_tool_calls: int = Field(default=20, ge=1, description="Default max tool calls per task")
    max_execution_seconds: float = Field(
        default=120.0,
        ge=1.0,
        description="Default max execution seconds per task",
    )
    max_consecutive_failures: int = Field(
        default=5,
        ge=1,
        description="Default max consecutive tool failures",
    )
    max_output_bytes: int = Field(
        default=1_000_000,
        ge=1000,
        description="Default max cumulative output bytes",
    )
    max_tool_duration_seconds: float = Field(
        default=30.0,
        ge=0.1,
        description="Default single tool timeout in seconds",
    )

    # Streaming & SSE
    sse_heartbeat_seconds: float = Field(
        default=15.0,
        ge=1.0,
        description="Keepalive comment interval in seconds for SSE",
    )

    # Agent & Provider settings
    provider: str = Field(
        default="mock",
        description="Default LLM provider (mock or groq)",
    )
    groq_api_key: str | None = Field(default=None, description="Groq API key")
    default_model: str = Field(
        default="qwen/qwen3.8-27b",
        description="Default model name for model-driven execution",
    )

    @classmethod
    def from_env(cls) -> ForgeGuardSettings:
        """Construct settings loaded from system environment variables."""
        auth_disabled_raw = os.environ.get("FORGEGUARD_AUTH_DISABLED", "false").lower()
        auth_disabled = auth_disabled_raw in {"true", "1", "yes", "on"}

        raw_provider = os.environ.get("FORGEGUARD_PROVIDER")
        groq_key = os.environ.get("GROQ_API_KEY")
        if raw_provider:
            provider = raw_provider.strip().lower()
        else:
            provider = "groq" if groq_key else "mock"

        default_model = os.environ.get(
            "FORGEGUARD_DEFAULT_MODEL",
            os.environ.get("GROQ_MODEL", "qwen/qwen3.8-27b"),
        )

        return cls(
            host=os.environ.get("FORGEGUARD_HOST", "127.0.0.1"),
            port=int(os.environ.get("FORGEGUARD_PORT", "8000")),
            api_key=os.environ.get("FORGEGUARD_API_KEY"),
            auth_disabled=auth_disabled,
            db_path=os.environ.get("FORGEGUARD_DB_PATH", "forgeguard.db"),
            workspace_root=os.environ.get("FORGEGUARD_WORKSPACE_ROOT", "workspaces"),
            eval_reports_dir=os.environ.get("FORGEGUARD_EVAL_REPORTS_DIR", "eval_reports"),
            max_request_bytes=int(os.environ.get("FORGEGUARD_MAX_REQUEST_BYTES", "1000000")),
            max_prompt_length=int(os.environ.get("FORGEGUARD_MAX_PROMPT_LENGTH", "50000")),
            max_page_size=int(os.environ.get("FORGEGUARD_MAX_PAGE_SIZE", "100")),
            default_page_size=int(os.environ.get("FORGEGUARD_DEFAULT_PAGE_SIZE", "20")),
            max_tool_calls=int(os.environ.get("FORGEGUARD_MAX_TOOL_CALLS", "20")),
            max_execution_seconds=float(
                os.environ.get("FORGEGUARD_MAX_EXECUTION_SECONDS", "120.0")
            ),
            max_consecutive_failures=int(
                os.environ.get("FORGEGUARD_MAX_CONSECUTIVE_FAILURES", "5")
            ),
            max_output_bytes=int(os.environ.get("FORGEGUARD_MAX_OUTPUT_BYTES", "1000000")),
            max_tool_duration_seconds=float(
                os.environ.get("FORGEGUARD_MAX_TOOL_DURATION_SECONDS", "30.0")
            ),
            sse_heartbeat_seconds=float(os.environ.get("FORGEGUARD_SSE_HEARTBEAT_SECONDS", "15.0")),
            provider=provider,
            groq_api_key=groq_key,
            default_model=default_model,
        )


_global_settings: ForgeGuardSettings | None = None


def get_settings() -> ForgeGuardSettings:
    """Retrieve global settings instance, defaulting to environment variables."""
    global _global_settings
    if _global_settings is None:
        _global_settings = ForgeGuardSettings.from_env()
    return _global_settings


def set_settings(settings: ForgeGuardSettings | None) -> None:
    """Explicitly override global settings (useful for tests)."""
    global _global_settings
    _global_settings = settings
