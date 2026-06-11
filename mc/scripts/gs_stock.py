"""Stock gift_shop_items + gift_shop_listings with Amazon candidates per game.

For each game, derive search queries from its title/city/tags/stops, hit Amazon
search (cached on disk), parse product cards, and dump them into Supabase as
gift_shop_items + gift_shop_listings rows. New listings are inserted with
live=false so the admin curates them in mc/gs-shop.html before they show
up publicly.

Run with no switches for an interactive menu. Flags still work when you want
to launch a specific mode directly.

Examples:
    python mc/scripts/gs_stock.py
    python mc/scripts/gs_stock.py --game oswald
    python mc/scripts/gs_stock.py --limit-games 3 --items-per-game 12
    python mc/scripts/gs_stock.py --dry-run --limit-games 1
    python mc/scripts/gs_stock.py --menu
    python mc/scripts/gs_stock.py --serve

Environment:
    Write mode requires SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
    because gift shop tables are protected by Supabase RLS.
    SUPABASE_PUBLISHABLE_KEY or SUPABASE_KEY may override the built-in
    publishable key used for read-only access.
    The repo-root .env file is loaded automatically when present.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any, Iterable, Optional


# ── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://qmaafbncpzrdmqapkkgr.supabase.co"
SUPABASE_KEY_DEFAULT = "sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3"
AMAZON_TAG = "thegamebureau-20"
AMAZON_STORE = "nolanatives-20"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = Path(__file__).resolve().parent / "_cache"

FETCH_TIMEOUT = 12      # seconds per Amazon request
SUPABASE_TIMEOUT = 30   # seconds per Supabase REST call
LOCAL_SERVER_HOST = "127.0.0.1"
LOCAL_SERVER_PORT = 8765
RUN_LOCK = Lock()

BOT_PHRASES = (
    "enter the characters you see below",
    "type the characters you see in this image",
    "to discuss automated access",
    "/errors/validatecaptcha",
    "robot check",
    "bm-verify",
    "/_imperva/",
)
RESULT_MARKER = 'data-component-type="s-search-result"'


# ── .env + auth ──────────────────────────────────────────────────────────────

def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$", line, re.I)
        if not m:
            continue
        k, v = m.group(1), m.group(2).strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        os.environ.setdefault(k, v)


def publishable_supabase_key() -> str:
    load_dotenv(REPO_ROOT / ".env")
    return (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("SUPABASE_KEY", "").strip()
        or SUPABASE_KEY_DEFAULT
    )


def service_supabase_key() -> str:
    load_dotenv(REPO_ROOT / ".env")
    return (
        os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )


def supabase_key(*, write: bool) -> str:
    service_key = service_supabase_key()
    if write:
        if service_key:
            return service_key
        raise RuntimeError(
            "Write mode requires SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) "
            "in the repo-root .env or environment because gift shop tables are "
            "protected by Supabase row-level security."
        )
    return service_key or publishable_supabase_key()


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _supabase_request(url: str, key: str, method: str, payload: Any) -> Any:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        hint = ""
        if exc.code in {401, 403} and method != "GET" and "row-level security" in detail.lower():
            hint = (
                " Write mode must use SUPABASE_SERVICE_KEY or "
                "SUPABASE_SERVICE_ROLE_KEY."
            )
        raise RuntimeError(f"{method} {url} -> HTTP {exc.code}: {detail}{hint}") from exc


def rest_url(table: str, params: dict[str, str] | None = None) -> str:
    base = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    return base + (("?" + urllib.parse.urlencode(params)) if params else "")


# ── Supabase reads/writes ────────────────────────────────────────────────────

def fetch_games(key: str, game_id: str = "", limit: int = 0) -> list[dict[str, Any]]:
    params = {"select": "*", "order": "updated_at.desc.nullslast"}
    if game_id:
        params["id"] = f"eq.{game_id}"
    if limit:
        params["limit"] = str(limit)
    rows = _supabase_request(rest_url("games", params), key, "GET", None)
    return rows if isinstance(rows, list) else []


def fetch_existing_urls(key: str) -> set[str]:
    rows = _supabase_request(rest_url("gift_shop_items", {"select": "url"}), key, "GET", None)
    urls: set[str] = set()
    for row in rows if isinstance(rows, list) else []:
        n = normalize_amazon_url(str(row.get("url") or ""))
        if n:
            urls.add(n)
    return urls


def insert_item(key: str, c: "Candidate") -> dict[str, Any] | None:
    payload = {
        "kind": "amazon_link",
        "title": c.title,
        "url": c.url,
        "image_url": c.image_url or None,
        "image_focus": "50% 50%",
        "price_display": c.price_display or None,
        "description": c.description or None,
        "archived": False,
    }
    rows = _supabase_request(rest_url("gift_shop_items"), key, "POST", payload)
    return rows[0] if isinstance(rows, list) and rows else None


def insert_listing(key: str, item_id: Any, game_id: str, position: int) -> dict[str, Any] | None:
    payload = {
        "item_id": item_id,
        "game_id": game_id,
        "position": position,
        "archived": False,
    }
    rows = _supabase_request(rest_url("gift_shop_listings"), key, "POST", payload)
    return rows[0] if isinstance(rows, list) and rows else None


# ── Amazon URLs ──────────────────────────────────────────────────────────────

def affiliate_url(asin: str) -> str:
    p = {"tag": AMAZON_TAG, "ascsubtag": AMAZON_STORE, "store": AMAZON_STORE}
    return f"https://www.amazon.com/dp/{asin}?" + urllib.parse.urlencode(p)


def normalize_amazon_url(url: str) -> str:
    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)", url)
    return affiliate_url(m.group(1)) if m else url.strip()


def amazon_search_url(query: str) -> str:
    p = {"k": query, "tag": AMAZON_TAG, "ascsubtag": AMAZON_STORE, "store": AMAZON_STORE}
    return "https://www.amazon.com/s?" + urllib.parse.urlencode(p)


# ── Amazon search (cache + retry + bot-check) ────────────────────────────────

def cache_path(query: str) -> Path:
    return CACHE_DIR / f"{hashlib.sha1(query.encode('utf-8')).hexdigest()}.html"


def looks_unusable(page: str) -> bool:
    """True if the page is bot-mitigation, captcha, or otherwise empty."""
    head = page[:8000].lower()
    if any(p in head for p in BOT_PHRASES):
        return True
    return RESULT_MARKER not in page


def fetch_search(query: str, force_refetch: bool = False) -> tuple[str, str]:
    """Return (html, source). source ∈ {'cache', 'live', 'bot-check', ''}.

    'cache' / 'live' = usable; 'bot-check' = junk page (won't parse); '' = network fail.
    """
    cf = cache_path(query)
    if not force_refetch and cf.exists():
        try:
            cached = cf.read_text(encoding="utf-8")
        except OSError:
            cached = ""
        if cached:
            return (cached, "bot-check") if looks_unusable(cached) else (cached, "cache")

    req = urllib.request.Request(
        amazon_search_url(query),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    page = ""
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                page = resp.read().decode("utf-8", errors="replace")
            break
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 2:
                print(f"  ! fetch {query!r}: {exc}", file=sys.stderr)
                return "", ""
            time.sleep(1.0)

    if looks_unusable(page):
        return page, "bot-check"

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cf.write_text(page, encoding="utf-8")
    except OSError:
        pass
    return page, "live"


def fetch_detail(asin: str, force_refetch: bool = False) -> str:
    """Fetch one Amazon product *detail* page (cached). '' on failure/bot-check.

    The search-results card has no real blurb, so to fill the description we pull
    the detail page for the handful of candidates we actually show.
    """
    asin = (asin or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{10}", asin):
        return ""
    cf = CACHE_DIR / f"detail-{asin}.html"
    if not force_refetch and cf.exists():
        try:
            cached = cf.read_text(encoding="utf-8")
        except OSError:
            cached = ""
        if cached:
            head = cached[:8000].lower()
            return "" if any(p in head for p in BOT_PHRASES) else cached

    req = urllib.request.Request(
        f"https://www.amazon.com/dp/{asin}",
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    page = ""
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                page = resp.read().decode("utf-8", errors="replace")
            break
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                return ""
            time.sleep(1.0)

    if any(p in page[:8000].lower() for p in BOT_PHRASES):
        return ""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cf.write_text(page, encoding="utf-8")
    except OSError:
        pass
    return page


def trim_description(text: str, limit: int = 600) -> str:
    """Strip tags, collapse whitespace, and cap to a clean ~limit-char blurb."""
    t = re.sub(r"\s+", " ", strip_tags(text or "")).strip()
    if len(t) > limit:
        t = t[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.") + "…"
    return t


def extract_amazon_description(page: str) -> str:
    """Best-effort real product description from an Amazon detail page, tried in
    order of quality: book synopsis → "About this item" bullets → legacy product
    description → meta description. Returns '' if none look usable."""
    if not page:
        return ""
    # 1. Book synopsis.
    m = re.search(r'id=["\']bookDescription_feature_div["\']([\s\S]{0,12000})', page, re.I)
    if m:
        ns = re.search(r"<noscript>([\s\S]*?)</noscript>", m.group(1), re.I)
        d = re.sub(r"\s*Read more\s*$", "", trim_description(ns.group(1) if ns else m.group(1))).strip()
        if len(d) >= 40:
            return d
    # 2. "About this item" feature bullets.
    m = re.search(r'id=["\']feature-bullets["\']([\s\S]{0,8000}?)</ul>', page, re.I)
    if m:
        bullets = re.findall(
            r'<span[^>]*class=["\'][^"\']*a-list-item[^"\']*["\'][^>]*>([\s\S]*?)</span>',
            m.group(1), re.I,
        )
        parts = [strip_tags(b) for b in bullets]
        parts = [p for p in parts if p and len(p) > 2 and "see more" not in p.lower()]
        d = trim_description(" · ".join(parts))
        if len(d) >= 40:
            return d
    # 3. Legacy product description block.
    m = re.search(r'id=["\']productDescription["\']([\s\S]{0,12000}?)</div>', page, re.I)
    if m:
        d = trim_description(m.group(1))
        if len(d) >= 40:
            return d
    # 4. Meta description (drop Amazon's boilerplate prefix).
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', page, re.I)
    if m:
        d = re.sub(r"^Amazon\.com\s*:?\s*", "", trim_description(m.group(1))).strip()
        if len(d) >= 40:
            return d
    return ""


# ── AI-generated funny descriptions (optional, opt-in via env) ───────────────
# When ANTHROPIC_API_KEY is set and the `anthropic` package is installed,
# every scraped product title gets a 1–2 sentence punchy blurb written by
# Claude Haiku. Cached on disk so re-scrapes don't re-bill. Without the key
# the function returns None and the description field stays empty for an
# admin to fill in via gs-shop.html.
_AI_DESC_CACHE_DIR = Path(__file__).resolve().parent / ".cache" / "ai_descriptions"
_AI_CLIENT = None
_AI_DISABLED = False

def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:120]

def ai_describe(title: str) -> Optional[str]:
    """Generate a funny 1–2 sentence product blurb. Returns None if disabled."""
    global _AI_CLIENT, _AI_DISABLED
    title = (title or "").strip()
    if not title or _AI_DISABLED:
        return None
    if not os.environ.get("ANTHROPIC_API_KEY"):
        _AI_DISABLED = True
        return None

    # Disk cache keyed on title slug — same title = same blurb across runs.
    cache_key = _slug(title)
    if cache_key:
        try:
            _AI_DESC_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached = (_AI_DESC_CACHE_DIR / f"{cache_key}.txt")
            if cached.exists():
                return cached.read_text(encoding="utf-8").strip() or None
        except OSError:
            pass

    if _AI_CLIENT is None:
        try:
            from anthropic import Anthropic
            _AI_CLIENT = Anthropic()
        except Exception:
            _AI_DISABLED = True
            return None

    prompt = (
        "Write a single punchy product blurb (1–2 sentences, max 28 words) for "
        f"this item: \"{title}\". Voice: confident, slightly snarky, like a "
        "Conde Nast Traveler editor with a sense of humor. No emojis, no "
        "exclamation points, no bullet points, no marketing fluff like "
        "\"perfect for\" or \"essential\". Lead with the joke, not the product. "
        "Output only the blurb itself — no quotes, no prefix."
    )
    try:
        msg = _AI_CLIENT.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}],
        )
        text = (msg.content[0].text or "").strip().strip('"').strip()
    except Exception:
        return None

    if not text:
        return None
    if cache_key:
        try:
            (_AI_DESC_CACHE_DIR / f"{cache_key}.txt").write_text(text, encoding="utf-8")
        except OSError:
            pass
    return text


# ── Search result parsing ────────────────────────────────────────────────────

@dataclass
class Candidate:
    title: str
    url: str
    asin: str = ""
    image_url: str = ""
    price_display: str = ""
    description: str = ""
    query: str = ""


def strip_tags(text: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def attr(fragment: str, name: str) -> str:
    m = re.search(rf'{re.escape(name)}=["\']([^"\']+)["\']', fragment, re.I)
    return html.unescape(m.group(1)) if m else ""


def parse_results(page: str, query: str) -> list[Candidate]:
    cards = re.split(
        r'(?=<div[^>]+data-component-type=["\']s-search-result["\'])',
        page, flags=re.I,
    )[1:]
    out: list[Candidate] = []
    seen: set[str] = set()
    for card in cards:
        asin = attr(card[:1200], "data-asin")
        if not asin or asin in seen:
            continue
        seen.add(asin)

        # Title: prefer the h2 aria-label, fall back to h2 inner text.
        h2 = re.search(r"<h2\b[^>]*>", card, flags=re.I)
        title = attr(h2.group(0), "aria-label") if h2 else ""
        if not title:
            block = re.search(r"<h2[\s\S]*?</h2>", card, flags=re.I)
            title = strip_tags(block.group(0)) if block else ""
        if not title or len(title) < 4:
            continue

        img = re.search(r'<img[^>]+class=["\'][^"\']*s-image[^"\']*["\'][^>]*>', card, flags=re.I)
        image_url = attr(img.group(0), "src") if img else ""

        price_block = re.search(r'<span[^>]+class=["\']a-offscreen["\'][^>]*>[\s\S]*?</span>', card, flags=re.I)
        price = strip_tags(price_block.group(0)) if price_block else ""
        if price in {"$0.00", "$0"}:
            price = ""

        out.append(Candidate(
            title=title,
            url=affiliate_url(asin),
            asin=asin,
            image_url=image_url,
            price_display=price,
            # Don't expose the internal search query to public visitors.
            # Description is filled in by ai_describe() below when an
            # ANTHROPIC_API_KEY is available; otherwise stays empty and
            # an admin writes one manually in gs-shop.html.
            description=ai_describe(title) or "",
            query=query,
        ))
    return out


# ── Game-driven query generation ─────────────────────────────────────────────

def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def clean_piece(value: Any) -> str:
    t = re.sub(r"[^A-Za-z0-9 &:'-]+", " ", safe_text(value))
    return re.sub(r"\s+", " ", t).strip()


def unique(seq: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in seq:
        key = item.lower().strip()
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out


def derive_queries(game: dict[str, Any], user_keywords: list[str], cap: int) -> list[str]:
    """Build a query list ordered by relevance: user keywords → game-specific →
    stops → tags → generic. Capped at `cap`."""
    queries: list[str] = []

    # 1. User-supplied keywords always go first.
    for kw in user_keywords:
        c = clean_piece(kw)
        if c:
            queries.extend([c, f"{c} book"])

    # 2. Game-level seeds.
    name = clean_piece(game.get("name"))
    city = clean_piece(game.get("city"))
    if city:
        queries.extend([
            f"{city} travel guide",
            f"{city} history book",
            f"{city} souvenir book",
        ])
    if name and city and name.lower() != city.lower():
        queries.append(f"{name} {city}")

    # 3. Per-stop seeds.
    nodes = game.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict) or node.get("type") != "stop":
                continue
            stop_title = clean_piece(node.get("title"))
            if stop_title and len(stop_title) > 2:
                queries.append(f"{stop_title} book")
                if city:
                    queries.append(f"{stop_title} {city}")

    # 4. Tag seeds.
    raw_tags = game.get("tags")
    tag_values: list[Any] = raw_tags if isinstance(raw_tags, list) else []
    for tag in tag_values[:5]:
        t = clean_piece(tag)
        if t:
            queries.append(f"{t} book")

    # 5. Generic fallback so very thin games still surface something.
    queries.extend(["travel field notebook", "compass keychain", "souvenir book"])

    return unique(queries)[:cap]


# ── Pipeline ─────────────────────────────────────────────────────────────────

def find_candidates(
    game: dict[str, Any],
    max_queries: int,
    delay: float,
    user_keywords: list[str],
    force_refetch: bool,
) -> list[Candidate]:
    queries = derive_queries(game, user_keywords, max_queries)
    seen_urls: set[str] = set()
    out: list[Candidate] = []
    total_queries = len(queries)
    for index, q in enumerate(queries, start=1):
        print(f"  > query {index}/{total_queries}: {q}", flush=True)
        t0 = time.monotonic()
        page, source = fetch_search(q, force_refetch=force_refetch)
        if source == "bot-check":
            print(f"  ~ skip (bot-check): {q}", file=sys.stderr)
            continue
        if not page:
            continue
        try:
            hits = parse_results(page, q)
        except Exception as exc:
            print(f"  ! parse {q!r}: {exc}", file=sys.stderr)
            continue
        print(f"  · {source:<5} {len(hits):>2} hit(s) in {time.monotonic() - t0:4.1f}s  {q}")
        for c in hits:
            n = normalize_amazon_url(c.url)
            if n in seen_urls:
                continue
            seen_urls.add(n)
            out.append(c)
        if source == "live":
            time.sleep(delay)
    return out


# ── CLI helpers ──────────────────────────────────────────────────────────────

def split_keywords(value: str) -> list[str]:
    return [p.strip() for p in re.split(r"[,;\n]+", value or "") if p.strip()]


def prompt_keywords() -> list[str]:
    if not sys.stdin.isatty():
        return []
    print("\nOptional Amazon keywords to prioritize (comma-separated, blank to skip):")
    return split_keywords(input("> ").strip())


def prompt_continue(n_inserted: int) -> str:
    if not sys.stdin.isatty():
        return "all"
    print(f"\n--- paused after {n_inserted} item(s) inserted ---")
    print("  [m] 3 more   [a] run to the end without pausing   [q] quit and keep what's in")
    while True:
        ch = input("> ").strip().lower()
        if ch in ("m", "more", ""):
            return "more"
        if ch in ("a", "all"):
            return "all"
        if ch in ("q", "quit", "exit"):
            return "quit"
        print("  please type m, a, or q")


# ── Main + local server ──────────────────────────────────────────────────────

def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--menu", action="store_true", help="Show an interactive menu instead of running immediately.")
    ap.add_argument("--game", help="Only stock one game id.")
    ap.add_argument("--keywords", default="", help="Comma-separated keywords to prioritize.")
    ap.add_argument("--no-prompt", action="store_true", help="Skip the interactive keyword prompt.")
    ap.add_argument("--limit-games", type=int, default=0)
    ap.add_argument("--items-per-game", type=int, default=12)
    ap.add_argument("--max-queries", type=int, default=10)
    ap.add_argument("--delay", type=float, default=0.6, help="Seconds between live Amazon requests.")
    ap.add_argument("--pause-every", type=int, default=3,
                    help="Pause after every N inserted items (write mode). 0 to disable.")
    ap.add_argument("--no-pause", action="store_true", help="Never pause; insert everything.")
    ap.add_argument("--force-refetch", action="store_true", help="Bypass the on-disk Amazon search cache.")
    ap.add_argument("--dry-run", action="store_true", help="Preview without inserting into Supabase.")
    ap.add_argument("--serve", action="store_true",
                    help="Run a local HTTP endpoint for the Mission Control suggest-items button.")
    ap.add_argument("--host", default=LOCAL_SERVER_HOST,
                    help="Host for --serve mode. Default: 127.0.0.1")
    ap.add_argument("--port", type=int, default=LOCAL_SERVER_PORT,
                    help="Port for --serve mode. Default: 8765")
    return ap


def build_default_args() -> argparse.Namespace:
    return build_arg_parser().parse_args([])


def prompt_line(label: str, default: str = "") -> str:
    prompt = f"{label}"
    if default != "":
        prompt += f" [{default}]"
    prompt += ": "
    try:
        value = input(prompt)
    except (EOFError, KeyboardInterrupt):
        raise SystemExit("\nCancelled.")
    value = value.strip()
    return value if value else str(default)


def prompt_choice(label: str, choices: set[str], default: str = "") -> str:
    normalized_default = str(default or "").strip().lower()
    while True:
        value = prompt_line(label, normalized_default).lower()
        if value in choices:
            return value
        print("Please choose one of: " + ", ".join(sorted(choices)))


def prompt_int_value(label: str, default: int, minimum: int = 0) -> int:
    while True:
        raw = prompt_line(label, str(default))
        try:
            value = int(raw)
        except ValueError:
            print("Please enter a whole number.")
            continue
        if value < minimum:
            print(f"Please enter a value >= {minimum}.")
            continue
        return value


def prompt_float_value(label: str, default: float, minimum: float = 0.0) -> float:
    while True:
        raw = prompt_line(label, str(default))
        try:
            value = float(raw)
        except ValueError:
            print("Please enter a number.")
            continue
        if value < minimum:
            print(f"Please enter a value >= {minimum}.")
            continue
        return value


def prompt_yes_no(label: str, default: bool = False) -> bool:
    default_token = "y" if default else "n"
    while True:
        value = prompt_line(f"{label} (y/n)", default_token).lower()
        if value in {"y", "yes"}:
            return True
        if value in {"n", "no"}:
            return False
        print("Please answer y or n.")


def prompt_required_text(label: str) -> str:
    while True:
        value = prompt_line(label, "")
        if value:
            return value
        print("This field is required.")


def build_interactive_args() -> argparse.Namespace | None:
    defaults = build_default_args()

    print("\nGift Shop Suggester")
    print("0. Stop")
    print("1. Stock all games")
    print("2. Stock one game")
    print("3. Dry run all games")
    print("4. Dry run one game")
    print("5. Start local suggest-items server")
    print("Q. Quit")
    print("Press Ctrl+C anytime during a run to stop immediately.")

    choice = prompt_choice("Choose an option", {"0", "1", "2", "3", "4", "5", "q"}, "1")
    if choice in {"0", "q"}:
        return None

    if choice == "5":
        return argparse.Namespace(
            menu=False,
            game=defaults.game,
            keywords=defaults.keywords,
            no_prompt=True,
            limit_games=defaults.limit_games,
            items_per_game=defaults.items_per_game,
            max_queries=defaults.max_queries,
            delay=defaults.delay,
            pause_every=defaults.pause_every,
            no_pause=True,
            force_refetch=defaults.force_refetch,
            dry_run=False,
            serve=True,
            host=defaults.host,
            port=defaults.port,
        )

    dry_run = choice in {"3", "4"}
    single_game = choice in {"2", "4"}

    game_id = prompt_required_text("Game id") if single_game else ""
    limit_games = 0 if single_game else prompt_int_value(
        "Limit number of games (0 = all)",
        defaults.limit_games,
        0,
    )
    keywords = prompt_line("Keywords to prioritize (comma-separated, blank to skip)", defaults.keywords)
    items_per_game = prompt_int_value("Items per game", defaults.items_per_game, 1)
    max_queries = prompt_int_value("Queries per game", defaults.max_queries, 1)
    delay = prompt_float_value("Seconds between live Amazon requests", defaults.delay, 0.0)
    force_refetch = prompt_yes_no("Bypass cached Amazon search pages", defaults.force_refetch)

    pause_every = 0
    no_pause = True
    if not dry_run:
        pause_every = prompt_int_value(
            "Pause every N inserted items (0 = never pause)",
            defaults.pause_every,
            0,
        )
        no_pause = pause_every == 0

    return argparse.Namespace(
        menu=False,
        game=game_id,
        keywords=keywords,
        no_prompt=True,
        limit_games=limit_games,
        items_per_game=items_per_game,
        max_queries=max_queries,
        delay=delay,
        pause_every=pause_every,
        no_pause=no_pause,
        force_refetch=force_refetch,
        dry_run=dry_run,
        serve=False,
        host=defaults.host,
        port=defaults.port,
    )


def run_stocking(args: argparse.Namespace) -> int:
    args.game = str(args.game or "").strip()
    args.keywords = str(args.keywords or "")
    args.limit_games = max(0, int(args.limit_games or 0))
    args.items_per_game = max(1, int(args.items_per_game or 1))
    args.max_queries = max(1, int(args.max_queries or 1))
    args.delay = max(0.0, float(args.delay or 0.0))
    args.pause_every = max(0, int(args.pause_every or 0))
    args.no_prompt = bool(args.no_prompt)
    args.no_pause = bool(args.no_pause)
    args.force_refetch = bool(args.force_refetch)
    args.dry_run = bool(args.dry_run)

    write_enabled = not args.dry_run
    key = supabase_key(write=write_enabled)
    games = fetch_games(key, game_id=args.game or "", limit=args.limit_games)
    if not games:
        print("No games found.")
        return 0

    existing_urls = fetch_existing_urls(key)
    user_keywords = unique(
        split_keywords(args.keywords) + ([] if args.no_prompt else prompt_keywords())
    )
    pause_every = 0 if args.no_pause or not write_enabled else max(0, args.pause_every)

    mode = "WRITE" if write_enabled else "DRY RUN"
    print(f"{mode}: stocking {len(games)} game(s).")
    print(f"items/game={args.items_per_game}  queries/game={args.max_queries}  "
          f"delay={args.delay}s  cache={CACHE_DIR}")
    print("Press Ctrl+C to stop the current run.")
    if pause_every:
        print(f"pausing every {pause_every} inserted item(s) — m/a/q at the prompt")
    if user_keywords:
        print("Keywords: " + ", ".join(user_keywords))

    items_in = listings_in = 0
    pause_off = pause_every == 0
    quit_now = False

    total_games = len(games)
    for game_index, game in enumerate(games, start=1):
        if quit_now:
            break
        gid = str(game.get("id") or "").strip()
        gname = str(game.get("name") or gid).strip()
        if not gid:
            continue
        print(f"\nGame {game_index}/{total_games}: {gname} [{gid}]", flush=True)

        candidates = find_candidates(
            game, args.max_queries, args.delay, user_keywords, args.force_refetch,
        )

        selected: list[Candidate] = []
        for c in candidates:
            n = normalize_amazon_url(c.url)
            if n in existing_urls:
                continue
            selected.append(c)
            existing_urls.add(n)
            if len(selected) >= args.items_per_game:
                break

        if not selected:
            print("  no new candidates")
            continue

        for pos, c in enumerate(selected):
            print(f"  + {c.title[:90]} ({c.price_display or 'price n/a'})")
            print(f"    {c.url}")
            if not write_enabled:
                continue
            item = insert_item(key, c)
            if not item or not item.get("id"):
                print("    ! insert item returned no id", file=sys.stderr)
                continue
            items_in += 1
            listing = insert_listing(key, item["id"], gid, pos)
            if listing:
                listings_in += 1

            if not pause_off and pause_every and items_in % pause_every == 0:
                choice = prompt_continue(items_in)
                if choice == "all":
                    pause_off = True
                    print("  continuing without further pauses.")
                elif choice == "quit":
                    print("  quit requested — keeping items already inserted.")
                    quit_now = True
                    break

        if quit_now:
            break

    if write_enabled:
        print(f"\nInserted {items_in} item(s) and {listings_in} listing(s).")
        print("Curate them in mc/gs-shop.html and flip the 'Live' checkbox to publish.")
    else:
        print("\nDry run only. Re-run without --dry-run to insert these rows.")
    return 0


def coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off", ""}:
            return False
    return default


def coerce_int(value: Any, default: int, minimum: int = 0) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, result)


def coerce_float(value: Any, default: float, minimum: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, result)


def build_request_args(payload: dict[str, Any] | None = None) -> argparse.Namespace:
    payload = payload if isinstance(payload, dict) else {}
    defaults = build_default_args()
    requested_game = str(payload.get("game") or "").strip()
    return argparse.Namespace(
        menu=False,
        game=requested_game or defaults.game,
        keywords=str(payload.get("keywords") or defaults.keywords),
        no_prompt=True,
        limit_games=coerce_int(payload.get("limit_games"), defaults.limit_games, 0),
        items_per_game=coerce_int(payload.get("items_per_game"), defaults.items_per_game, 1),
        max_queries=coerce_int(payload.get("max_queries"), defaults.max_queries, 1),
        delay=coerce_float(payload.get("delay"), defaults.delay, 0.0),
        pause_every=0,
        no_pause=True,
        force_refetch=coerce_bool(payload.get("force_refetch"), defaults.force_refetch),
        dry_run=coerce_bool(payload.get("dry_run"), defaults.dry_run),
        serve=False,
        host=defaults.host,
        port=defaults.port,
    )


def run_stocking_capture(args: argparse.Namespace) -> tuple[int, str]:
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
        exit_code = run_stocking(args)
    stdout_text = stdout_buffer.getvalue()
    stderr_text = stderr_buffer.getvalue()
    if stdout_text and stderr_text and not stdout_text.endswith("\n"):
        stdout_text += "\n"
    return exit_code, stdout_text + stderr_text


def run_search_only(payload: dict[str, Any]) -> dict[str, Any]:
    """Search Amazon for candidates and return them as JSON. No Supabase writes.

    Powers the gs-shop.html SUGGEST lightbox: the admin reviews candidates
    and ticks the ones to insert, then the front-end inserts them directly
    via the standard gift_shop_items REST endpoint (no listings — the admin
    attaches shops afterward).
    """
    payload = payload if isinstance(payload, dict) else {}
    defaults = build_default_args()

    game_id = str(payload.get("game") or "").strip()
    keywords_raw = str(payload.get("keywords") or "")
    max_queries = coerce_int(payload.get("max_queries"), defaults.max_queries, 1)
    items_cap = coerce_int(payload.get("items_per_game"), 20, 1)
    delay = coerce_float(payload.get("delay"), defaults.delay, 0.0)
    force_refetch = coerce_bool(payload.get("force_refetch"), defaults.force_refetch)

    user_keywords = unique(split_keywords(keywords_raw))

    read_key = supabase_key(write=False)
    existing_urls = fetch_existing_urls(read_key)

    if game_id:
        games_to_search: list[dict[str, Any]] = fetch_games(read_key, game_id=game_id, limit=1)
        if not games_to_search:
            return {
                "ok": False,
                "error": f"No game found with id {game_id!r}.",
                "candidates": [],
            }
    else:
        games_to_search = [{}]

    all_candidates: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for game in games_to_search:
        if len(all_candidates) >= items_cap:
            break
        candidates = find_candidates(
            game, max_queries, delay, user_keywords, force_refetch,
        )
        for c in candidates:
            n = normalize_amazon_url(c.url)
            if n in seen_urls:
                continue
            seen_urls.add(n)
            all_candidates.append({
                "title": c.title,
                "url": c.url,
                "asin": c.asin,
                "image_url": c.image_url,
                "price_display": c.price_display,
                "description": c.description,
                "query": c.query,
                "already_in_db": n in existing_urls,
            })
            if len(all_candidates) >= items_cap:
                break

    # The search card has no real blurb, so fetch the detail page for the final
    # (shown) candidates and pull a real description. Bounded by items_cap and
    # cached on disk; only overrides when we find something usable.
    for c in all_candidates:
        asin = str(c.get("asin") or "")
        if not asin:
            continue
        better = extract_amazon_description(fetch_detail(asin, force_refetch))
        if better:
            c["description"] = better
        if delay:
            time.sleep(delay)

    return {
        "ok": True,
        "game": game_id,
        "keywords": user_keywords,
        "candidates": all_candidates,
        "summary": f"Found {len(all_candidates)} candidate(s).",
    }


# ── Bookshop.org book lookup ─────────────────────────────────────────────────
# The browser can't query Bookshop (CORS) and Bookshop blocks naive bots, but a
# request with real browser headers gets the (server-rendered) product page,
# which carries an og:title, og:image, JSON-LD price, and a <meta book:isbn>.
# Open Library is used only to turn a topic into candidate ISBNs — Bookshop is
# the source of truth: we try each candidate against bookshop.org/a/<aff>/<isbn>
# and keep the first that resolves to a real product (so wrong-edition ISBNs are
# skipped automatically), reading title/author/cover/price from THAT page.

BOOKSHOP_AFFILIATE_ID = "87073"
BOOKSHOP_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def bookshop_affiliate_url(isbn: str) -> str:
    return f"https://bookshop.org/a/{BOOKSHOP_AFFILIATE_ID}/{isbn}"


def _meta_content(page: str, key: str) -> str:
    """Pull a <meta property|name="key" content="..."> value (either attr order)."""
    for pat in (
        r'<meta[^>]+(?:property|name)=["\']' + re.escape(key) + r'["\'][^>]+content=["\']([^"\']*)["\']',
        r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + re.escape(key) + r'["\']',
    ):
        m = re.search(pat, page, re.I)
        if m:
            return html.unescape(m.group(1)).strip()
    return ""


def _jsonld_nodes(page: str) -> list[Any]:
    out: list[Any] = []
    for block in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page, re.S | re.I
    ):
        try:
            out.append(json.loads(block.strip()))
        except Exception:
            continue
    return out


def _find_book_node(nodes: Iterable[Any]) -> Optional[dict[str, Any]]:
    def walk(node: Any) -> Optional[dict[str, Any]]:
        if isinstance(node, dict):
            types = node.get("@type")
            types = types if isinstance(types, list) else [types]
            if any(str(t).lower() in ("book", "product") for t in types):
                return node
            for value in node.values():
                hit = walk(value)
                if hit:
                    return hit
        elif isinstance(node, list):
            for value in node:
                hit = walk(value)
                if hit:
                    return hit
        return None
    for n in nodes:
        hit = walk(n)
        if hit:
            return hit
    return None


def _author_names(author: Any) -> list[str]:
    names: list[str] = []
    items = author if isinstance(author, list) else [author]
    for a in items:
        if isinstance(a, dict) and a.get("name"):
            names.append(str(a["name"]).strip())
        elif isinstance(a, str) and a.strip():
            names.append(a.strip())
    return names


def _offer_price(offers: Any) -> Optional[float]:
    items = offers if isinstance(offers, list) else [offers]
    for o in items:
        if not isinstance(o, dict):
            continue
        for field in ("price", "lowPrice", "highPrice"):
            raw = o.get(field)
            if raw not in (None, ""):
                try:
                    return float(str(raw).replace("$", "").replace(",", ""))
                except ValueError:
                    continue
    return None


def parse_bookshop_product(page: str, requested_isbn: str) -> Optional[dict[str, Any]]:
    """Return {title, author, isbn, url, image_url, price_display} or None if the
    page isn't a real product (a soft-404 SPA shell lacks the book:isbn meta)."""
    page_isbn = _meta_content(page, "book:isbn")
    title = _meta_content(page, "og:title")
    image = _meta_content(page, "og:image")
    price: Optional[float] = None
    authors: list[str] = []

    node = _find_book_node(_jsonld_nodes(page))
    if node:
        title = title or str(node.get("name") or "")
        authors = _author_names(node.get("author"))
        price = _offer_price(node.get("offers"))
        if not image:
            img = node.get("image")
            image = (img[0] if isinstance(img, list) and img else img) if img else ""
        if not page_isbn:
            page_isbn = re.sub(r"[^0-9Xx]", "", str(node.get("isbn") or ""))

    # A real product page echoes its own ISBN; a not-found shell does not.
    if not page_isbn or not title:
        return None

    # Real synopsis: JSON-LD description, else the og:description meta.
    description = ""
    if node and node.get("description"):
        description = str(node.get("description"))
    if not description:
        description = _meta_content(page, "og:description")
    description = trim_description(description)

    final_isbn = page_isbn or requested_isbn
    return {
        "title": title.strip(),
        "author": ", ".join(authors[:2]),
        "isbn": final_isbn,
        "url": bookshop_affiliate_url(final_isbn),
        "image_url": image or f"https://images-us.bookshop.org/ingram/{final_isbn}.jpg",
        "price_display": (f"${price:.2f}" if price is not None else None),
        "description": description,
    }


def bookshop_product(isbn: str) -> Optional[dict[str, Any]]:
    """Fetch + parse one Bookshop product by ISBN. Cached on disk (hit + miss)."""
    isbn = re.sub(r"[^0-9Xx]", "", str(isbn))
    if len(isbn) not in (10, 13):
        return None
    hit = CACHE_DIR / f"bookshop-{isbn}.json"
    miss = CACHE_DIR / f"bookshop-{isbn}.miss"
    if hit.exists():
        try:
            return json.loads(hit.read_text(encoding="utf-8"))
        except Exception:
            pass
    if miss.exists():
        return None

    req = urllib.request.Request(bookshop_affiliate_url(isbn), headers=BOOKSHOP_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            page = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 410):
            _write_quietly(miss, "")
        return None
    except (urllib.error.URLError, TimeoutError):
        return None

    product = parse_bookshop_product(page, isbn)
    if not product:
        _write_quietly(miss, "")
        return None
    _write_quietly(hit, json.dumps(product, ensure_ascii=False))
    return product


def _write_quietly(path: Path, text: str) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    except OSError:
        pass


def openlibrary_candidates(query: str, limit: int) -> list[dict[str, Any]]:
    url = "https://openlibrary.org/search.json?" + urllib.parse.urlencode({
        "q": query,
        "limit": str(limit),
        "fields": "title,author_name,isbn,first_publish_year",
    })
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    return data.get("docs", []) or []


def search_bookshop_books(query: str, limit: int = 12, isbn_tries: int = 4,
                          delay: float = 0.25) -> list[dict[str, Any]]:
    """Topic -> Open Library candidate ISBNs -> first ISBN that is a real Bookshop
    product. Returns Bookshop-authoritative items (with price)."""
    docs = openlibrary_candidates(query, max(limit * 2, limit + 6))
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for doc in docs:
        if len(results) >= limit:
            break
        isbns = [re.sub(r"[^0-9Xx]", "", str(x)) for x in (doc.get("isbn") or [])]
        isbns = [x for x in isbns if len(x) in (10, 13)]
        isbns.sort(key=lambda x: 0 if len(x) == 13 else 1)  # prefer ISBN-13
        found = None
        for isbn in isbns[:isbn_tries]:
            if isbn in seen:
                continue
            product = bookshop_product(isbn)
            if product:
                found = product
                break
            time.sleep(delay)
        if found and found["isbn"] not in seen:
            seen.add(found["isbn"])
            # Backfill author from Open Library if Bookshop's JSON-LD lacked it.
            if not found.get("author") and doc.get("author_name"):
                found["author"] = ", ".join(list(doc["author_name"])[:2])
            results.append(found)
    return results


def run_books_search(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get("query") or payload.get("keywords") or "").strip()
    if not query:
        return {"ok": False, "error": "Enter a topic or keywords."}
    limit = coerce_int(payload.get("limit"), 12, 1)
    try:
        candidates = search_bookshop_books(query, limit=limit)
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "error": str(error), "logs": traceback.format_exc()}
    return {"ok": True, "query": query, "candidates": candidates, "count": len(candidates)}


def run_combined_search(payload: dict[str, Any]) -> dict[str, Any]:
    """One search across BOTH sources. Bookshop books are preferred, so they are
    listed first; Amazon gear follows. Every candidate carries a 'source' tag
    ('bookshop' | 'amazon') so the UI can label and group them. Powers the merged
    Find-Products lightbox in gs-shop.html."""
    payload = payload if isinstance(payload, dict) else {}
    query = str(payload.get("keywords") or payload.get("query") or "").strip()

    warnings: list[str] = []

    # 1) Bookshop (preferred) — only when there's a query to search by topic.
    books: list[dict[str, Any]] = []
    if query:
        book_limit = coerce_int(payload.get("book_limit"), 8, 1)
        try:
            for b in search_bookshop_books(query, limit=book_limit):
                item = dict(b)
                item["source"] = "bookshop"
                if not item.get("description"):
                    item["description"] = item.get("author") or ""
                books.append(item)
        except Exception as error:  # noqa: BLE001
            warnings.append(f"Bookshop search failed: {error}")

    # 2) Amazon gear (reuses the existing suggester pipeline).
    amazon: list[dict[str, Any]] = []
    amazon_res = run_search_only(payload)
    if amazon_res.get("ok"):
        for a in amazon_res.get("candidates", []):
            item = dict(a)
            item["source"] = "amazon"
            amazon.append(item)
    elif amazon_res.get("error"):
        warnings.append(f"Amazon search: {amazon_res['error']}")

    candidates = books + amazon  # Bookshop first = preferred
    return {
        "ok": True,
        "query": query,
        "candidates": candidates,
        "counts": {"bookshop": len(books), "amazon": len(amazon)},
        "warnings": warnings,
        "summary": f"{len(books)} book(s) from Bookshop · {len(amazon)} from Amazon.",
    }


class StockGiftShopHandler(BaseHTTPRequestHandler):
    server_version = "TGBStockGiftShop/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send_json(204, {})

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._send_json(200, {
                "ok": True,
                "command": "python mc/scripts/gs_stock.py --serve",
                "endpoints": ["/run-stock-gift-shop", "/search-candidates", "/search-books", "/search-all"],
            })
            return
        self._send_json(404, {"ok": False, "error": "Not found."})

    def _read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length") or "0")
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""
        if not raw_body:
            return {}
        return json.loads(raw_body.decode("utf-8"))

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path == "/run-stock-gift-shop":
            self._handle_run_stocking()
            return
        if path == "/search-candidates":
            self._handle_search_candidates()
            return
        if path == "/search-books":
            self._handle_search_books()
            return
        if path == "/search-all":
            self._handle_search_all()
            return
        self._send_json(404, {"ok": False, "error": "Not found."})

    def _handle_run_stocking(self) -> None:
        if not RUN_LOCK.acquire(blocking=False):
            self._send_json(409, {"ok": False, "error": "A gs_stock run is already in progress."})
            return
        try:
            payload = self._read_json_body()
            args = build_request_args(payload)
            exit_code, logs = run_stocking_capture(args)
            target = args.game or "all games"
            self._send_json(200, {
                "ok": exit_code == 0,
                "exit_code": exit_code,
                "game": args.game or "",
                "summary": f"Suggest items finished for {target}.",
                "logs": logs
            })
        except Exception as error:
            self._send_json(500, {
                "ok": False,
                "error": str(error),
                "logs": traceback.format_exc()
            })
        finally:
            RUN_LOCK.release()

    def _handle_search_candidates(self) -> None:
        if not RUN_LOCK.acquire(blocking=False):
            self._send_json(409, {"ok": False, "error": "A search is already in progress."})
            return
        try:
            payload = self._read_json_body()
            result = run_search_only(payload)
            status = 200 if result.get("ok") else 400
            self._send_json(status, result)
        except Exception as error:
            self._send_json(500, {
                "ok": False,
                "error": str(error),
                "logs": traceback.format_exc()
            })
        finally:
            RUN_LOCK.release()

    def _handle_search_books(self) -> None:
        if not RUN_LOCK.acquire(blocking=False):
            self._send_json(409, {"ok": False, "error": "A search is already in progress."})
            return
        try:
            payload = self._read_json_body()
            result = run_books_search(payload)
            status = 200 if result.get("ok") else 400
            self._send_json(status, result)
        except Exception as error:
            self._send_json(500, {
                "ok": False,
                "error": str(error),
                "logs": traceback.format_exc()
            })
        finally:
            RUN_LOCK.release()

    def _handle_search_all(self) -> None:
        if not RUN_LOCK.acquire(blocking=False):
            self._send_json(409, {"ok": False, "error": "A search is already in progress."})
            return
        try:
            payload = self._read_json_body()
            result = run_combined_search(payload)
            status = 200 if result.get("ok") else 400
            self._send_json(status, result)
        except Exception as error:
            self._send_json(500, {
                "ok": False,
                "error": str(error),
                "logs": traceback.format_exc()
            })
        finally:
            RUN_LOCK.release()


def serve(args: argparse.Namespace) -> int:
    host = str(args.host or LOCAL_SERVER_HOST).strip() or LOCAL_SERVER_HOST
    port = coerce_int(args.port, LOCAL_SERVER_PORT, 1)
    server = ThreadingHTTPServer((host, port), StockGiftShopHandler)
    print(f"Serving gs_stock on http://{host}:{port}")
    print("Mission Control endpoints:")
    print("  POST /search-candidates   (preview-only, powers the SUGGEST lightbox)")
    print("  POST /run-stock-gift-shop (auto-stock; used by CLI/menu callers)")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local suggester server.")
    finally:
        server.server_close()
    return 0


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    if args.menu or (len(sys.argv) == 1 and sys.stdin.isatty()):
        interactive_args = build_interactive_args()
        if interactive_args is None:
            print("Cancelled.")
            return 0
        args = interactive_args
    if args.serve:
        return serve(args)
    try:
        return run_stocking(args)
    except KeyboardInterrupt:
        print("\nStopped.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
