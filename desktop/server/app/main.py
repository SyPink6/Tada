import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.migrate import ensure_snippet_schema
from app.services.enrichment import worker_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    t = threading.Thread(target=worker_loop, args=(settings,), daemon=True, name="enrichment-worker")
    t.start()
    logger.info("enrichment worker started")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Tada Server", version="0.1.0", lifespan=lifespan)
    Base.metadata.create_all(bind=engine)  # create new tables (does not alter existing)
    ensure_snippet_schema(engine)  # idempotent: add snippet_id + backfill + status/image_path/error
    app.include_router(router)
    return app


app = create_app()
