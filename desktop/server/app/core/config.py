from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # LLM (maragate, OpenAI-compatible). openai_base_url/api_key/model are read
    # from desktop/.env (shared with the Node app).
    openai_base_url: str = "https://maragate.aibotplatform.com/v1"
    openai_api_key: str = ""
    openai_model: str = "azure/gpt-6-luna"
    openai_embedding_model: str = "alibaba/text-embedding-v4"

    # DB: SQLite now (swap to mysql+pymysql://user:pass@host/db when MySQL is up).
    database_url: str = "sqlite:///./data/tada.db"

    # Chroma (embedded, persistent to a dir).
    chroma_persist_dir: str = "data/chroma"
    chroma_collection_name: str = "tada_knowledge"
    chroma_snapshot_dir: str = "data/chroma-snapshots"
    chroma_snapshot_keep: int = 5

    # RAG params (from mind-py).
    knowledge_top_k: int = 4
    knowledge_candidate_k: int = 16
    knowledge_chunk_size: int = 512
    knowledge_chunk_overlap: int = 64
    knowledge_hybrid_vector_weight: float = 0.65
    knowledge_hybrid_bm25_weight: float = 0.35
    knowledge_rerank_enabled: bool = True
    knowledge_vector_enabled: bool = True
    knowledge_vector_required: bool = False
    embedding_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[3] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[2]  # server/


@lru_cache
def get_settings() -> Settings:
    return Settings()
