"""Agent loop (ported from Tada's agent.mjs). Server-side tool-calling loop:
call maragate /chat/completions with reasoning_effort='none' + tools; execute
returned tool_calls in-process via TaskService/KnowledgeService; feed results
back; loop until a final text answer. Tools run in-process — no HTTP round-trip.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import DailyLog, KnowledgeChunk, Snippet, Task
from app.services.fetcher import RETURN_TEXT_LIMIT, fetch_url, is_url
from app.services.knowledge import KnowledgeService, save_snippet_fast
from app.services.prompts import build_system_prompt
from app.services.tasks import TaskService, _occurs_on, _parse_recurrence, _to_dict
from app.services.tool_defs import TOOL_DEFS

# In-memory session store: session_key (date) -> conversation (with tool history).
# This lets the LLM see prior tool_calls/results so it doesn't re-execute them.
_sessions = {}


def _today_iso():
    return datetime.now().strftime("%Y-%m-%d")  # local date, matches frontend


def _user_msg(text, image_base64=None, image_mime=None):
    """Build a user message: plain string, or a vision content array if an image is attached."""
    t = (text or "")[:2000]
    if image_base64:
        mime = (image_mime or "image/png").lower()
        parts = []
        if t:
            parts.append({"type": "text", "text": t})
        parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_base64}"}})
        return {"role": "user", "content": parts}
    return {"role": "user", "content": t}


def _log_text(text, image_base64=None, image_ref=None):
    """Text to persist in daily_log for a user turn. If image_ref (img:{id}) is set
    (聊/发送 with a pre-saved image), store that + the text so reload can render the image."""
    if image_ref:
        t = (text or "").strip()
        return (image_ref + ("\n" + t if t else ""))[:2000]
    t = (text or "")[:2000]
    return t or ("[图片]" if image_base64 else "")


def execute_tool(name: str, args: dict, db: Session, settings: Settings) -> dict:
    """Dispatch a tool call to the right service. Returns a JSON-serializable dict."""
    try:
        if name == "create_task":
            svc = TaskService(db)
            t = svc.create_task(args.get("title"), args.get("date"), args.get("time"), args.get("recurrence"), args.get("endDate"))
            # dayUntimed: existing untimed tasks on that date (for insert_task)
            all_tasks = db.query(Task).all()
            day_untimed = [{"id": x.id, "title": x.title} for x in sorted([x for x in all_tasks if x.id != t.id and _occurs_on(args["date"], x) and not x.time], key=lambda x: x.order)]
            conflict = None
            if args.get("time") and not args.get("recurrence"):
                for x in all_tasks:
                    if not _parse_recurrence(x.recurrence) and x.start_date == args["date"] and x.time == args["time"] and not x.done:
                        conflict = {"id": x.id, "title": x.title}
                        break
            return {"ok": True, "id": t.id, "task": _to_dict(t), "dayUntimed": day_untimed, "conflict": conflict}

        if name == "list_tasks":
            svc = TaskService(db)
            return {"tasks": svc.list_tasks(args.get("date"))}

        if name == "update_task":
            svc = TaskService(db)
            t = svc.update_task(args["id"], title=args.get("title"), time=args.get("time"), date=args.get("date"), recurrence=args.get("recurrence"), endDate=args.get("endDate"))
            return {"ok": bool(t), "task": _to_dict(t) if t else None}

        if name == "delete_task":
            svc = TaskService(db)
            return {"ok": svc.delete_task(args["id"])}

        if name == "toggle_task":
            svc = TaskService(db)
            r = svc.toggle_task(args["id"], args["date"])
            return {"ok": bool(r), "task": r}

        if name == "insert_task":
            svc = TaskService(db)
            r = svc.insert_task(args["id"], args["date"], args.get("position", 0))
            return {"ok": bool(r), "task": r}

        if name == "apply_order":
            svc = TaskService(db)
            r = svc.apply_order(args["date"], args["orderedIds"])
            return {"ok": True, **r}

        if name == "save_snippet":
            stype = args.get("type") or "text"
            title = args.get("title")
            category = args.get("category")
            content = args.get("content", "")
            url = None
            if stype == "link" and is_url(content):
                url = content
                content = None  # worker fetches async
            snip = save_snippet_fast(db, type=stype, content=content, title=title,
                                     url=url, category=category)
            return {"ok": True, "id": snip.id, "title": snip.title, "type": snip.type,
                    "status": snip.status, "category": snip.category}

        if name == "read_url":
            url = args["url"]
            fetched = fetch_url(url)
            if fetched.get("ok"):
                text = fetched["text"]
                return {"ok": True, "url": url, "title": fetched.get("title", ""),
                        "text": text[:RETURN_TEXT_LIMIT], "length": fetched.get("length", len(text))}
            return {"ok": False, "url": url, "error": fetched.get("error", "抓取失败")}

        if name == "list_snippets":
            rows = db.query(Snippet).order_by(Snippet.created_at.desc()).all()
            return {"snippets": [
                {"id": s.id, "title": s.title, "type": s.type, "category": s.category,
                 "url": s.url, "preview": (s.original_content or "")[:140]}
                for s in rows
            ]}

        if name == "delete_snippet":
            sid = args["id"]
            ksvc = KnowledgeService(db, settings)
            ksvc._delete_snippet_chunks(sid)
            db.query(KnowledgeChunk).filter(KnowledgeChunk.snippet_id == sid).delete()
            db.query(Snippet).filter(Snippet.id == sid).delete()
            db.commit()
            return {"ok": True, "id": sid}

        if name == "search_knowledge":
            ksvc = KnowledgeService(db, settings)
            results = ksvc.retrieve(args["query"], args.get("top_k"))
            out = []
            for r in results:
                snip = db.get(Snippet, r.snippet_id) if r.snippet_id is not None else None
                out.append({"snippet_id": r.snippet_id, "title": snip.title if snip else "",
                            "content": r.content, "score": r.score})
            return {"results": out}

        return {"ok": False, "error": "unknown tool"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class AgentService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def run_session(self, session_key: str, user_message: str, db: Session, max_steps: int = 8,
                    intent: str = "auto", image_base64: str | None = None, image_mime: str | None = None,
                    image_ref: str | None = None) -> dict:
        # Get or create the session conversation (with full tool history)
        conv = _sessions.get(session_key)
        if conv is None:
            conv = self._reconstruct_from_daily_log(session_key, db)
        conv.append(_user_msg(user_message, image_base64, image_mime))

        system = {"role": "system", "content": build_system_prompt({"today": session_key})}
        intent_note = [{"role": "system", "content": "用户这次只想聊天，不要调 save_snippet。"}] if intent == "chat" else []
        full = [system] + intent_note + conv[-30:]
        actions = []
        tool_events = []
        reply = ""

        for _ in range(max_steps):
            msg = self._call_llm(full)
            conv.append(msg)
            full.append(msg)
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                reply = msg.get("content") or ""
                break
            for tc in tool_calls:
                fn = tc.get("function", {})
                tname = fn.get("name", "")
                try:
                    targs = json.loads(fn.get("arguments", "{}"))
                except Exception:
                    targs = {}
                result = execute_tool(tname, targs, db, self.settings)
                actions.append({"tool": tname, "args": targs, "result": result})
                ev = self._make_tool_event(tname, targs, result)
                if ev:
                    tool_events.append(ev)
                tool_msg = {"role": "tool", "tool_call_id": tc.get("id", ""), "content": json.dumps(result, ensure_ascii=False)}
                conv.append(tool_msg)
                full.append(tool_msg)

        _sessions[session_key] = conv

        # Log to daily_log: chat_user → tool events → chat_assistant (in order)
        category = "chat"
        for action in actions:
            t = action.get("tool", "")
            if t in ("create_task", "update_task", "delete_task", "toggle_task", "insert_task", "apply_order"):
                category = "schedule"
            elif t in ("save_snippet", "delete_snippet", "search_knowledge", "read_url"):
                category = "info"
        db.add(DailyLog(date=session_key, entry_type="chat_user", content=_log_text(user_message, image_base64, image_ref), category=category))
        for ev in tool_events:
            db.add(DailyLog(date=session_key, entry_type=ev["type"], content=ev["content"][:200], category=ev["category"]))
        if reply:
            db.add(DailyLog(date=session_key, entry_type="chat_assistant", content=reply[:2000], category=category))
        db.commit()

        return {"reply": reply, "actions": actions}

    def _reconstruct_from_daily_log(self, date: str, db: Session) -> list:
        entries = db.query(DailyLog).filter(DailyLog.date == date).order_by(DailyLog.id).all()
        conv = []
        for e in entries:
            if e.entry_type == "chat_user":
                conv.append({"role": "user", "content": e.content})
            elif e.entry_type == "chat_assistant":
                conv.append({"role": "assistant", "content": e.content})
        return conv

    def run_single(self, user_message, db, max_steps=8, intent="auto", image_base64=None, image_mime=None, image_ref=None):
        """Process a single message without session (no context/history). For desktop pet."""
        system = {"role": "system", "content": build_system_prompt({"today": _today_iso()})}
        intent_note = [{"role": "system", "content": "用户这次只想聊天，不要调 save_snippet。"}] if intent == "chat" else []
        conv = [system] + intent_note + [_user_msg(user_message, image_base64, image_mime)]
        actions = []
        tool_events = []
        reply = ""
        for _ in range(max_steps):
            msg = self._call_llm(conv)
            conv.append(msg)
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                reply = msg.get("content") or ""
                break
            for tc in tool_calls:
                fn = tc.get("function", {})
                tname = fn.get("name", "")
                try:
                    targs = json.loads(fn.get("arguments", "{}"))
                except Exception:
                    targs = {}
                result = execute_tool(tname, targs, db, self.settings)
                actions.append({"tool": tname, "args": targs, "result": result})
                ev = self._make_tool_event(tname, targs, result)
                if ev:
                    tool_events.append(ev)
                tool_msg = {"role": "tool", "tool_call_id": tc.get("id", ""), "content": json.dumps(result, ensure_ascii=False)}
                conv.append(tool_msg)
        # Log to daily_log (still journal it, just no session)
        category = "chat"
        for action in actions:
            t = action.get("tool", "")
            if t in ("create_task", "update_task", "delete_task", "toggle_task", "insert_task", "apply_order"):
                category = "schedule"
            elif t in ("save_snippet", "delete_snippet", "search_knowledge", "read_url"):
                category = "info"
        today = _today_iso()
        db.add(DailyLog(date=today, entry_type="chat_user", content=_log_text(user_message, image_base64, image_ref), category=category))
        for ev in tool_events:
            db.add(DailyLog(date=today, entry_type=ev["type"], content=ev["content"][:200], category=ev["category"]))
        if reply:
            db.add(DailyLog(date=today, entry_type="chat_assistant", content=reply[:2000], category=category))
        db.commit()
        return {"reply": reply, "actions": actions}

    def _make_tool_event(self, tool, args, result):
        """Build a daily_log entry for a tool execution (task/snippet events)."""
        ok = result.get("ok", False) if isinstance(result, dict) else False
        if tool == "create_task" and ok:
            return {"type": "task_created", "content": result.get("task", {}).get("title", ""), "category": "schedule"}
        if tool == "update_task" and ok:
            return {"type": "task_updated", "content": result.get("task", {}).get("title", ""), "category": "schedule"}
        if tool == "delete_task":
            return {"type": "task_deleted", "content": str(args.get("id", "")), "category": "schedule"}
        if tool == "toggle_task" and ok:
            t = result.get("task", {})
            return {"type": "task_toggled", "content": f"{t.get('title', '')} {'done' if t.get('done') else 'undone'}", "category": "schedule"}
        if tool in ("insert_task", "apply_order"):
            return {"type": "task_reordered", "content": str(args.get("date", "")), "category": "schedule"}
        if tool == "save_snippet" and ok:
            return {"type": "snippet_saved", "content": str(result.get("id", "")), "category": "info"}
        if tool == "delete_snippet":
            return {"type": "snippet_deleted", "content": str(args.get("id", "")), "category": "info"}
        if tool == "search_knowledge":
            return {"type": "knowledge_searched", "content": args.get("query", ""), "category": "info"}
        if tool == "read_url":
            return {"type": "url_read", "content": args.get("url", ""), "category": "info"}
        return None

    def auto_sort(self, date, tasks, db):
        """Sort untimed tasks via LLM (separate from chat session — no pollution)."""
        list_str = "\n".join(f"{i+1}. id={t['id']}: {t['title']}" for i, t in enumerate(tasks))
        conv = [
            {"role": "system", "content": "You sort tasks by importance. Return ONLY a JSON array of ids, e.g. [3,1,2]. No other text."},
            {"role": "user", "content": f"Sort these by importance (high to low):\n{list_str}"},
        ]
        payload = {"model": self.settings.openai_model, "reasoning_effort": "none", "messages": conv}
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.settings.openai_api_key}"}
        r = httpx.post(f"{self.settings.openai_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers, timeout=60)
        r.raise_for_status()
        reply = r.json()["choices"][0]["message"]["content"]
        match = re.search(r'\[([\d,\s]+)\]', reply)
        if match:
            ids = [int(x.strip()) for x in match.group(1).split(",") if x.strip().isdigit()]
            TaskService(db).apply_order(date, ids)
            return {"ok": True, "orderedIds": ids}
        return {"ok": False, "error": "could not parse order"}

    def _call_llm(self, conv: list) -> dict:
        payload = {
            "model": self.settings.openai_model,
            "reasoning_effort": "none",
            "messages": conv,
            "tools": TOOL_DEFS,
        }
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.settings.openai_api_key}"}
        r = httpx.post(f"{self.settings.openai_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers, timeout=60)
        r.raise_for_status()
        data = r.json()
        msg = data["choices"][0]["message"]
        # Normalize to a plain dict (content + tool_calls if any)
        out = {"role": "assistant", "content": msg.get("content") or ""}
        if msg.get("tool_calls"):
            out["tool_calls"] = [
                {"id": tc.get("id", ""), "type": "function", "function": {"name": tc["function"]["name"], "arguments": tc["function"].get("arguments", "{}")}}
                for tc in msg["tool_calls"]
            ]
        return out

    def _sanitize(self, messages: list) -> list:
        out = []
        for m in messages:
            if not isinstance(m, dict):
                continue
            role = m.get("role")
            if role == "system":
                continue  # server adds its own
            if role in ("user", "assistant", "tool"):
                item = {"role": role}
                if role != "tool":
                    item["content"] = str(m.get("content", ""))[:2000]
                else:
                    item["content"] = str(m.get("content", ""))[:2000]
                    item["tool_call_id"] = str(m.get("tool_call_id", ""))[:64]
                if role == "assistant" and m.get("tool_calls"):
                    item["tool_calls"] = m["tool_calls"]
                out.append(item)
        return out[-30:]
