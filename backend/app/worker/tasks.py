from app.core.celery_app import celery_app
from app.core.db import Base, SessionLocal, engine
from app.services.pipeline import process_lecture_job
from app.storage.manager import get_storage_manager

Base.metadata.create_all(bind=engine)


@celery_app.task(name="app.worker.tasks.process_lecture")
def process_lecture_task(lecture_id: str, language_code: str | None = None):
    db = SessionLocal()
    storage = get_storage_manager()
    try:
        process_lecture_job(lecture_id, db, storage, language_code=language_code)
    finally:
        db.close()
