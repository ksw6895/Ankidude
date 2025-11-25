from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Optional


class Settings(BaseSettings):
    app_name: str = "Ankidude"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///./ankidude.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: Optional[str] = None
    celery_result_backend: Optional[str] = None

    allowed_origins: List[str] = []

    gemini_api_key: Optional[str] = None
    gemini_model_id: str = "gemini-3-pro-preview"

    elevenlabs_api_key: Optional[str] = None

    s3_endpoint: Optional[str] = None
    s3_access_key_id: Optional[str] = None
    s3_secret_access_key: Optional[str] = None
    s3_bucket_name: Optional[str] = None
    storage_base_url: Optional[str] = None
    local_storage_path: str = "./storage"

    environment: str = "dev"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
