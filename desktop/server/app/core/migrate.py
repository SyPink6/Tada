"""One-time, idempotent schema migration: introduce the Snippet entity.

Runs at app startup (after ``create_all``) via :func:`ensure_snippet_schema`. Migrates
the legacy ``source``-string-keyed ``KnowledgeChunk`` model to ``snippet_id``-based.

Uses raw SQL (``text()``) for reading the legacy ``source``/``category`` columns —
the ORM model no longer declares them — and inserts ``Snippet`` rows via raw SQL too,
all inside a single transaction per phase so ``LAST_INSERT_ID()`` is consistent.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime

from sqlalchemy import text

logger = logging.getLogger(__name__)

_LINK_PREFIX = "来源链接："
_URL_RE = re.compile(r"来源链接：(https?://\S+)")


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1"
        ),
        {"t": table, "c": column},
    ).first()
    return row is not None


def ensure_snippet_schema(engine) -> None:
    """Add snippet_id to knowledge_chunks, backfill Snippets, migrate daily_log.

    Idempotent + resumable: safe to run on every startup.
    """
    # 1. schema: add snippet_id column (create_all makes the snippets table, but does
    #    NOT alter the existing knowledge_chunks table).
    with engine.begin() as conn:
        if not _column_exists(conn, "knowledge_chunks", "snippet_id"):
            logger.info("migrate: ADD COLUMN knowledge_chunks.snippet_id")
            conn.execute(text("ALTER TABLE knowledge_chunks ADD COLUMN snippet_id INT NULL"))
        # snippets table was created by an earlier model version without content_format;
        # create_all won't alter it, so add the column idempotently.
        if not _column_exists(conn, "snippets", "content_format"):
            logger.info("migrate: ADD COLUMN snippets.content_format")
            conn.execute(text("ALTER TABLE snippets ADD COLUMN content_format VARCHAR(20) NOT NULL DEFAULT 'text'"))
        # async/image support: status (pending/ready/failed), image_path, error.
        # existing rows are already analyzed → default status='ready'.
        if not _column_exists(conn, "snippets", "status"):
            logger.info("migrate: ADD COLUMN snippets.status")
            conn.execute(text("ALTER TABLE snippets ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ready'"))
        if not _column_exists(conn, "snippets", "image_path"):
            logger.info("migrate: ADD COLUMN snippets.image_path")
            conn.execute(text("ALTER TABLE snippets ADD COLUMN image_path TEXT NULL"))
        if not _column_exists(conn, "snippets", "error"):
            logger.info("migrate: ADD COLUMN snippets.error")
            conn.execute(text("ALTER TABLE snippets ADD COLUMN error TEXT NULL"))
        if not _column_exists(conn, "snippets", "ocr_text"):
            logger.info("migrate: ADD COLUMN snippets.ocr_text")
            conn.execute(text("ALTER TABLE snippets ADD COLUMN ocr_text LONGTEXT NULL"))
        # original_content: TEXT (64KB) is too small for long articles (Chinese docs).
        # bump to MEDIUMTEXT (16MB) if it's still a small TEXT type.
        oc = conn.execute(text(
            "SELECT DATA_TYPE FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'snippets' AND column_name = 'original_content'"
        )).first()
        if oc and oc[0] in ("text", "tinytext") :
            logger.info("migrate: snippets.original_content %s → MEDIUMTEXT", oc[0])
            conn.execute(text("ALTER TABLE snippets MODIFY COLUMN original_content MEDIUMTEXT"))
        # make legacy columns nullable so future ORM inserts (which no longer set them)
        # don't violate NOT NULL.
        if _column_exists(conn, "knowledge_chunks", "source"):
            conn.execute(text("ALTER TABLE knowledge_chunks MODIFY COLUMN source VARCHAR(256) NULL"))
        if _column_exists(conn, "knowledge_chunks", "category"):
            conn.execute(text("ALTER TABLE knowledge_chunks MODIFY COLUMN category VARCHAR(100) NULL"))

    # 2. backfill: distinct legacy sources with NULL snippet_id → create Snippet + link chunks.
    _backfill_snippets(engine)

    # 3. daily_log: replace title-string content with snippet.id for snippet events.
    _migrate_daily_log(engine)


def _backfill_snippets(engine) -> None:
    with engine.begin() as conn:
        sources = [
            r[0] for r in conn.execute(
                text(
                    "SELECT DISTINCT source FROM knowledge_chunks "
                    "WHERE snippet_id IS NULL AND source IS NOT NULL"
                )
            )
        ]
        if not sources:
            return
        count = 0
        for source in sources:
            rows = conn.execute(
                text(
                    "SELECT source_index, content, category FROM knowledge_chunks "
                    "WHERE source = :s ORDER BY source_index"
                ),
                {"s": source},
            ).all()
            if not rows:
                continue
            first_content = rows[0][1] or ""
            first_category = rows[0][2]
            stype = "link" if first_content.startswith(_LINK_PREFIX) else "text"
            url = None
            if stype == "link":
                m = _URL_RE.search(first_content)
                url = m.group(1) if m else None
            original = "\n\n".join((r[1] or "") for r in rows)
            # idempotent: reuse an existing Snippet with the same title if present
            existing = conn.execute(
                text("SELECT id FROM snippets WHERE title = :t LIMIT 1"), {"t": source}
            ).first()
            if existing:
                snippet_id = existing[0]
            else:
                conn.execute(
                    text(
                        "INSERT INTO snippets (type, title, url, original_content, category, created_at) "
                        "VALUES (:type, :title, :url, :orig, :cat, :created)"
                    ),
                    {
                        "type": stype,
                        "title": source,
                        "url": url,
                        "orig": original,
                        "cat": first_category,
                        "created": datetime.utcnow(),
                    },
                )
                snippet_id = conn.execute(text("SELECT LAST_INSERT_ID()")).scalar()
            conn.execute(
                text(
                    "UPDATE knowledge_chunks SET snippet_id = :sid "
                    "WHERE source = :s AND snippet_id IS NULL"
                ),
                {"sid": snippet_id, "s": source},
            )
            count += 1
        logger.info("migrate: backfilled %d snippets from legacy sources", count)


def _migrate_daily_log(engine) -> None:
    """Replace title-string content with snippet.id for snippet_saved/snippet_deleted rows."""
    with engine.begin() as conn:
        entries = conn.execute(
            text(
                "SELECT id, content FROM daily_log "
                "WHERE entry_type IN ('snippet_saved','snippet_deleted')"
            )
        ).all()
        if not entries:
            return
        updated = 0
        for eid, content in entries:
            if not content or content.isdigit():
                continue  # already an id (or empty)
            # exact title match first; fall back to prefix match (daily_log.content was
            # truncated to 200 chars, while snippets.title holds the full legacy source).
            row = conn.execute(
                text("SELECT id FROM snippets WHERE title = :t LIMIT 1"), {"t": content}
            ).first()
            if not row:
                row = conn.execute(
                    text("SELECT id FROM snippets WHERE title LIKE :p LIMIT 1"),
                    {"p": content + "%"},
                ).first()
            if row:
                conn.execute(
                    text("UPDATE daily_log SET content = :c WHERE id = :id"),
                    {"c": str(row[0]), "id": eid},
                )
                updated += 1
            # else: snippet was deleted — leave the title string as a historical record.
        logger.info("migrate: rewrote %d daily_log snippet events to snippet ids", updated)
