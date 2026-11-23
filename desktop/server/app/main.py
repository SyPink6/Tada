from fastapi import FastAPI

from app.api.routes import router
from app.core.database import Base, engine
from app.core.migrate import ensure_snippet_schema


def create_app() -> FastAPI:
    app = FastAPI(title="Tada Server", version="0.1.0")
    Base.metadata.create_all(bind=engine)  # create new tables (does not alter existing)
    ensure_snippet_schema(engine)  # idempotent: add snippet_id + backfill Snippets + daily_log
    app.include_router(router)
    return app


app = create_app()
