from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.services.agent import AgentService
from app.services.knowledge import KnowledgeService
from app.services.tasks import TaskService
from app.services.vector_store import ChromaKnowledgeStore
from app.models.entities import DailyLog, KnowledgeChunk

router = APIRouter()
settings = get_settings()


# --- RAG ---

class EmbedRequest(BaseModel):
    text: str

class IngestRequest(BaseModel):
    source: str
    content: str

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
    svc = KnowledgeService(db, settings)
    count = svc.ingest(req.source, req.content)
    return {"chunks": count}

@router.post("/api/knowledge/search")
def search(req: SearchRequest, db: Session = Depends(get_db)):
    svc = KnowledgeService(db, settings)
    results = svc.retrieve(req.query, req.top_k)
    return {"results": [{"source": r.source, "content": r.content, "score": r.score} for r in results]}


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
    rows = db.query(KnowledgeChunk.source).distinct().all()
    snippets = []
    for (source,) in rows:
        first = db.query(KnowledgeChunk).filter(KnowledgeChunk.source == source).order_by(KnowledgeChunk.source_index).first()
        snippets.append({"source": source, "content": (first.content[:500] if first else ""), "category": first.category if first else None})
    return {"snippets": snippets}

class UpdateCategoryRequest(BaseModel):
    source: str
    category: str | None = None

@router.post("/api/knowledge/category")
def knowledge_category(req: UpdateCategoryRequest, db: Session = Depends(get_db)):
    db.query(KnowledgeChunk).filter(KnowledgeChunk.source == req.source).update({KnowledgeChunk.category: req.category})
    db.commit()
    return {"ok": True}

@router.get("/api/knowledge/search")
def knowledge_search(q: str, db: Session = Depends(get_db)):
    svc = KnowledgeService(db, settings)
    results = svc.retrieve(q, 5)
    filtered = [r for r in results if r.score > 0.05]
    return {"results": [{"source": r.source, "content": r.content[:300], "score": round(r.score, 3)} for r in filtered]}

@router.get("/api/knowledge/by-day")
def knowledge_by_day(date: str, db: Session = Depends(get_db)):
    entries = db.query(DailyLog).filter(DailyLog.date == date, DailyLog.entry_type == "snippet_saved").order_by(DailyLog.id).all()
    snippets = []
    for e in entries:
        first = db.query(KnowledgeChunk).filter(KnowledgeChunk.source == e.content).order_by(KnowledgeChunk.source_index).first()
        if first:
            snippets.append({"source": e.content, "content": first.content[:500], "category": first.category})
    return {"snippets": snippets}

class DeleteSnippetRequest(BaseModel):
    source: str

@router.post("/api/knowledge/delete")
def knowledge_delete(req: DeleteSnippetRequest, db: Session = Depends(get_db)):
    svc = KnowledgeService(db, settings)
    svc._delete_vector_source(req.source)
    db.query(KnowledgeChunk).filter(KnowledgeChunk.source == req.source).delete()
    db.commit()
    return {"ok": True}


class RenameSnippetRequest(BaseModel):
    old_source: str
    new_source: str

@router.post("/api/knowledge/rename")
def knowledge_rename(req: RenameSnippetRequest, db: Session = Depends(get_db)):
    rows = db.query(KnowledgeChunk).filter(KnowledgeChunk.source == req.old_source).all()
    if not rows:
        raise HTTPException(status_code=404, detail="snippet not found")
    svc = KnowledgeService(db, settings)
    try:
        svc._delete_vector_source(req.old_source)
    except Exception:
        pass
    for row in rows:
        row.source = req.new_source[:256]
    db.commit()
    try:
        svc._index_vector_chunks(rows)
    except Exception:
        pass
    return {"ok": True}


# --- Agent (chat) ---

class ChatRequest(BaseModel):
    session_key: str | None = None
    message: str
    no_session: bool = False

@router.post("/api/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    svc = AgentService(settings)
    if req.no_session or not req.session_key:
        result = svc.run_single(req.message, db)
    else:
        result = svc.run_session(req.session_key, req.message, db)
    return {"reply": result["reply"], "actions": result.get("actions", [])}


# --- Daily log (per-day conversation journal) ---

@router.get("/api/daily-log")
def daily_log(date: str, db: Session = Depends(get_db)):
    entries = db.query(DailyLog).filter(DailyLog.date == date).order_by(DailyLog.id).all()
    return {"entries": [{"type": e.entry_type, "category": e.category, "content": e.content} for e in entries]}
