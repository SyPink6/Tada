from fastapi import FastAPI

from app.api.routes import router
from app.core.database import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(title="Tada Server", version="0.1.0")
    Base.metadata.create_all(bind=engine)  # create tables (SQLite)
    app.include_router(router)
    return app


app = create_app()
