from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ankidude",
    broker=settings.celery_broker_url or settings.redis_url,
    backend=settings.celery_result_backend or settings.redis_url,
)

celery_app.conf.task_routes = {"app.worker.tasks.*": {"queue": "lectures"}}
celery_app.conf.task_default_queue = "lectures"
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.task_time_limit = 60 * 60 * 2
