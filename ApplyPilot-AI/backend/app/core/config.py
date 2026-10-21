"""Application settings, loaded from APPLYPILOT_* environment variables (or .env)."""
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-insecure-key-change-me-dev-insecure-key"
# Chrome extension IDs are 32 chars in a-p. In production, pin your real extension ID instead.
DEV_EXTENSION_ORIGIN_REGEX = r"^chrome-extension://[a-p]{32}$"

DEFAULT_SCORE_WEIGHTS = {
    "required_skills": 0.35,
    "preferred_skills": 0.20,
    "semantic": 0.20,
    "experience": 0.15,
    "education": 0.10,
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APPLYPILOT_", extra="ignore")

    env: str = "development"  # development | production | test
    database_url: str = "sqlite:///./applypilot.db"
    secret_key: str = DEV_SECRET
    access_token_minutes: int = 60

    cors_origins: list[str] = ["http://localhost:5173"]
    cors_origin_regex: str | None = None

    upload_dir: Path = Path("./storage/resumes")
    max_upload_bytes: int = 5 * 1024 * 1024
    max_resume_text_chars: int = 200_000

    rate_limit_enabled: bool = True
    auth_rate_limit_per_minute: int = 10

    # AI provider: none | openai_compatible (OpenAI, Ollama's /v1, etc.) | anthropic
    ai_provider: str = "none"
    ai_base_url: str | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None
    ai_timeout_seconds: float = 45.0

    # Scoring (documented starting assumptions, not validated constants)
    score_weights: dict[str, float] = DEFAULT_SCORE_WEIGHTS
    semantic_backend: str = "lexical"  # lexical | sentence-transformers (optional install)
    semantic_calibration: float = 0.35  # cosine at/above which relevance is treated as 1.0

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if self.database_url.startswith(("postgres://", "postgresql://")):
            self.database_url = self.database_url.replace("://", "+psycopg://", 1)
        if self.env == "production":
            if self.secret_key == DEV_SECRET or len(self.secret_key) < 32:
                raise ValueError("APPLYPILOT_SECRET_KEY must be set to a random value (>=32 chars) in production")
        elif self.cors_origin_regex is None:
            self.cors_origin_regex = DEV_EXTENSION_ORIGIN_REGEX
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
