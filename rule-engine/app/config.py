from __future__ import annotations

import os
from datetime import UTC
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, fail-fast on weak secrets in production."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    service_token: str = Field(default="dev-engine-token-change-me", alias="ENGINE_SERVICE_TOKEN")
    hmac_secret: str = Field(default="", alias="ENGINE_HMAC_SECRET")
    regulation_data_dir: str = Field(default="", alias="REGULATION_DATA_DIR")
    database_url: str = Field(default="", alias="DATABASE_URL")
    policy_ingest_on_start: bool = Field(default=True, alias="POLICY_INGEST_ON_START")
    rag_min_confidence: float = Field(default=0.32, alias="RAG_MIN_CONFIDENCE")
    rag_top_k: int = Field(default=5, alias="RAG_TOP_K")
    embedding_dim: int = Field(default=384, alias="EMBEDDING_DIM")
    request_timeout_seconds: float = Field(default=20.0, alias="REQUEST_TIMEOUT_SECONDS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    def validate_production(self) -> None:
        if self.app_env.lower() in {"production", "prod"}:
            weak = {
                "",
                "change-me",
                "dev-engine-token-change-me",
                "changeme",
                "secret",
            }
            if self.service_token.lower() in weak or len(self.service_token) < 32:
                raise RuntimeError(
                    "ENGINE_SERVICE_TOKEN must be a strong (>=32 char) secret in production"
                )
            if not self.database_url:
                raise RuntimeError("DATABASE_URL is required in production")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_production()
    return settings


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def regulation_dir() -> Path:
    configured = get_settings().regulation_data_dir
    if configured:
        return Path(configured).resolve()
    return repo_root() / "regulation-data"


def utc_now_iso() -> str:
    from datetime import datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}
