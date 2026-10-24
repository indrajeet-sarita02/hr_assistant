from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment / backend/.env.

    Secrets are never logged. Production startup validates the most dangerous
    defaults (debug mode, placeholder JWT secret, wildcard CORS).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "HR Assistant API"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://myuser:mypass@localhost:5432/hr_assist"
    database_echo: bool = False
    database_pool_size: int = 10
    database_max_overflow: int = 20

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    password_hash_algorithm: str = "argon2"

    cors_origins: str = "http://localhost:3000,http://localhost:8000"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"

    default_locale: Literal["en", "hi"] = "en"
    supported_locales: tuple[str, ...] = ("en", "hi")

    rate_limit_enabled: bool = True
    rate_limit_auth_per_minute: int = 10
    rate_limit_ai_per_minute: int = 20
    rate_limit_write_per_minute: int = 60
    rate_limit_public_write_per_minute: int = 10
    idempotency_ttl_hours: int = 24

    max_page_size: int = 100
    default_page_size: int = 20
    max_question_chars: int = 2000

    # Operational metrics are disabled in production unless explicitly enabled.
    metrics_enabled: bool = False

    document_max_size_mb: int = 10
    document_allowed_mime_types: str = (
        "application/pdf,image/jpeg,image/png,text/plain,"
        "application/msword,"
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    # Adapter defaults: the SRS leaves provider selection open. The default
    # implementation is deliberately local/deterministic, never a hidden vendor.
    ai_provider: Literal["local_extractive"] = "local_extractive"
    ai_model_name: str = "local-extractive-v1"
    object_storage_provider: Literal["local_metadata"] = "local_metadata"
    notification_provider: Literal["in_app"] = "in_app"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        # Prisma/Heroku-style URLs are normalised for psycopg 3.
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://") and "+psycopg" not in value:
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def trusted_host_list(self) -> list[str]:
        return [item.strip() for item in self.trusted_hosts.split(",") if item.strip()]

    @property
    def document_mime_allowlist(self) -> frozenset[str]:
        return frozenset(
            item.strip().lower()
            for item in self.document_allowed_mime_types.split(",")
            if item.strip()
        )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    def validate_runtime_safety(self) -> None:
        if not self.is_production:
            return
        problems: list[str] = []
        if self.debug:
            problems.append("DEBUG must be false in production")
        if self.jwt_secret_key in {"change-me-in-production", "dev-only-secret"}:
            problems.append("JWT_SECRET_KEY still uses a development placeholder")
        if "*" in self.cors_origin_list:
            problems.append("wildcard CORS is not allowed in production")
        if problems:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_runtime_safety()
    return settings


settings = get_settings()
