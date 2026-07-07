"""
Netwatch — centralised application configuration.
All values are read from environment variables (or a .env file).
"""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_reload: bool = True

    # ── SSH defaults ──────────────────────────────────────────────────────
    default_ssh_user: str = "admin"
    default_ssh_password: str = ""

    # ── Scrapli ───────────────────────────────────────────────────────────
    scrapli_transport: str = "asyncssh"
    ssh_connect_timeout: float = 20.0
    ssh_auth_timeout: float = 15.0
    ssh_command_timeout: float = 60.0

    # ── Concurrency ───────────────────────────────────────────────────────
    max_concurrent_sessions: int = 10

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:8000"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: str) -> str:
        return v  # keep as str; parsed in main.py

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env.lower() == "development"


# Singleton — import this everywhere
settings = Settings()
