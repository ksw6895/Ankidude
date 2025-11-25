import os
import uuid
from pathlib import Path
from typing import Optional, Tuple

import boto3
from botocore.client import Config

from app.core.config import get_settings


class StorageManager:
    def __init__(self):
        self.settings = get_settings()
        base_raw = Path(self.settings.local_storage_path)
        if base_raw.is_absolute():
            self.base_path = base_raw
        else:
            repo_root = Path(__file__).resolve().parents[3]
            self.base_path = (repo_root / base_raw).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

        self._s3_client = None
        if (
            self.settings.s3_access_key_id
            and self.settings.s3_secret_access_key
            and self.settings.s3_bucket_name
        ):
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=self.settings.s3_endpoint,
                aws_access_key_id=self.settings.s3_access_key_id,
                aws_secret_access_key=self.settings.s3_secret_access_key,
                config=Config(s3={"addressing_style": "path"}),
            )

    def _make_key(self, prefix: str, filename: str) -> Tuple[str, str]:
        safe_name = filename.replace(" ", "_")
        key = f"{prefix}/{uuid.uuid4()}-{safe_name}"
        return key, os.path.basename(key)

    def save_bytes(self, data: bytes, filename: str, prefix: str = "uploads") -> str:
        key, _ = self._make_key(prefix, filename)
        if self._s3_client:
            self._s3_client.put_object(
                Bucket=self.settings.s3_bucket_name,
                Key=key,
                Body=data,
            )
            return self._build_remote_url(key)

        path = self.base_path / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    def save_fileobj(self, file_obj, filename: str, prefix: str = "uploads") -> str:
        content = file_obj.read()
        return self.save_bytes(content, filename, prefix=prefix)

    def _build_remote_url(self, key: str) -> str:
        if self.settings.storage_base_url:
            return f"{self.settings.storage_base_url.rstrip('/')}/{key}"

        endpoint = self.settings.s3_endpoint.rstrip("/") if self.settings.s3_endpoint else ""
        return f"{endpoint}/{self.settings.s3_bucket_name}/{key}".rstrip("/")

    def resolve_local_path(self, url: str) -> Optional[Path]:
        if url.startswith("http"):
            return None
        path = Path(url)
        if path.is_absolute():
            return path
        return (self.base_path / path).resolve()


def get_storage_manager() -> StorageManager:
    return StorageManager()
