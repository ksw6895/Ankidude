from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.storage.manager import StorageManager, get_storage_manager


def get_settings_dep() -> Settings:
    return get_settings()


def get_storage_dep() -> StorageManager:
    return get_storage_manager()


__all__ = ["get_db", "get_settings_dep", "get_storage_dep"]
