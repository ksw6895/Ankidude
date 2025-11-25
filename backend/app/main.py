from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import lectures
from app.core.config import get_settings
from app.core.db import Base, engine

settings = get_settings()

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

if settings.allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(lectures.router, prefix=settings.api_prefix)


@app.get("/health")
def health():
    return {"status": "ok"}
