"""Stock gift_shop_items + gift_shop_listings with Amazon candidates per game.

For each game, derive search queries from its title/city/tags/stops, hit Amazon
search (cached on disk), parse product cards, and dump them into Supabase as
gift_shop_items + gift_shop_listings rows. New listings are inserted with
live=false so the admin curates them in mc/giftshop.html before they show
up publicly.

Default mode is WRITE. Pass --dry-run to preview without touching Supabase.

Examples:
    python gift/stock_gift_shop.py
    python gift/stock_gift_shop.py --game oswald
    python gift/stock_gift_shop.py --limit-games 3 --items-per-game 12
    python gift/stock_gift_shop.py --dry-run --limit-games 1

Environment:
    SUPABASE_PUBLISHABLE_KEY or SUPABASE_KEY may override the built-in key.
    The repo-root .env file is loaded automatically when present.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


# ── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://qmaafbncpzrdmqapkkgr.supabase.co"
SUPABASE_KEY_DEFAULT = "sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3"
AMAZON_TAG = "thegamebureau-20"
AMAZON_STORE = "nolanatives-20"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

REPO_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = Path(__file__).resolve().parent / "_cache"

FETCH_TIMEOUT = 12      # seconds per Amazon request
SUPABASE_TIMEOUT = 30   # seconds per Supabase REST call

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


def supabase_key() -> str:
    load_dotenv(REPO_ROOT / ".env")
    return (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("SUPABASE_KEY", "").strip()
        or SUPABASE_KEY_DEFAULT
    )


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
        raise RuntimeError(f"{method} {url} -> HTTP {exc.code}: {detail}") from exc


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
        "live": False,        # admin opts in via mc/giftshop.html
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
            description=f"Surfaced from the Amazon search: {query}.",
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
    for q in queries:
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


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
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
    args = ap.parse_args()

    key = supabase_key()
    games = fetch_games(key, game_id=args.game or "", limit=args.limit_games)
    if not games:
        print("No games found.")
        return 0

    existing_urls = fetch_existing_urls(key)
    write_enabled = not args.dry_run
    user_keywords = unique(
        split_keywords(args.keywords) + ([] if args.no_prompt else prompt_keywords())
    )
    pause_every = 0 if args.no_pause or not write_enabled else max(0, args.pause_every)

    mode = "WRITE" if write_enabled else "DRY RUN"
    print(f"{mode}: stocking {len(games)} game(s).")
    print(f"items/game={args.items_per_game}  queries/game={args.max_queries}  "
          f"delay={args.delay}s  cache={CACHE_DIR}")
    if pause_every:
        print(f"pausing every {pause_every} inserted item(s) — m/a/q at the prompt")
    if user_keywords:
        print("Keywords: " + ", ".join(user_keywords))

    items_in = listings_in = 0
    pause_off = pause_every == 0
    quit_now = False

    for game in games:
        if quit_now:
            break
        gid = str(game.get("id") or "").strip()
        gname = str(game.get("name") or gid).strip()
        if not gid:
            continue
        print(f"\n{gname} [{gid}]")

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
        print("Curate them in mc/giftshop.html and flip the 'Live' checkbox to publish.")
    else:
        print("\nDry run only. Re-run without --dry-run to insert these rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
