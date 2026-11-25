from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx

from forgeguard.agent.exceptions import (
    ModelUnavailableError,
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderNetworkError,
    ProviderRateLimitError,
    ProviderResponseError,
    ProviderTimeoutError,
)
from forgeguard.agent.models import parse_agent_decision
from forgeguard.agent.provider import BaseLLMProvider, ProviderResponse, TokenUsage

logger = logging.getLogger("forgeguard.agent.providers.groq")

DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b"
GROQ_API_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


class GroqProvider(BaseLLMProvider):
    """Production Groq LLM integration with structured JSON responses and bounded retries."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_GROQ_MODEL,
        temperature: float = 0.0,
        timeout_seconds: float = 30.0,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        self._api_key = api_key or os.environ.get("GROQ_API_KEY", "")
        self._model = model
        self.temperature = temperature
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    @property
    def model_name(self) -> str:
        return self._model

    def __repr__(self) -> str:
        masked_key = "[CONFIGURED]" if self._api_key else "[NOT CONFIGURED]"
        return (
            f"GroqProvider(model={self._model!r}, temperature={self.temperature}, "
            f"api_key={masked_key})"
        )

    def _ensure_api_key(self) -> str:
        key = self._api_key or os.environ.get("GROQ_API_KEY", "")
        if not key.strip():
            raise ProviderConfigurationError(
                "Groq API key is missing. Set the 'GROQ_API_KEY' environment variable "
                "or pass 'api_key' to GroqProvider."
            )
        return key

    async def complete(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        """Call Groq API with structured JSON output enforcement and exponential retry backoff."""
        api_key = self._ensure_api_key()

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ForgeGuard-Agent/0.1.0",
        }

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": self.temperature,
            "response_format": {"type": "json_object"},
        }

        attempt = 0
        last_error: Exception | None = None
        start_mono = time.monotonic()

        while attempt < self.max_retries:
            attempt += 1
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    resp = await client.post(
                        GROQ_API_ENDPOINT,
                        json=payload,
                        headers=headers,
                    )

                if resp.status_code == 200:
                    latency = time.monotonic() - start_mono
                    data = resp.json()

                    choices = data.get("choices", [])
                    if not choices:
                        raise ProviderResponseError("Groq response returned no choices.")

                    raw_content = choices[0].get("message", {}).get("content", "")
                    if not raw_content:
                        raise ProviderResponseError("Groq response message content is empty.")

                    decision = parse_agent_decision(raw_content)

                    usage_dict = data.get("usage", {})
                    usage = TokenUsage(
                        prompt_tokens=usage_dict.get("prompt_tokens", 0),
                        completion_tokens=usage_dict.get("completion_tokens", 0),
                        total_tokens=usage_dict.get("total_tokens", 0),
                    )

                    return ProviderResponse(
                        content=raw_content,
                        decision=decision,
                        raw_json=data,
                        usage=usage,
                        latency_seconds=latency,
                        model=self._model,
                    )

                elif resp.status_code in (401, 403):
                    error_msg = f"Groq authentication failed (HTTP {resp.status_code})"
                    logger.error("%s: invalid or unauthorized API key.", error_msg)
                    raise ProviderAuthenticationError(error_msg)

                elif resp.status_code == 404:
                    raise ModelUnavailableError(f"Groq model '{self._model}' not found (HTTP 404).")

                elif resp.status_code == 429:
                    error_msg = f"Groq rate limit exceeded (HTTP 429): {resp.text}"
                    last_error = ProviderRateLimitError(error_msg)
                    logger.warning("Groq rate limit hit on attempt %d: %s", attempt, error_msg)

                elif resp.status_code in (500, 502, 503, 504):
                    error_msg = f"Groq server error (HTTP {resp.status_code}): {resp.text}"
                    last_error = ProviderResponseError(error_msg)
                    logger.warning("Groq server error on attempt %d: %s", attempt, error_msg)

                else:
                    raise ProviderResponseError(
                        f"Groq API returned unexpected status {resp.status_code}: {resp.text}"
                    )

            except (httpx.TimeoutException, TimeoutError) as exc:
                last_error = ProviderTimeoutError(
                    f"Groq request timed out after {self.timeout_seconds}s: {exc}"
                )
                logger.warning("Groq request timed out on attempt %d", attempt)

            except httpx.NetworkError as exc:
                last_error = ProviderNetworkError(f"Groq network error: {exc}")
                logger.warning("Groq network error on attempt %d: %s", attempt, exc)

            if attempt < self.max_retries:
                backoff_delay = self.retry_delay * (2 ** (attempt - 1))
                await asyncio.sleep(backoff_delay)

        if last_error is not None:
            raise last_error
        raise ProviderResponseError(f"Groq completion failed after {self.max_retries} attempts.")
