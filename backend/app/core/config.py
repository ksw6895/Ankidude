from functools import lru_cache
from typing import List, Optional

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Ankidude"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///./ankidude.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: Optional[str] = None
    celery_result_backend: Optional[str] = None

    allowed_origins_raw: str = Field(default="", alias="ALLOWED_ORIGINS")

    gemini_api_key: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_API_KEY")
    )
    gemini_model_id: str = "gemini-3-pro-preview"

    elevenlabs_api_key: Optional[str] = None

    s3_endpoint: Optional[str] = None
    s3_access_key_id: Optional[str] = None
    s3_secret_access_key: Optional[str] = None
    s3_bucket_name: Optional[str] = None
    storage_base_url: Optional[str] = None
    local_storage_path: str = "./storage"

    environment: str = "dev"
    admin_password: Optional[str] = Field(default=None, alias="ADMIN_PASSWORD")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def allowed_origins(self) -> List[str]:
        raw = self.allowed_origins_raw.strip()
        if not raw:
            return []
        return [v.strip() for v in raw.split(",") if v.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
