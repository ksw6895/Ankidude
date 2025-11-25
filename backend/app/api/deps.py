from fastapi import Depends, Header, HTTPException

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.storage.manager import StorageManager, get_storage_manager


def get_settings_dep() -> Settings:
    return get_settings()


def get_storage_dep() -> StorageManager:
    return get_storage_manager()


def require_admin_password(
    settings: Settings = Depends(get_settings_dep),
    admin_password: str | None = Header(None, alias="X-Admin-Password"),
):
    if settings.admin_password and settings.admin_password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin password")
    return True


__all__ = ["get_db", "get_settings_dep", "get_storage_dep", "require_admin_password"]
