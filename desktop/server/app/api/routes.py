import base64
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.services.agent import AgentService
from app.services.knowledge import KnowledgeService, save_snippet_fast
from app.services.tasks import TaskService
from app.services.vector_store import ChromaKnowledgeStore
from app.models.entities import DailyLog, KnowledgeChunk, Snippet

router = APIRouter()
settings = get_settings()

_EXT_BY_MIME = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}


# --- RAG ---

class EmbedRequest(BaseModel):
    text: str

class IngestRequest(BaseModel):
    title: str
    content: str
    type: str = "text"
    category: str | None = None
    url: str | None = None

class SaveSnippetRequest(BaseModel):
    type: str  # text/link/image
    content: str | None = None
    url: str | None = None
    title: str | None = None
    category: str | None = None
    image_base64: str | None = None
    image_mime: str | None = None

class SearchRequest(BaseModel):
    query: str
    top_k: int | None = None

@router.get("/health")
def health():
    return {"status": "ok"}

@router.get("/api/status")
def status():
    return {"demo": not bool(settings.openai_api_key and settings.openai_model)}

@router.post("/api/embed")
def embed(req: EmbedRequest):
    store = ChromaKnowledgeStore(settings)
    if not store.can_embed:
        raise HTTPException(status_code=503, detail=getattr(store, "error", "embed unavailable"))
    try:
        vec = store.embed_texts([req.text])[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"embedding": vec}

@router.post("/api/knowledge/ingest")
def ingest(req: IngestRequest, db: Session = Depends(get_db)):
    snip = Snippet(type=req.type, title=req.title[:256], url=req.url,
                   original_content=req.content, category=req.category)
    db.add(snip)
    db.flush()
    svc = KnowledgeService(db, settings)
    count = svc.ingest(snip.id, req.content)
    return {"id": snip.id, "chunks": count}


@router.post("/api/knowledge/save")
def knowledge_save(req: SaveSnippetRequest, db: Session = Depends(get_db)):
    """Direct fast-save (the 存 button). Stores raw data + status=pending; the
    enrichment worker does the heavy analysis (chunk/embed/fetch/VLM) async."""
    image_path = None
    if req.type == "image":
        if not req.image_base64:
            raise HTTPException(status_code=400, detail="图片类型需要 image_base64")
        mime = (req.image_mime or "image/png").lower()
        ext = _EXT_BY_MIME.get(mime, ".png")
        img_dir = Path(settings.project_root) / "data" / "images"
        img_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{uuid.uuid4().hex}{ext}"
        (img_dir / fname).write_bytes(base64.b64decode(req.image_base64))
        image_path = f"data/images/{fname}"
    snip = save_snippet_fast(
        db, type=req.type, content=req.content, title=req.title,
        url=req.url, image_path=image_path, category=req.category,
    )
    # leave a daily_log trail so the by-day 随手记 tab sees direct saves too
    today = datetime.now().strftime("%Y-%m-%d")
    db.add(DailyLog(date=today, entry_type="snippet_saved", content=str(snip.id), category="info"))
    db.commit()
    return {"id": snip.id, "status": snip.status}


@router.get("/api/knowledge/image/{snippet_id}")
def knowledge_image(snippet_id: int, db: Session = Depends(get_db)):
    s = db.get(Snippet, snippet_id)
    if not s or not s.image_path:
        raise HTTPException(status_code=404, detail="no image")
    full = Path(settings.project_root) / s.image_path if not Path(s.image_path).is_absolute() else Path(s.image_path)
    if not full.exists():
        raise HTTPException(status_code=404, detail="image file missing")
    return FileResponse(str(full))

@router.post("/api/knowledge/search")
def search(req: SearchRequest, db: Session = Depends(get_db)):
    svc = KnowledgeService(db, settings)
    results = svc.retrieve(req.query, req.top_k)
    out = []
    for r in results:
        snip = db.get(Snippet, r.snippet_id) if r.snippet_id is not None else None
        out.append({"snippet_id": r.snippet_id, "title": snip.title if snip else "",
                    "content": r.content, "score": r.score})
    return {"results": out}


# --- Tasks ---

class CreateTaskRequest(BaseModel):
    title: str
    date: str
    time: str | None = None
    recurrence: dict | None = None
    endDate: str | None = None

class UpdateTaskRequest(BaseModel):
    id: int
    title: str | None = None
    time: str | None = None
    date: str | None = None
    recurrence: dict | None = None
    endDate: str | None = None

class IdRequest(BaseModel):
    id: int

class ToggleRequest(BaseModel):
    id: int
    date: str

class InsertRequest(BaseModel):
    id: int
    date: str
    position: int

class ApplyOrderRequest(BaseModel):
    date: str
    orderedIds: list[int]

@router.post("/api/tasks/create")
def tasks_create(req: CreateTaskRequest, db: Session = Depends(get_db)):
    svc = TaskService(db)
    t = svc.create_task(req.title, req.date, req.time, req.recurrence, req.endDate)
    return {"ok": True, "id": t.id, "task": _task_dict(svc, t)}

@router.get("/api/tasks")
def tasks_list(date: str | None = None, db: Session = Depends(get_db)):
    svc = TaskService(db)
    return {"tasks": svc.list_tasks(date)}

@router.post("/api/tasks/update")
def tasks_update(req: UpdateTaskRequest, db: Session = Depends(get_db)):
    svc = TaskService(db)
    t = svc.update_task(req.id, title=req.title, time=req.time, date=req.date, recurrence=req.recurrence, endDate=req.endDate)
    if not t:
        raise HTTPException(status_code=404, detail="not found")
    return {"ok": True, "task": _task_dict(svc, t)}

@router.post("/api/tasks/delete")
def tasks_delete(req: IdRequest, db: Session = Depends(get_db)):
    svc = TaskService(db)
    return {"ok": svc.delete_task(req.id)}

@router.post("/api/tasks/toggle")
def tasks_toggle(req: ToggleRequest, db: Session = Depends(get_db)):
    svc = TaskService(db)
    r = svc.toggle_task(req.id, req.date)
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    return {"ok": True, "task": r}

@router.post("/api/tasks/insert")
def tasks_insert(req: InsertRequest, db: Session = Depends(get_db)):
    svc = TaskService(db)
    r = svc.insert_task(req.id, req.date, req.position)
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    return {"ok": True, "task": r}

@router.post("/api/tasks/apply_order")
def tasks_apply_order(req: ApplyOrderRequest, db: Session = Depends(get_db)):
    svc = TaskService(db)
    r = svc.apply_order(req.date, req.orderedIds)
    return {"ok": True, **r}

class AutoSortRequest(BaseModel):
    date: str
    tasks: list

@router.post("/api/tasks/auto_sort")
def tasks_auto_sort(req: AutoSortRequest, db: Session = Depends(get_db)):
    svc = AgentService(settings)
    result = svc.auto_sort(req.date, req.tasks, db)
    return result

def _task_dict(svc, t):
    from app.services.tasks import _to_dict
    return _to_dict(t)


# --- Knowledge list/delete (for the UI) ---

@router.get("/api/knowledge/list")
def knowledge_list(db: Session = Depends(get_db)):
    rows = db.query(Snippet).order_by(Snippet.created_at.desc()).all()
    return {"snippets": [
        {"id": s.id, "title": s.title, "type": s.type, "category": s.category,
         "url": s.url, "preview": (s.original_content or "")[:200],
         "status": s.status, "image_path": s.image_path}
        for s in rows
    ]}

class UpdateCategoryRequest(BaseModel):
    id: int
    category: str | None = None

@router.post("/api/knowledge/category")
def knowledge_category(req: UpdateCategoryRequest, db: Session = Depends(get_db)):
    db.query(Snippet).filter(Snippet.id == req.id).update({Snippet.category: req.category})
    db.commit()
    return {"ok": True}

@router.get("/api/knowledge/search")
def knowledge_search(q: str, db: Session = Depends(get_db)):
    svc = KnowledgeService(db, settings)
    results = svc.retrieve(q, 5)
    filtered = [r for r in results if r.score > 0.05]
    out = []
    for r in filtered:
        snip = db.get(Snippet, r.snippet_id) if r.snippet_id is not None else None
        out.append({"snippet_id": r.snippet_id, "title": snip.title if snip else "",
                    "content": r.content[:300], "score": round(r.score, 3)})
    return {"results": out}

@router.get("/api/knowledge/by-day")
def knowledge_by_day(date: str, db: Session = Depends(get_db)):
    entries = db.query(DailyLog).filter(
        DailyLog.date == date, DailyLog.entry_type == "snippet_saved"
    ).order_by(DailyLog.id).all()
    snippets = []
    for e in entries:
        # content holds the snippet id (string) after migration; skip old title strings
        if not (e.content or "").isdigit():
            continue
        s = db.get(Snippet, int(e.content))
        if s:
            snippets.append({"id": s.id, "title": s.title, "type": s.type,
                             "category": s.category, "preview": (s.original_content or "")[:200]})
    return {"snippets": snippets}

@router.get("/api/knowledge/{snippet_id}")
def knowledge_detail(snippet_id: int, db: Session = Depends(get_db)):
    s = db.get(Snippet, snippet_id)
    if not s:
        raise HTTPException(status_code=404, detail="snippet not found")
    return {"id": s.id, "type": s.type, "title": s.title, "url": s.url,
            "original_content": s.original_content, "ocr_text": s.ocr_text,
            "category": s.category, "content_format": s.content_format, "image_path": s.image_path,
            "status": s.status, "error": s.error,
            "created_at": s.created_at.isoformat() if s.created_at else None}

class DeleteSnippetRequest(BaseModel):
    id: int

@router.post("/api/knowledge/delete")
def knowledge_delete(req: DeleteSnippetRequest, db: Session = Depends(get_db)):
    svc = KnowledgeService(db, settings)
    svc._delete_snippet_chunks(req.id)
    db.query(KnowledgeChunk).filter(KnowledgeChunk.snippet_id == req.id).delete()
    db.query(Snippet).filter(Snippet.id == req.id).delete()
    db.commit()
    return {"ok": True}


class RenameSnippetRequest(BaseModel):
    id: int
    title: str

@router.post("/api/knowledge/rename")
def knowledge_rename(req: RenameSnippetRequest, db: Session = Depends(get_db)):
    s = db.get(Snippet, req.id)
    if not s:
        raise HTTPException(status_code=404, detail="snippet not found")
    s.title = req.title[:256]
    db.commit()
    return {"ok": True}


class RefreshSnippetRequest(BaseModel):
    id: int

@router.post("/api/knowledge/refresh")
def knowledge_refresh(req: RefreshSnippetRequest, db: Session = Depends(get_db)):
    """Re-fetch a link snippet's URL and overwrite original_content + search chunks.
    Fixes lossy migrated content (overlap duplication, flattened code, old prefix)."""
    from app.services.fetcher import fetch_url
    s = db.get(Snippet, req.id)
    if not s:
        raise HTTPException(status_code=404, detail="snippet not found")
    if s.type != "link" or not s.url:
        raise HTTPException(status_code=400, detail="只有链接类型可以重新抓取")
    fetched = fetch_url(s.url)
    if not fetched.get("ok") or not fetched.get("text"):
        return {"ok": False, "error": fetched.get("error", "抓取失败")}
    text = fetched["text"]
    if len(text.strip()) < 80:
        return {"ok": False, "error": "抓到的正文太短（可能是 JS 渲染页），未更新"}
    s.original_content = text
    s.content_format = fetched.get("content_format", "text")
    # refresh title from the page only if the current one is an auto-fallback
    if fetched.get("title") and (not s.title or s.title.startswith("snippet-")):
        s.title = fetched["title"].strip()[:256]
    svc = KnowledgeService(db, settings)
    chunks = svc.ingest(s.id, text)  # deletes old chunks + re-indexes, commits
    return {"ok": True, "title": s.title, "length": len(text), "chunks": chunks}


# --- Agent (chat) ---

class ChatRequest(BaseModel):
    session_key: str | None = None
    message: str | None = None
    no_session: bool = False
    intent: str = "auto"  # auto / chat (chat = just converse, don't save)
    image_base64: str | None = None
    image_mime: str | None = None

@router.post("/api/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    svc = AgentService(settings)
    msg = req.message or ""
    if req.no_session or not req.session_key:
        result = svc.run_single(msg, db, intent=req.intent,
                                image_base64=req.image_base64, image_mime=req.image_mime)
    else:
        result = svc.run_session(req.session_key, msg, db, intent=req.intent,
                                 image_base64=req.image_base64, image_mime=req.image_mime)
    return {"reply": result["reply"], "actions": result.get("actions", [])}


# --- Daily log (per-day conversation journal) ---

@router.get("/api/daily-log")
def daily_log(date: str, db: Session = Depends(get_db)):
    entries = db.query(DailyLog).filter(DailyLog.date == date).order_by(DailyLog.id).all()
    return {"entries": [{"type": e.entry_type, "category": e.category, "content": e.content} for e in entries]}
