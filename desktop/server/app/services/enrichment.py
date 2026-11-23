"""Async enrichment worker: processes pending Snippets (chunk/embed/fetch/VLM).

Runs in a daemon thread started at app startup (main.py lifespan). Single-threaded
(sequential) to avoid embedding concurrency. Restart-resilient: status is in the DB,
so on startup it re-processes any snippets left pending.
"""
from __future__ import annotations

import logging
import time
import traceback

import httpx

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import SessionLocal
from app.models.entities import DailyLog, Snippet
from app.services.knowledge import KnowledgeService, save_snippet_fast  # noqa: F401 (re-exported for convenience)
from app.services import fetcher, vision

logger = logging.getLogger(__name__)


def _title_from(text: str, limit: int = 40) -> str:
    for line in (text or "").splitlines():
        s = line.strip().lstrip("#*").strip()
        if s and not s.endswith("：") and not s.endswith(":"):
            return s[:limit]
    return ""


def summarize_title(content: str, settings: Settings) -> str:
    """LLM-summarize a 10-20 char title from content. Returns "" on failure."""
    if not content or not content.strip():
        return ""
    payload = {
        "model": settings.openai_model,
        "reasoning_effort": "none",
        "messages": [
            {"role": "system", "content": "你起标题。用 10-20 字概括下面内容的核心，只返回标题文字，不要引号、不要标点结尾。"},
            {"role": "user", "content": (content or "")[:1500]},
        ],
    }
    try:
        r = httpx.post(
            f"{settings.openai_base_url.rstrip('/')}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"},
            timeout=30,
        )
        r.raise_for_status()
        t = (r.json()["choices"][0]["message"].get("content") or "").strip().strip('"“”\'').strip()
        return t[:40]
    except Exception as exc:
        logger.warning("summarize_title failed: %s", exc)
        return ""


def _update_chat_trail(db: Session, snip: Snippet, text: str) -> None:
    """Update the '存到随手记了，正在分析…' chat_assistant message for this snippet
    to reflect completion. Locates it via the snippet_saved event (content=snippet id)
    and the chat_assistant immediately before it on the same day."""
    try:
        sv = (db.query(DailyLog).filter(DailyLog.entry_type == "snippet_saved", DailyLog.content == str(snip.id))
              .order_by(DailyLog.id.desc()).first())
        if not sv:
            return
        ca = (db.query(DailyLog).filter(DailyLog.entry_type == "chat_assistant", DailyLog.date == sv.date, DailyLog.id < sv.id)
              .order_by(DailyLog.id.desc()).first())
        if ca and ca.content.startswith("存到随手记了"):
            ca.content = text[:2000]
            db.commit()
    except Exception as exc:
        logger.warning("update chat trail failed for snippet %s: %s", snip.id, exc)


def _mark(db: Session, snip: Snippet, status: str, error: str | None = None) -> None:
    snip.status = status
    if error is not None:
        snip.error = error[:500]
    db.commit()
    # reflect completion in the chat history (so reload shows the final state, not "正在分析")
    if status == "ready":
        _update_chat_trail(db, snip, f"分析完成：{snip.title}")
    elif status == "failed":
        _update_chat_trail(db, snip, "分析失败了，可去随手记重试或删除")


def process_one(db: Session, settings: Settings, snip: Snippet) -> None:
    """Enrich a single pending snippet in-place."""
    if snip.chat_only:
        # 聊/发送 image attachment: no VLM/chunks/search — just mark ready (file is already stored).
        _mark(db, snip, "ready")
        return
    svc = KnowledgeService(db, settings)
    try:
        if snip.type == "text":
            if not snip.title:
                snip.title = summarize_title(snip.original_content, settings) or _title_from(snip.original_content) or "文本记录"
            svc.ingest(snip.id, snip.original_content or "")
        elif snip.type == "link":
            fetched = fetcher.fetch_url(snip.url)
            if not fetched.get("ok") or not fetched.get("text"):
                _mark(db, snip, "failed", fetched.get("error") or "抓取失败")
                return
            snip.original_content = fetched["text"]
            snip.content_format = fetched.get("content_format", "text")
            if not snip.title:
                snip.title = summarize_title(fetched["text"], settings) or (fetched.get("title") or "")[:40] or snip.url[:40]
            svc.ingest(snip.id, fetched["text"])
        elif snip.type == "image":
            res = vision.describe_image(snip.image_path, settings)
            snip.original_content = res["description"]
            snip.ocr_text = res["text"]
            snip.content_format = "text"
            if not snip.title:
                snip.title = summarize_title(res["description"], settings) or _title_from(res["description"]) or "图片记录"
            # index both description + transcription (searchable), stored separately for display
            svc.ingest(snip.id, (res["description"] + "\n\n" + res["text"]).strip())
        else:
            _mark(db, snip, "failed", f"未知类型 {snip.type}")
            return
        _mark(db, snip, "ready")
    except Exception as exc:
        logger.warning("enrichment failed for snippet %s: %s", snip.id, exc)
        _mark(db, snip, "failed", f"{type(exc).__name__}: {exc}")


def process_pending(settings: Settings) -> bool:
    """Process the oldest pending snippet. Returns True if one was processed."""
    db = SessionLocal()
    try:
        snip = (
            db.query(Snippet)
            .filter(Snippet.status == "pending")
            .order_by(Snippet.created_at.asc())
            .first()
        )
        if not snip:
            return False
        logger.info("enrichment: processing snippet %s (type=%s)", snip.id, snip.type)
        process_one(db, settings, snip)
        return True
    finally:
        db.close()


def worker_loop(settings: Settings) -> None:
    """Background loop: process pending snippets, sleep when idle."""
    while True:
        try:
            busy = process_pending(settings)
            time.sleep(0.5 if busy else 2.0)
        except Exception:
            # never let the worker die
            logger.error("worker loop error:\n%s", traceback.format_exc())
            time.sleep(5)
