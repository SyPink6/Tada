"""Vision helper: call gpt-6-luna (via maragate) to describe + OCR an image in one call.

Returns {"description": str, "text": str} — description (semantic) and verbatim
transcribed text (for keyword search), kept separate. Emoji/decorative symbols are
stripped from the transcription. Mirrors the httpx pattern of agent._call_llm.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

_PROMPT = (
    '请只返回一个 JSON，不要 markdown 代码块、不要其他文字。格式：'
    '{"description":"用一段话描述图片内容（是什么图、关键元素、用途）",'
    '"text":"逐字转录图中所有可见文字，只保留文字（汉字、字母、数字、标点），'
    '不要 emoji、不要表情符号、不要装饰图形。没有文字则为空字符串"}'
)
_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
# Emoji + dingbats + symbols + pictographs (broad strip; keeps CJK/letters/digits/punct).
_EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF"
    "\U0001F1E6-\U0001F1FF\U0000FE00-\U0000FE0F\U00002190-\U000021FF\U00002B05-\U00002B07]+",
    re.UNICODE,
)


def _strip_emoji(s: str) -> str:
    return _EMOJI_RE.sub("", s or "").replace("‍", "").strip()


def describe_image(image_path: str, settings: Settings) -> dict:
    """Return {"description": str, "text": str}. Raises on API/IO error."""
    root = Path(settings.project_root)
    p = Path(image_path)
    full = p if p.is_absolute() else root / p
    data = full.read_bytes()
    mime = _MIME.get(full.suffix.lower(), "image/png")
    b64 = base64.b64encode(data).decode()
    data_url = f"data:{mime};base64,{b64}"

    payload = {
        "model": settings.openai_model,
        "reasoning_effort": "none",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }],
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"}
    r = httpx.post(
        f"{settings.openai_base_url.rstrip('/')}/chat/completions",
        json=payload, headers=headers, timeout=90,
    )
    r.raise_for_status()
    msg = r.json()["choices"][0]["message"]
    raw = (msg.get("content") or "").strip()
    return _parse(raw)


def _parse(raw: str) -> dict:
    """Parse the model's JSON reply; fall back to splitting markers / whole-as-description."""
    # strip markdown code fences if present
    body = raw
    if body.startswith("```"):
        body = re.sub(r"^```[a-zA-Z]*\s*", "", body)
        body = re.sub(r"\s*```$", "", body).strip()
    try:
        obj = json.loads(body)
        desc = str(obj.get("description") or "").strip()
        text = _strip_emoji(str(obj.get("text") or "").strip())
        return {"description": desc, "text": text}
    except Exception:
        pass
    # fallback: try markers 描述：/文字：
    desc = ""
    text = ""
    m_d = re.search(r"描述[：:]\s*(.*?)(?=文字[：:]|$)", raw, re.DOTALL)
    m_t = re.search(r"文字[：:]\s*(.*)$", raw, re.DOTALL)
    if m_d:
        desc = m_d.group(1).strip()
    if m_t:
        text = _strip_emoji(m_t.group(1).strip())
    if not desc and not text:
        desc = raw.strip()
    return {"description": desc, "text": text}
