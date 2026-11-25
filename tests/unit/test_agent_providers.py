from __future__ import annotations

import json
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from forgeguard.agent.exceptions import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from forgeguard.agent.models import FinalAction, ToolAction
from forgeguard.agent.providers.groq import DEFAULT_GROQ_MODEL, GroqProvider
from forgeguard.agent.providers.mock import MockProvider
from forgeguard.config import ForgeGuardSettings
from forgeguard.runtime.service import RuntimeService


@pytest.mark.asyncio
async def test_mock_provider_lifecycle() -> None:
    provider = MockProvider(
        responses=[
            ToolAction(
                action_type="tool",
                tool_name="calculator",
                arguments={"expression": "5 + 5"},
                rationale="Math",
            ),
            FinalAction(action_type="final", final_response="Answer is 10"),
        ],
        model="custom-mock",
    )

    assert provider.model_name == "custom-mock"

    resp1 = await provider.complete([{"role": "user", "content": "hello"}])
    assert isinstance(resp1.decision, ToolAction)
    assert resp1.decision.tool_name == "calculator"
    assert resp1.usage.total_tokens > 0

    resp2 = await provider.complete([{"role": "user", "content": "next"}])
    assert isinstance(resp2.decision, FinalAction)
    assert resp2.decision.final_response == "Answer is 10"

    # Queue exhausted, returns default decision
    resp3 = await provider.complete([{"role": "user", "content": "again"}])
    assert isinstance(resp3.decision, FinalAction)
    assert len(provider.call_history) == 3


@pytest.mark.asyncio
async def test_mock_provider_raises_queued_exception() -> None:
    provider = MockProvider(responses=[ProviderTimeoutError("Simulated timeout")])
    with pytest.raises(ProviderTimeoutError, match="Simulated timeout"):
        await provider.complete([])


def test_groq_provider_repr_masks_credentials() -> None:
    provider = GroqProvider(api_key="gsk_super_secret_key_12345", model="test-model")
    repr_str = repr(provider)
    assert "gsk_super_secret_key_12345" not in repr_str
    assert "[CONFIGURED]" in repr_str


def test_groq_provider_missing_key_raises_error() -> None:
    provider = GroqProvider(api_key="")
    with pytest.raises(ProviderConfigurationError, match="Groq API key is missing"):
        provider._ensure_api_key()


@pytest.mark.asyncio
async def test_groq_provider_successful_completion() -> None:
    provider = GroqProvider(api_key="mock_key", retry_delay=0.001)

    mock_response_data = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "action_type": "tool",
                            "tool_name": "calculator",
                            "arguments": {"expression": "10 * 10"},
                            "rationale": "Compute 100",
                        }
                    )
                }
            }
        ],
        "usage": {"prompt_tokens": 15, "completion_tokens": 25, "total_tokens": 40},
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_response_data

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        resp = await provider.complete([{"role": "user", "content": "compute 10*10"}])

    assert isinstance(resp.decision, ToolAction)
    assert resp.decision.tool_name == "calculator"
    assert resp.usage.total_tokens == 40
    assert resp.usage.prompt_tokens == 15
    assert resp.usage.completion_tokens == 25


@pytest.mark.asyncio
async def test_groq_provider_authentication_error() -> None:
    provider = GroqProvider(api_key="bad_key", max_retries=3, retry_delay=0.001)

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Invalid API Key"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(ProviderAuthenticationError, match="authentication failed"):
            await provider.complete([])

    # Non-retryable error should not retry
    assert mock_post.call_count == 1


@pytest.mark.asyncio
async def test_groq_provider_rate_limit_retry_and_exhaustion() -> None:
    provider = GroqProvider(api_key="mock_key", max_retries=2, retry_delay=0.001)

    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "Rate limit reached"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(ProviderRateLimitError, match="rate limit exceeded"):
            await provider.complete([])

    assert mock_post.call_count == 2


@pytest.mark.asyncio
async def test_groq_provider_timeout_error() -> None:
    provider = GroqProvider(api_key="mock_key", max_retries=2, retry_delay=0.001)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.TimeoutException("Read timed out")
        with pytest.raises(ProviderTimeoutError, match="timed out"):
            await provider.complete([])

    assert mock_post.call_count == 2


def test_groq_provider_default_model() -> None:
    assert DEFAULT_GROQ_MODEL == "qwen/qwen3.8-27b"
    provider = GroqProvider(api_key="mock_key")
    assert provider.model_name == "qwen/qwen3.8-27b"


def test_settings_model_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FORGEGUARD_DEFAULT_MODEL", raising=False)
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    settings = ForgeGuardSettings.from_env()
    assert settings.default_model == "qwen/qwen3.8-27b"

    monkeypatch.setenv("GROQ_MODEL", "fallback-model")
    settings = ForgeGuardSettings.from_env()
    assert settings.default_model == "fallback-model"

    monkeypatch.setenv("FORGEGUARD_DEFAULT_MODEL", "preferred-model")
    settings = ForgeGuardSettings.from_env()
    assert settings.default_model == "preferred-model"


def test_runtime_service_instantiates_groq_with_configured_model() -> None:
    settings = ForgeGuardSettings(
        provider="groq",
        groq_api_key="gsk_test_api_key",
        default_model="qwen/qwen3.8-27b",
        db_path=":memory:",
    )
    service = RuntimeService(
        settings=settings,
        persistence=MagicMock(),
        observability=MagicMock(),
    )
    assert isinstance(service.provider, GroqProvider)
    assert service.provider.model_name == "qwen/qwen3.8-27b"


@pytest.mark.parametrize("missing_key", [None, "", "   "])
def test_runtime_service_raises_on_missing_groq_key(missing_key: str | None) -> None:
    settings = ForgeGuardSettings(
        provider="groq",
        groq_api_key=missing_key,
        db_path=":memory:",
    )
    with pytest.raises(ProviderConfigurationError, match="GROQ_API_KEY is missing or empty"):
        RuntimeService(
            settings=settings,
            persistence=MagicMock(),
            observability=MagicMock(),
        )


def test_runtime_service_mock_provider_warning(caplog: pytest.LogCaptureFixture) -> None:
    settings = ForgeGuardSettings(
        provider="mock",
        db_path=":memory:",
    )
    with caplog.at_level(logging.WARNING):
        service = RuntimeService(
            settings=settings,
            persistence=MagicMock(),
            observability=MagicMock(),
        )
    assert isinstance(service.provider, MockProvider)
    assert "Using MockProvider for agent execution" in caplog.text
    assert "Real LLM inference is disabled" in caplog.text


def test_runtime_service_unknown_provider_warning(caplog: pytest.LogCaptureFixture) -> None:
    settings = ForgeGuardSettings(
        provider="unknown_provider",
        db_path=":memory:",
    )
    with caplog.at_level(logging.WARNING):
        service = RuntimeService(
            settings=settings,
            persistence=MagicMock(),
            observability=MagicMock(),
        )
    assert isinstance(service.provider, MockProvider)
    assert (
        "Unknown provider 'unknown_provider' requested; falling back to MockProvider"
        in caplog.text
    )
