import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx


def ensure_local_file(url: str) -> Path:
    path = Path(url)
    if path.exists():
        return path

    if url.startswith("http"):
        parsed = urlparse(url)
        filename = os.path.basename(parsed.path) or "downloaded_file"
        temp_dir = Path(tempfile.mkdtemp(prefix="ankidude_"))
        dest = temp_dir / filename
        with httpx.stream("GET", url, timeout=600) as response:
            response.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in response.iter_bytes():
                    f.write(chunk)
        return dest

    raise FileNotFoundError(f"Cannot resolve local file from {url}")
