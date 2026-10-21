"""
ExamProctor.ai — Application Configuration
Reads from environment variables / .env file.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    # ── Application ─────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    SECRET_KEY: str = "INSECURE_DEVELOPMENT_SECRET_REPLACE_IN_PRODUCTION"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://examproctor:examproctor@localhost:5432/examproctor"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://examproctor:examproctor@localhost:5432/examproctor"

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Comma-separated string in .env; use `allowed_origins_list` for the parsed list.
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ── File storage ──────────────────────────────────────────────────────────
    SNAPSHOT_STORAGE_TYPE: str = "local"
    SNAPSHOT_LOCAL_DIR: str = "./storage/snapshots"
    MAX_SNAPSHOT_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB

    # ── Excel import ──────────────────────────────────────────────────────────
    MAX_EXCEL_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    MAX_EXCEL_ROWS: int = 500

    # ── Admin bootstrap ───────────────────────────────────────────────────────
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@examproctor.ai"
    BOOTSTRAP_ADMIN_PASSWORD: str = "CHANGE_BEFORE_PRODUCTION"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
