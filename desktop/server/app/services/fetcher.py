"""URL fetch + readable-text extraction for the knowledge base.

Used by save_snippet(type=link) to store real article content instead of a bare
URL, and by the read_url tool so the LLM can read/summarize a link without saving
it. SSRF-guarded (blocks private/loopback/link-local targets); HTTP fetched via
httpx; HTML main-text extracted via trafilatura (lazy import, regex fallback).
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
from html import unescape
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; Tada/0.2; knowledge companion)"
MAX_BYTES = 2 * 1024 * 1024  # cap on downloaded body (~2 MB)
TIMEOUT = 15.0
RETURN_TEXT_LIMIT = 4000  # cap text returned into the LLM context (read_url)


def is_url(text: str) -> bool:
    s = (text or "").strip()
    if " " in s or "\n" in s:
        return False
    parsed = urlparse(s)
    return parsed.scheme in ("http", "https") and bool(parsed.hostname)


def _is_safe_url(url: str) -> bool:
    """Only http(s), and the resolved host must not be a private/loopback/
    link-local/reserved/multicast address (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for _family, _ty, _proto, _canon, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def fetch_url(url: str) -> dict:
    """Fetch a URL and extract readable text + title.

    Source-specific handlers run first (GitHub raw markdown, docsify raw markdown);
    both fall back to the generic trafilatura path. Returns
    {"ok", "url", "title", "text", "length", "content_format", "error"?}.
    content_format is "markdown" for raw-markdown sources, "text" otherwise — the
    frontend uses it to decide whether to render as markdown.
    """
    if not is_url(url):
        return {"ok": False, "url": url, "title": "", "text": "", "length": 0, "content_format": "text", "error": "不是有效的链接"}
    if not _is_safe_url(url):
        return {"ok": False, "url": url, "title": "", "text": "", "length": 0, "content_format": "text", "error": "不支持抓取这个地址（仅公开网址）"}

    # GitHub: blob URL → raw markdown (pure URL transform, no HTML fetch needed)
    gh = _fetch_github_raw(url)
    if gh is not None:
        return gh

    # Fetch the page once (shared by docsify detection + generic extraction)
    page = _http_get(url)
    if not page["ok"]:
        return {"ok": False, "url": url, "title": "", "text": "", "length": 0, "content_format": "text", "error": page["error"]}
    content_type = page["content_type"]
    body = page["body"]
    charset = page["charset"]

    if "text/html" not in content_type and "application/xhtml" not in content_type:
        # Plain text / non-HTML payload: keep as-is.
        text = body.decode("utf-8", errors="ignore")
        return {"ok": True, "url": url, "title": _first_line(text), "text": text, "length": len(text), "content_format": "text"}

    html = _decode_body(body, charset)

    # docsify SPA: the # route maps to a markdown file — derive and fetch it
    ds = _fetch_docsify_raw(url, html)
    if ds is not None:
        return ds

    # Generic: trafilatura main-text extraction
    title, text = _extract_html(html)
    if not text.strip():
        return {"ok": False, "url": url, "title": title, "text": "", "length": 0, "content_format": "text",
                "error": "抓到了页面，但没解析出正文（可能是 JS 渲染页或空内容）"}
    return {"ok": True, "url": url, "title": title, "text": text, "length": len(text), "content_format": "text"}


def _http_get(url: str) -> dict:
    """GET a URL; return {"ok","body","content_type","charset"} or {"ok":False,"error"}."""
    try:
        with httpx.Client(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.5,*/*;q=0.1"},
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return {"ok": True, "body": resp.content[:MAX_BYTES],
                    "content_type": resp.headers.get("content-type", "").lower(),
                    "charset": resp.charset_encoding}
    except httpx.HTTPStatusError as exc:
        return {"ok": False, "error": f"网页返回 {exc.response.status_code}"}
    except httpx.RequestError as exc:
        return {"ok": False, "error": f"抓取失败：{type(exc).__name__}"}


def _fetch_github_raw(url: str) -> dict | None:
    """github.com/{owner}/{repo}/blob/{ref}/{path} → raw.githubusercontent.com markdown.
    Returns a result dict, or None to fall through to the generic path."""
    parsed = urlparse(url)
    if parsed.hostname != "github.com" or "/blob/" not in parsed.path:
        return None
    raw_url = "https://raw.githubusercontent.com" + parsed.path.replace("/blob/", "/", 1)
    page = _http_get(raw_url)
    if not page["ok"]:
        return None  # private repo / not found → fall through to generic on the original URL
    text = page["body"].decode("utf-8", errors="ignore")
    if not text.strip():
        return None
    fallback = parsed.path.rsplit("/", 1)[-1]
    return {"ok": True, "url": url, "title": _markdown_title(text, fallback),
            "text": text, "length": len(text), "content_format": "markdown"}


def _fetch_docsify_raw(url: str, html: str) -> dict | None:
    """docsify SPA: the # route maps to a markdown file. Derive it and fetch.
    Returns a result dict, or None to fall through (generic → empty shell → honest fail)."""
    if not _looks_like_docsify(html):
        return None
    parsed = urlparse(url)
    frag = parsed.fragment
    if not frag:
        return None
    # fragment like "/./chapter8/xxx?id=..." → markdown path "chapter8/xxx"
    md_path = frag.split("?", 1)[0].lstrip("/")
    if md_path.startswith("./"):
        md_path = md_path[2:]
    md_path = md_path.lstrip("/")
    if not md_path:
        return None
    base_path = parsed.path if parsed.path.endswith("/") else parsed.path + "/"
    md_url = f"{parsed.scheme}://{parsed.netloc}{base_path}{md_path}.md"
    page = _http_get(md_url)
    if not page["ok"]:
        return None  # basePath misconfigured etc. → fall through
    text = page["body"].decode("utf-8", errors="ignore")
    if not text.strip():
        return None
    return {"ok": True, "url": url, "title": _markdown_title(text, md_path.rsplit("/", 1)[-1]),
            "text": text, "length": len(text), "content_format": "markdown"}


def _looks_like_docsify(html: str) -> bool:
    head = (html or "")[:30000].lower()
    return "docsify" in head and ('id="app"' in head or "id='app'" in head)


def _markdown_title(text: str, fallback: str = "") -> str:
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith("# ") and len(s) > 2:
            return s[2:].strip()[:120]
    return _first_line(text) or fallback[:120]


def _decode_body(body: bytes, charset: str | None) -> str:
    for enc in (charset, "utf-8", "gb18030", "latin-1"):
        if not enc:
            continue
        try:
            return body.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return body.decode("utf-8", errors="ignore")


def _extract_html(html: str) -> tuple[str, str]:
    # Prefer trafilatura (best main-text extraction, handles Chinese well).
    # Lazy import — fall back to a regex strip if trafilatura isn't installed.
    try:
        import trafilatura
    except ImportError:
        return _extract_html_fallback(html)

    try:
        text = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
        title = ""
        try:
            md = trafilatura.extract_metadata(html)
            title = getattr(md, "title", "") or ""
        except Exception:
            pass
        text = text.strip()
        if text:
            return (title or "").strip(), text
    except Exception as exc:
        logger.warning("trafilatura extraction failed, using fallback: %s", exc)
    return _extract_html_fallback(html)


def _extract_html_fallback(html: str) -> tuple[str, str]:
    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if m:
        title = _strip_tags(m.group(1)).strip()[:120]
    cleaned = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    text = unescape(_strip_tags(cleaned))
    text = re.sub(r"\s+", " ", text).strip()
    return title, text


def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s)


def _first_line(text: str) -> str:
    for line in (text or "").splitlines():
        line = line.strip()
        if line:
            return line[:120]
    return ""
