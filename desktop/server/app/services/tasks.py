"""Task service — ported from Tada's JS tools.mjs/planner-store to Python/SQL.

Handles the task CRUD + recurrence derivation + per-day completion, operating
on MySQL/SQLite via SQLAlchemy. This is the server-side equivalent of the
client-side tool registry; the agent loop (Phase 3) will call these functions
in-process.
"""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.entities import Task, Completion


def _parse_recurrence(raw):
    if not raw:
        return None
    try:
        r = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None
    if not isinstance(r, dict):
        return None
    freq = r.get("freq")
    if freq not in ("daily", "weekly", "weekdays"):
        return None
    days = None
    if freq == "weekly" and isinstance(r.get("days"), list):
        days = [d for d in r["days"] if isinstance(d, int) and 0 <= d <= 6]
    return {"freq": freq, "days": days}


def _occurs_on(date_iso: str, task: Task) -> bool:
    if date_iso < task.start_date:
        return False
    if task.end_date and date_iso > task.end_date:
        return False
    rec = _parse_recurrence(task.recurrence)
    if not rec:
        return date_iso == task.start_date
    py_dow = datetime.strptime(date_iso, "%Y-%m-%d").weekday()  # Mon=0..Sun=6
    js_dow = (py_dow + 1) % 7  # Sun=0..Sat=6 (match the agent's convention)
    if rec["freq"] == "daily":
        return True
    if rec["freq"] == "weekdays":
        return 1 <= js_dow <= 5
    if rec["freq"] == "weekly":
        return bool(rec["days"]) and js_dow in rec["days"]
    return False


def _type_of(task: Task) -> str:
    if not _parse_recurrence(task.recurrence):
        return "oneoff"
    return "short" if task.end_date else "long"


def _sort_key(d: dict):
    # timed first (by time asc), untimed after (by order)
    return (0 if d["time"] else 1, d["time"] or "", d["order"])


def _to_dict(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "time": t.time,
        "order": t.order,
        "recurrence": _parse_recurrence(t.recurrence),
        "startDate": t.start_date,
        "endDate": t.end_date,
        "type": _type_of(t),
        "done": bool(t.done),
    }


class TaskService:
    def __init__(self, db: Session):
        self.db = db

    def create_task(self, title, date, time=None, recurrence=None, endDate=None):
        # Idempotent: don't duplicate if same title+date+time already exists
        existing = self.db.query(Task).filter(
            Task.title == str(title)[:40],
            Task.start_date == str(date),
            Task.time == (str(time)[:5] if time else None),
        ).first()
        if existing:
            return existing
        task = Task(
            title=str(title)[:40],
            time=str(time)[:5] if time else None,
            order=datetime.utcnow().timestamp(),
            recurrence=json.dumps(recurrence, ensure_ascii=False) if recurrence else None,
            start_date=str(date),
            end_date=str(endDate) if endDate else None,
            done=False,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def list_tasks(self, date=None):
        tasks = self.db.query(Task).all()
        if not date:
            return [_to_dict(t) for t in tasks]
        comps = {c.task_id for c in self.db.query(Completion).filter(Completion.date == date).all()}
        occ = []
        for t in tasks:
            if _occurs_on(date, t):
                d = _to_dict(t)
                d["done"] = (t.id in comps) if _parse_recurrence(t.recurrence) else bool(t.done)
                occ.append(d)
        occ.sort(key=_sort_key)
        return occ

    def update_task(self, id, **fields):
        t = self.db.get(Task, id)
        if not t:
            return None
        if fields.get("title") is not None:
            t.title = str(fields["title"])[:40]
        if "time" in fields:
            v = fields["time"]
            t.time = None if v == "" or v is None else str(v)[:5]
        if fields.get("date") is not None:
            t.start_date = str(fields["date"])
        if "recurrence" in fields:
            t.recurrence = json.dumps(fields["recurrence"], ensure_ascii=False) if fields["recurrence"] else None
        if "endDate" in fields:
            v = fields["endDate"]
            t.end_date = None if v == "" or v is None else str(v)
        self.db.commit()
        self.db.refresh(t)
        return t

    def delete_task(self, id):
        t = self.db.get(Task, id)
        if not t:
            return False
        self.db.query(Completion).filter(Completion.task_id == id).delete()
        self.db.delete(t)
        self.db.commit()
        return True

    def toggle_task(self, id, date):
        t = self.db.get(Task, id)
        if not t:
            return None
        if _parse_recurrence(t.recurrence):
            existing = self.db.query(Completion).filter(Completion.task_id == id, Completion.date == date).first()
            if existing:
                self.db.delete(existing)
                done = False
            else:
                self.db.add(Completion(task_id=id, date=date))
                done = True
            self.db.commit()
            return {"id": id, "title": t.title, "date": date, "done": done}
        t.done = not t.done
        self.db.commit()
        return {"id": id, "title": t.title, "done": t.done}

    def insert_task(self, id, date, position):
        all_tasks = self.db.query(Task).all()
        untimed = sorted([t for t in all_tasks if t.id != id and _occurs_on(date, t) and not t.time], key=lambda t: t.order)
        pos = max(0, min(int(position), len(untimed)))
        if not untimed:
            new_order = 0.0
        elif pos == 0:
            new_order = untimed[0].order - 10
        elif pos >= len(untimed):
            new_order = untimed[-1].order + 10
        else:
            new_order = (untimed[pos - 1].order + untimed[pos].order) / 2
        t = self.db.get(Task, id)
        if not t:
            return None
        t.order = new_order
        self.db.commit()
        return {"id": id, "order": new_order, "position": pos}

    def apply_order(self, date, ordered_ids):
        for i, tid in enumerate(ordered_ids):
            t = self.db.get(Task, int(tid))
            if t:
                t.order = float(i * 10)
        self.db.commit()
        return {"date": date, "orderedIds": ordered_ids}
