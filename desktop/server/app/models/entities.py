from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def now() -> datetime:
    return datetime.utcnow()


class Snippet(Base):
    __tablename__ = "snippets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(20), default="text")  # text/link (image/file later)
    title: Mapped[str] = mapped_column(String(256))
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_content: Mapped[Optional[str]] = mapped_column(Text().with_variant(MEDIUMTEXT(), "mysql"), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    content_format: Mapped[str] = mapped_column(String(20), default="text")  # text/markdown
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snippet_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("snippets.id"), index=True, nullable=True)
    source_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    # NOTE: legacy `source` (VARCHAR 256) and `category` (VARCHAR 100) columns remain
    # in the DB (made nullable by the migration) but are no longer declared here —
    # SQLAlchemy 2.0 ignores undeclared columns. All grouping is via snippet_id.


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(40))
    time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # HH:MM
    order: Mapped[float] = mapped_column(Float, default=0.0)  # untimed queue order
    recurrence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON {freq,days}
    start_date: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD
    end_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Completion(Base):
    __tablename__ = "completions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, index=True)
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    __table_args__ = (UniqueConstraint("task_id", "date", name="uq_task_date"),)


class DailyLog(Base):
    __tablename__ = "daily_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    category: Mapped[str] = mapped_column(String(20), default="chat")  # schedule/info/microstep/chat
    entry_type: Mapped[str] = mapped_column(String(30))  # chat_user / chat_assistant / task_created / ...
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
