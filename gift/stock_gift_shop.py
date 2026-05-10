"""Stock game gift shops with Amazon product ideas.

This script looks at rows in public.games, derives Amazon searches from each
game's title/tags/body/stops, scrapes Amazon search result pages for product
cards, and inserts rows into public.gift_shop_items + public.gift_shop_listings.

Default mode is a dry run. Add --write to insert records.

Examples:
    python gift/stock_gift_shop.py
    python gift/stock_gift_shop.py --write --limit-games 5 --items-per-game 4
    python gift/stock_gift_shop.py --write --game oswald --items-per-game 6

Environment:
    Uses the Supabase publishable/anon key, matching the browser tools.
    SUPABASE_PUBLISHABLE_KEY or SUPABASE_KEY may override the built-in key.
    The repo-root .env file is loaded automatically when present.
"""

from __future__ import annotations

import argparse
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
from typing import Any


SUPABASE_URL = "https://qmaafbncpzrdmqapkkgr.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3"
AMAZON_TRACKING_ID = "thegamebureau-20"
AMAZON_STORE_ID = "nolanatives-20"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

REPO_ROOT = Path(__file__).resolve().parents[1]


THEME_SEARCHES = [
    (("jfk", "oswald", "assassin", "conspiracy", "diary"), [
        "Lee Harvey Oswald New Orleans book",
        "JFK assassination book New Orleans",
        "Jim Garrison On the Trail of the Assassins",
        "classified file folder set",
    ]),
    (("murder", "crime", "axeman", "horror", "ghost"), [
        "New Orleans true crime book",
        "Axeman of New Orleans book",
        "detective field notebook",
        "murder mystery evidence bag kit",
    ]),
    (("jazz", "music", "festival", "fest"), [
        "New Orleans jazz history book",
        "New Orleans Jazz Fest book",
        "jazz music notebook",
        "saxophone bookmark",
    ]),
    (("passport", "cbd", "food", "restaurant", "cocktail", "gumbo", "beignet"), [
        "New Orleans cookbook",
        "New Orleans cocktail book",
        "Cafe Du Monde beignet mix",
        "New Orleans hot sauce sampler",
    ]),
    (("football", "fans", "takeover", "saints", "packers", "carolina", "tampa", "green bay"), [
        "NFL trivia book",
        "football tailgate cookbook",
        "football travel journal",
        "stadium bucket list book",
    ]),
    (("walking", "tour", "scavenger", "adventure", "city"), [
        "New Orleans walking tour book",
        "New Orleans travel guide",
        "travel journal passport notebook",
        "compass keychain",
    ]),
]

GENERIC_SEARCHES = [
    "New Orleans history book",
    "New Orleans travel guide",
    "New Orleans souvenir book",
    "travel field notebook",
]

STOP_KEYWORDS = {
    "lafayette": "Lafayette Square New Orleans history",
    "gallier": "Gallier Hall New Orleans book",
    "federal reserve": "Federal Reserve money book",
    "lincoln": "Lincoln Memorial book",
    "hamilton": "Hamilton musical book",
    "armstrong": "Louis Armstrong New Orleans book",
    "superdome": "New Orleans Superdome book",
    "bourbon": "Bourbon Street New Orleans book",
    "french quarter": "French Quarter New Orleans history book",
    "jazz": "New Orleans jazz history book",
    "oswald": "Lee Harvey Oswald New Orleans book",
    "kennedy": "JFK assassination book",
    "axeman": "Axeman of New Orleans book",
}


@dataclass
class Candidate:
    title: str
    url: str
    image_url: str = ""
    price_display: str = ""
    description: str = ""
    asin: str = ""
    query: str = ""
    score: int = 0


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$", line, re.I)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        os.environ.setdefault(key, value)


def supabase_key() -> str:
    load_dotenv(REPO_ROOT / ".env")
    return (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("SUPABASE_KEY", "").strip()
        or SUPABASE_PUBLISHABLE_KEY
    )


def request_json(url: str, key: str, method: str = "GET", payload: Any = None) -> Any:
    data = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code}: {detail}") from exc


def rest_url(table: str, params: dict[str, str] | None = None) -> str:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return url


def fetch_games(key: str, game_id: str = "", limit: int = 0) -> list[dict[str, Any]]:
    params = {
        "select": "*",
        "order": "updated_at.desc.nullslast",
    }
    if game_id:
        params["id"] = f"eq.{game_id}"
    if limit:
        params["limit"] = str(limit)
    rows = request_json(rest_url("games", params), key)
    return rows if isinstance(rows, list) else []


def fetch_existing_item_urls(key: str) -> set[str]:
    rows = request_json(rest_url("gift_shop_items", {"select": "url"}), key)
    urls = set()
    for row in rows if isinstance(rows, list) else []:
        normalized = normalize_amazon_url(str(row.get("url") or ""))
        if normalized:
            urls.add(normalized)
    return urls


def normalize_amazon_url(url: str) -> str:
    match = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)", url)
    if not match:
        return url.strip()
    return affiliate_product_url(match.group(1))


def affiliate_product_url(asin: str) -> str:
    params = {
        "tag": AMAZON_TRACKING_ID,
        "ascsubtag": AMAZON_STORE_ID,
        "store": AMAZON_STORE_ID,
    }
    return f"https://www.amazon.com/dp/{asin}?" + urllib.parse.urlencode(params)


def amazon_search_url(query: str) -> str:
    params = {
        "k": query,
        "tag": AMAZON_TRACKING_ID,
        "ascsubtag": AMAZON_STORE_ID,
        "store": AMAZON_STORE_ID,
    }
    return "https://www.amazon.com/s?" + urllib.parse.urlencode(params)


def fetch_amazon_search(query: str) -> str:
    req = urllib.request.Request(
        amazon_search_url(query),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=35) as resp:
        return resp.read().decode("utf-8", errors="replace")


def strip_tags(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def parse_attr(fragment: str, name: str) -> str:
    match = re.search(rf'{re.escape(name)}=["\']([^"\']+)["\']', fragment, flags=re.I)
    return html.unescape(match.group(1)) if match else ""


def parse_amazon_results(page_html: str, query: str) -> list[Candidate]:
    parts = re.split(
        r'(?=<div[^>]+data-component-type=["\']s-search-result["\'])',
        page_html,
        flags=re.I,
    )
    cards = [part for part in parts[1:] if "data-asin" in part[:1200]]
    candidates: list[Candidate] = []
    seen_asins: set[str] = set()

    for card in cards:
        card = card.split('data-component-type="s-search-result"', 2)[0] if card.count('data-component-type="s-search-result"') > 1 else card
        asin = parse_attr(card, "data-asin")
        if not asin or asin in seen_asins:
            continue
        seen_asins.add(asin)

        title = parse_attr_from_first(card, "h2", "aria-label")
        if not title:
            title_match = re.search(
                r'<h2[\s\S]*?</h2>|<span[^>]+class=["\'][^"\']*a-size-(?:medium|base)[^"\']*["\'][^>]*>[\s\S]*?</span>',
                card,
                flags=re.I,
            )
            title = strip_tags(title_match.group(0)) if title_match else ""
        if not title or len(title) < 4:
            continue

        image_match = re.search(r'<img[^>]+class=["\'][^"\']*s-image[^"\']*["\'][^>]*>', card, flags=re.I)
        image_url = parse_attr(image_match.group(0), "src") if image_match else ""

        price_match = re.search(r'<span[^>]+class=["\']a-offscreen["\'][^>]*>[\s\S]*?</span>', card, flags=re.I)
        price = strip_tags(price_match.group(0)) if price_match else ""
        if price in {"$0.00", "$0"}:
            price = ""

        if is_sponsored_or_bad_result(card, title):
            continue

        candidates.append(
            Candidate(
                title=title,
                url=affiliate_product_url(asin),
                image_url=image_url,
                price_display=price,
                description=f"Picked for this game from the Amazon search: {query}.",
                asin=asin,
                query=query,
            )
        )
    return candidates


def parse_attr_from_first(fragment: str, tag_name: str, attr_name: str) -> str:
    match = re.search(rf"<{tag_name}\b[^>]*>", fragment, flags=re.I)
    return parse_attr(match.group(0), attr_name) if match else ""


def is_sponsored_or_bad_result(card: str, title: str) -> bool:
    lowered = f"{card} {title}".lower()
    if "s-sponsored-label" in lowered:
        return True
    if any(token in lowered for token in ("kindle edition", "audible audiobook")):
        return False
    bad_phrases = ("shop on amazon", "need help", "results for")
    return any(phrase in lowered for phrase in bad_phrases)


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def game_words(game: dict[str, Any]) -> str:
    parts = [
        safe_text(game.get("id")),
        safe_text(game.get("name")),
        safe_text(game.get("city")),
        safe_text(game.get("tagline")),
        safe_text(game.get("body")),
        safe_text(game.get("tags")),
        safe_text(game.get("guide_name")),
        safe_text(game.get("builder_notes")),
    ]
    nodes = game.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if node.get("type") == "stop":
                parts.append(safe_text(node.get("title")))
            parts.append(safe_text(node.get("body")))
    return " ".join(parts).lower()


def derive_searches(game: dict[str, Any], max_queries: int, user_keywords: list[str] | None = None) -> list[str]:
    text = game_words(game)
    searches: list[str] = []
    user_keywords = user_keywords or []

    for keyword in user_keywords:
        keyword = clean_search_piece(keyword)
        if keyword:
            searches.append(keyword)
            searches.append(f"{keyword} book")

    for keywords, queries in THEME_SEARCHES:
        if any(keyword in text for keyword in keywords):
            searches.extend(queries)

    for needle, query in STOP_KEYWORDS.items():
        if needle in text:
            searches.append(query)

    city = clean_search_piece(game.get("city"))
    name = clean_search_piece(game.get("name"))
    tags = game.get("tags")
    tag_values = tags if isinstance(tags, list) else []

    if city:
        searches.append(f"{city} travel guide")
        searches.append(f"{city} souvenir book")
    if name:
        searches.append(f"{name} souvenir")
    for tag in tag_values[:4]:
        tag = clean_search_piece(tag)
        if tag:
            searches.append(f"{tag} book")

    searches.extend(GENERIC_SEARCHES)
    return unique(searches)[:max_queries]


def clean_search_piece(value: Any) -> str:
    text = re.sub(r"[^A-Za-z0-9 &:'-]+", " ", safe_text(value))
    return re.sub(r"\s+", " ", text).strip()


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        key = value.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(value.strip())
    return out


def score_candidate(candidate: Candidate, game: dict[str, Any]) -> int:
    text = game_words(game)
    title = candidate.title.lower()
    query = candidate.query.lower()
    score = 0
    for word in re.findall(r"[a-z0-9]{4,}", title):
        if word in text:
            score += 3
    for word in re.findall(r"[a-z0-9]{4,}", query):
        if word in text:
            score += 2
    if candidate.price_display:
        score += 1
    if candidate.image_url:
        score += 1
    if any(word in title for word in ("book", "guide", "history", "cookbook", "notebook", "journal")):
        score += 2
    return score


def find_candidates(
    game: dict[str, Any],
    max_queries: int,
    delay: float,
    user_keywords: list[str] | None = None,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    seen_urls: set[str] = set()
    searches = derive_searches(game, max_queries, user_keywords=user_keywords)

    for query in searches:
        try:
            page = fetch_amazon_search(query)
            found = parse_amazon_results(page, query)
        except Exception as exc:
            print(f"  ! Amazon search failed for {query!r}: {exc}", file=sys.stderr)
            found = []

        for candidate in found:
            normalized = normalize_amazon_url(candidate.url)
            if normalized in seen_urls:
                continue
            seen_urls.add(normalized)
            candidate.score = score_candidate(candidate, game)
            candidates.append(candidate)

        time.sleep(delay)

    candidates.sort(key=lambda c: (c.score, bool(c.image_url), bool(c.price_display)), reverse=True)
    return candidates


def insert_item(key: str, candidate: Candidate) -> dict[str, Any] | None:
    payload = {
        "kind": "amazon_link",
        "title": candidate.title,
        "url": candidate.url,
        "image_url": candidate.image_url or None,
        "image_focus": "50% 50%",
        "price_display": candidate.price_display or None,
        "description": candidate.description,
        "archived": False,
    }
    rows = request_json(rest_url("gift_shop_items"), key, method="POST", payload=payload)
    return rows[0] if isinstance(rows, list) and rows else None


def insert_listing(key: str, item_id: Any, game_id: str, position: int) -> dict[str, Any] | None:
    payload = {
        "item_id": item_id,
        "game_id": game_id,
        "position": position,
        "archived": False,
    }
    rows = request_json(rest_url("gift_shop_listings"), key, method="POST", payload=payload)
    return rows[0] if isinstance(rows, list) and rows else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Insert rows into Supabase.")
    parser.add_argument("--game", help="Only stock one game id.")
    parser.add_argument(
        "--keywords",
        help="Comma-separated human keywords to use before auto-derived searches.",
    )
    parser.add_argument(
        "--no-prompt",
        action="store_true",
        help="Skip the interactive keyword prompt.",
    )
    parser.add_argument("--limit-games", type=int, default=0, help="Limit games processed.")
    parser.add_argument("--items-per-game", type=int, default=4, help="Items to add per game.")
    parser.add_argument("--max-queries", type=int, default=7, help="Amazon searches per game.")
    parser.add_argument("--delay", type=float, default=1.2, help="Seconds between Amazon requests.")
    args = parser.parse_args()

    key = supabase_key()
    games = fetch_games(key, game_id=args.game or "", limit=args.limit_games)
    if not games:
        print("No games found.")
        return 0

    existing_urls = fetch_existing_item_urls(key)
    mode = "WRITE" if args.write else "DRY RUN"
    cli_keywords = split_keywords(args.keywords or "")
    prompt_keywords = [] if args.no_prompt else prompt_for_keywords()
    user_keywords = unique(cli_keywords + prompt_keywords)

    print(f"{mode}: stocking {len(games)} game(s).")
    print(f"Amazon tag={AMAZON_TRACKING_ID} store={AMAZON_STORE_ID}")
    if user_keywords:
        print("Human keywords: " + ", ".join(user_keywords))

    inserted_items = 0
    inserted_listings = 0

    for game in games:
        game_id = str(game.get("id") or "").strip()
        game_name = str(game.get("name") or game_id).strip()
        if not game_id:
            continue
        print(f"\n{game_name} [{game_id}]")

        candidates = find_candidates(game, args.max_queries, args.delay, user_keywords=user_keywords)
        selected: list[Candidate] = []
        for candidate in candidates:
            normalized = normalize_amazon_url(candidate.url)
            if normalized in existing_urls:
                continue
            selected.append(candidate)
            existing_urls.add(normalized)
            if len(selected) >= args.items_per_game:
                break

        if not selected:
            print("  no new candidates found")
            continue

        for offset, candidate in enumerate(selected):
            print(f"  + {candidate.title} ({candidate.price_display or 'price n/a'})")
            print(f"    {candidate.url}")
            if not args.write:
                continue
            item = insert_item(key, candidate)
            if not item or not item.get("id"):
                print("    ! insert item returned no id", file=sys.stderr)
                continue
            inserted_items += 1
            listing = insert_listing(key, item["id"], game_id, offset)
            if listing:
                inserted_listings += 1

    if args.write:
        print(f"\nInserted {inserted_items} item(s) and {inserted_listings} listing(s).")
    else:
        print("\nDry run only. Re-run with --write to insert these rows.")
    return 0


def split_keywords(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"[,;\n]+", value or "") if part.strip()]


def prompt_for_keywords() -> list[str]:
    if not sys.stdin.isatty():
        return []
    print("\nEnter Amazon search keywords to prioritize before auto-derived searches.")
    print("Examples: New Orleans cookbook, JFK assassination book, detective notebook")
    value = input("Keywords (comma-separated, blank for auto only): ").strip()
    return split_keywords(value)


if __name__ == "__main__":
    raise SystemExit(main())
