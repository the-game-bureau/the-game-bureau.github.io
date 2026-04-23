#!/usr/bin/env python3
"""
sampler_scraper.py — data pipeline for the Jazz Fest 2026 Sampler.

PROJECT
-------
The Sampler is a single-page mobile web app at /sampler that plays a 30-second
preview of the most popular song by every artist playing New Orleans that day
(Apr 23 – May 3, 2026). Tagline: "thirty seconds of sound from everyone in town." The page
is static HTML + JS; all data lives in ./sampler.json next to index.html.

    sampler/
      index.html          # UI. Reads sampler.json on load.
      sampler.json        # this script writes it
      sampler_scraper.py  # this file
      main.jpg            # hero image
      favicon.ico

PIPELINE
--------
1. Scrape per-day listings from three public sources, highest priority first:
     nojazzfest.com/music/         (1. official lineup — artist + date only)
     jazzfestgrids.com             (2. club night grid — artist + venue + time)
     nola.show/jazzfest-2026.html  (3. full day + night listings — everything)
2. Merge into sampler.json, deduping by (artist, date, time, location).
   A post-merge pass collapses "bare" rows (artist + date only, from
   nojazzfest) when a detailed row for the same (artist, date) exists.
3. Resolve each show's most-popular track via a chained lookup:
     Deezer preview  →  Apple preview  →  Deezer/Apple metadata
     →  YouTube Music scrape  →  YouTube scrape  →  Spotify search
   The first service with an in-browser preview wins. If none have a preview,
   the resolver still tries to return a specific song title, thumbnail, and
   track page before falling back to a generic search URL.

sampler.json SCHEMA  (index.html is the consumer — keep in sync)
----------------------------------------------------------------
{
  "meta": {
    "tagline": "thirty seconds of sound from everyone in town",
    "last_updated": "YYYY-MM-DD",
    "sources": [ "<source url>", ... ]
  },
  "shows": [
    {
      "artist":   str,                  # required. displayed as the row title.
      "date":     "YYYY-MM-DD",         # required. filters which day renders.
      "time":     "HH:MM" | null,       # 24h. 25:00..29:59 for post-midnight
                                        # late-night shows (01:00 AM → "25:00").
      "location": str | null,           # venue (club) or "Fairgrounds".
      "stage":    str | null,           # only when location=="Fairgrounds".
      "source":   "nojazzfest" | "jazzfestgrids" | "nola.show",
      "query":    str | null,           # optional: override artist string sent
                                        # to the resolver (for billed-together
                                        # acts like "A & B ft. C").
      "track":    { ...see below... }   # injected by the resolver.
    }
  ]
}

Track object injected onto each show:
{
  "source":  "deezer" | "itunes" | "youtube" | "spotify",
  "mode":    "play"   | "open"   | "search",
  "title":   str,              # song title (for play/open) or search label
  "preview": "https://..."     # present ONLY when mode == "play" (30s mp3)
  "url":     "https://...",    # track page (play/open) or search page
  "cover":   "https://..." | "" # optional artwork
}

Mode semantics the UI implements:
  "play"   — in-browser <audio> playback. Preview URL required. Source badge.
  "open"   — external track page (Apple Music, Deezer widget). Opens in the
             lightbox; embed.music.apple.com and widget.deezer.com render
             inline. Source badge + external-link icon.
  "search" — search result page (Spotify). No specific track found. Lightbox
             shows fallback card because search pages refuse iframe embed.

DAY BUTTONS
-----------
The page shows a horizontal day strip of 11 buttons, Thu Apr 23 through
Sun May 3. The DAYS constant below mirrors the one in index.html; keep
them in sync.

USAGE
-----
  python sampler_scraper.py                     # quick default — upgrades
                                                 # today's fallback rows only
  python sampler_scraper.py -i                  # interactive day-picker prompt
  python sampler_scraper.py --date 2026-04-23   # non-interactive, one day
  python sampler_scraper.py --no-scrape         # just re-run the resolver
  python sampler_scraper.py --no-resolve        # just scrape
  python sampler_scraper.py --force-resolve     # re-resolve every show
  python sampler_scraper.py --upgrade-fallbacks # only re-resolve rows with no preview
  python sampler_scraper.py --skip deezer       # skip a resolver
  python sampler_scraper.py --only nola.show    # limit scraping source
  python sampler_scraper.py --workers 8         # resolver concurrency
  python sampler_scraper.py --query "Kings of Leon"   # one-off resolver check
  python sampler_scraper.py --validate          # audit sampler.json, no writes
  python sampler_scraper.py --dry-run           # print what would be written

Requires beautifulsoup4 for jazzfestgrids parsing (pip install beautifulsoup4).
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

try:
    from bs4 import BeautifulSoup  # type: ignore
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

SCRIPT_DIR = Path(__file__).resolve().parent
JSON_PATH = SCRIPT_DIR / "sampler.json"

# Scrape order (priority descending). Higher-priority sources seed the JSON
# first; lower-priority sources fill in gaps and add additional shows.
#   1. nojazzfest.com  — official festival lineup per day (artist + date only)
#   2. jazzfestgrids   — club night-show grid (artist + time + venue)
#   3. nola.show       — full day + night listings (artist + time + venue + stage)
SOURCES = {
    "nojazzfest":    "https://www.nojazzfest.com/music/",
    "jazzfestgrids": "https://www.jazzfestgrids.com/",
    "nola.show":     "https://nola.show/jazzfest-2026.html",
}

# data-target attribute on nojazzfest.com's day panels → ISO date.
NOJAZZFEST_DATE_MAP = {
    "thur-1": "2026-04-23",
    "fri-1":  "2026-04-24",
    "sat-1":  "2026-04-25",
    "sun-1":  "2026-04-26",
    "thur-2": "2026-04-30",
    "fri-2":  "2026-05-01",
    "sat-2":  "2026-05-02",
    "sun-2":  "2026-05-03",
}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

FESTIVAL_DATES = {
    "thursday, april 23": "2026-04-23",
    "friday, april 24": "2026-04-24",
    "saturday, april 25": "2026-04-25",
    "sunday, april 26": "2026-04-26",
    # "Between" days — no Fairgrounds programming, but nola.show lists a
    # full slate of club/night shows under these headings. Without them the
    # scraper silently drops 27–29th.
    "monday, april 27": "2026-04-27",
    "tuesday, april 28": "2026-04-28",
    "wednesday, april 29": "2026-04-29",
    "thursday, april 30": "2026-04-30",
    "friday, may 1": "2026-05-01",
    "saturday, may 2": "2026-05-02",
    "sunday, may 3": "2026-05-03",
}

# ---------- Contract with index.html -------------------------------------
# Any change here should be mirrored in the JS in sampler/index.html.

SCHEMA_VERSION = 1

# Valid values for track.source and track.mode.
VALID_TRACK_SOURCES = {"deezer", "itunes", "youtube", "spotify"}
VALID_TRACK_MODES = {"play", "open", "search"}

# Resolver chain the UI expects, in preference order. The scraper's no-API
# YouTube scrapes run after Deezer/Apple metadata and before search-only
# fallback.
RESOLVER_CHAIN = ("deezer", "itunes", "youtube", "spotify")

# Show date range the UI's day strip covers (mirrors DAYS below).
DATE_RANGE_START = "2026-04-23"
DATE_RANGE_END   = "2026-05-03"

# Festival stage names the nola.show scraper recognizes. Rows on these stages
# get location="Fairgrounds" and stage=<the stage>; all other rows get the
# venue as location and stage=null. This is a contract with the UI's two-line
# "venue · stage" display in the sub info.
FESTIVAL_STAGES = (
    "festival stage",
    "shell gentilly",
    "congo square stage",
    "blues tent",
    "gospel tent",
    "jazz tent",
    "fais do-do",
    "economy hall",
    "lagniappe stage",
    "cultural exchange pavilion",
    "people's health stage",
    "ochsner",
    "kids tent",
    "jazz & heritage stage",   # Fairgrounds — nola.show lists daytime performers here
    "jazz and heritage stage",
    "rhythmpourium",           # Fairgrounds interview/demo tent
    "allison miner music heritage stage",  # Fairgrounds interview stage
)

# --------------------------------------------------------------------------
# Manual artist overrides — applied during every scrape, before resolver runs.
# Keys are lowercase artist names (normalized by norm_artist). When a show's
# artist matches, we attach the override `query` to that show; the resolver
# (Deezer/Apple/YouTube) then searches the override string instead of the
# literal artist name, which steers it to the correct result for artists
# whose names collide with famous songs or other performers.
#
# Any existing cached `track` on the show is cleared when an override is
# applied, so re-running the scraper picks fresh tracks based on the
# override query. Add entries here for any future mismatches you spot.
# --------------------------------------------------------------------------
ARTIST_OVERRIDES: dict[str, dict] = {
    # NOLA group, not Beyoncé's single.
    "single ladies": {"query": "Single Ladies New Orleans brass band"},
    # Local New Orleans musician — otherwise matches unrelated acts.
    "tom legget": {"query": "Tom Legget New Orleans"},
}


def apply_artist_overrides(shows) -> int:
    """Attach `query` overrides and drop stale tracks in place.

    Accepts either a list of Show dataclass instances (from scrape step) or
    a list of dicts (post-merge). Returns the number of shows modified.
    """
    modified = 0
    for s in shows:
        if isinstance(s, dict):
            artist = s.get("artist") or ""
        else:
            artist = s.artist or ""
        override = ARTIST_OVERRIDES.get(norm_artist(artist))
        if not override:
            continue
        new_query = override.get("query")
        if not new_query:
            continue
        if isinstance(s, dict):
            if s.get("query") != new_query:
                s["query"] = new_query
                # Cached track came from the wrong search — force re-resolve.
                s.pop("track", None)
                modified += 1
        else:
            if s.query != new_query:
                s.query = new_query
                modified += 1
    return modified


def reclassify_fair_grounds_stages(shows) -> int:
    """Normalize rows whose Fairgrounds stage got captured as the venue.

    nola.show sometimes lists stages like "Jazz & Heritage Stage" or
    "Rhythmpourium" in the venue slot with stage=None. These stages live at
    the Fairgrounds — the venue — so we preserve the stage name and set
    the venue correctly:
        location = "Fairgrounds"   (the venue)
        stage    = <the stage>      (the stage within the venue)

    Runs on both Show instances and dicts so it's safe anywhere in the
    pipeline. Returns the number of rows modified.
    """
    modified = 0
    for s in shows:
        loc = (s.get("location") if isinstance(s, dict) else s.location) or ""
        if not loc or loc.lower() == "fairgrounds":
            continue
        if not _looks_like_festival_stage(loc):
            continue
        if isinstance(s, dict):
            s["location"] = "Fairgrounds"
            s["stage"] = loc
        else:
            s.location = "Fairgrounds"
            s.stage = loc
        modified += 1
    return modified

# Days offered by the interactive prompt. Must match the browser's DAYS list.
DAYS = [
    {"iso": "2026-04-23", "label": "Thu · Apr 23", "badge": "Day 1 · Opening"},
    {"iso": "2026-04-24", "label": "Fri · Apr 24", "badge": "Day 2"},
    {"iso": "2026-04-25", "label": "Sat · Apr 25", "badge": "Day 3"},
    {"iso": "2026-04-26", "label": "Sun · Apr 26", "badge": "Day 4"},
    {"iso": "2026-04-27", "label": "Mon · Apr 27", "badge": "Between"},
    {"iso": "2026-04-28", "label": "Tue · Apr 28", "badge": "Between"},
    {"iso": "2026-04-29", "label": "Wed · Apr 29", "badge": "Between"},
    {"iso": "2026-04-30", "label": "Thu · Apr 30", "badge": "Day 5"},
    {"iso": "2026-05-01", "label": "Fri · May 1",  "badge": "Day 6"},
    {"iso": "2026-05-02", "label": "Sat · May 2",  "badge": "Day 7"},
    {"iso": "2026-05-03", "label": "Sun · May 3",  "badge": "Day 8 · Closing"},
]


# ---------- Models --------------------------------------------------------


@dataclass
class Show:
    artist: str
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    stage: Optional[str] = None
    source: Optional[str] = None
    query: Optional[str] = None
    track: Optional[dict] = None

    def to_json(self) -> dict:
        out = asdict(self)
        # Strip Nones but keep "stage" and "track" explicit.
        for k in ("date", "time", "location", "source", "query"):
            if out.get(k) is None:
                out.pop(k, None)
        return out


# ---------- HTTP helpers --------------------------------------------------


def fetch(url: str, timeout: int = 25) -> str:
    ctx = ssl.create_default_context()
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urlopen(req, timeout=timeout, context=ctx) as r:
        raw = r.read()
        encoding = r.headers.get_content_charset() or "utf-8"
        return raw.decode(encoding, errors="replace")


def fetch_json(url: str, timeout: int = 15) -> dict:
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------- Normalization -------------------------------------------------


def norm(s: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


_ARTIST_CHAR_TRANSLATION = str.maketrans({
    "’": "'",
    "‘": "'",
    "‛": "'",
    "`": "'",
    "´": "'",
    "“": '"',
    "”": '"',
    "„": '"',
    "–": "-",
    "—": "-",
    "−": "-",
    "…": "",
})


def norm_artist(s: Optional[str]) -> str:
    s = norm(s).translate(_ARTIST_CHAR_TRANSLATION).lower()
    s = re.sub(r"\s*&\s*", " and ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def loose_artist_key(s: Optional[str]) -> str:
    """A forgiving key for dropping source duplicates, not display text."""
    s = norm_artist(s)
    s = re.sub(r"\b(feat|ft|featuring)\.?\b", " featuring ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\b(the|and)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _artist_key_tokens(key: str) -> set[str]:
    return {t for t in key.split() if t}


def loose_artist_match(a: Optional[str], b: Optional[str]) -> bool:
    """True when two source names are clearly the same billing.

    This is intentionally used only for dropping bare source rows. It allows
    containment, so an untimed official artist row can collapse into a timed
    combined/parade row that contains that artist's name.
    """
    ka = loose_artist_key(a)
    kb = loose_artist_key(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True

    ta = _artist_key_tokens(ka)
    tb = _artist_key_tokens(kb)
    if not ta or not tb:
        return False

    smaller = ta if len(ta) <= len(tb) else tb
    larger = tb if smaller is ta else ta
    if len(smaller) == 1 and len(next(iter(smaller))) < 5:
        return False
    return smaller.issubset(larger)


def norm_location(s: Optional[str]) -> str:
    s = norm(s).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def dedupe_key(show: Show) -> tuple:
    return (norm_artist(show.artist), show.date or "", show.time or "",
            norm_location(show.location))


def _normalize_date_filter(value) -> Optional[set]:
    """Accept a single ISO string, a collection of ISO strings, or None.
    Returns a set of dates (or None for 'no filter')."""
    if value is None:
        return None
    if isinstance(value, str):
        return {value}
    return set(value)


def dates_in_range(end_iso: str) -> set[str]:
    """Festival days from today through end_iso (inclusive). Today is
    clamped to DAYS[0] if the festival hasn't started yet. Empty set if
    end is before today or today is after the festival."""
    today = datetime.now().strftime("%Y-%m-%d")
    start = max(today, DAYS[0]["iso"])
    return {d["iso"] for d in DAYS if start <= d["iso"] <= end_iso}


TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|a\.m\.|p\.m\.)\b", re.IGNORECASE)


def parse_time(value: str, night_context: bool = False) -> Optional[str]:
    if not value:
        return None
    m = TIME_RE.search(value)
    if not m:
        return None
    h = int(m.group(1))
    minutes = int(m.group(2) or 0)
    ap = m.group(3).upper().replace(".", "")
    if ap == "PM" and h < 12:
        h += 12
    elif ap == "AM" and h == 12:
        h = 0
    if night_context and 0 <= h < 6:
        h += 24
    return f"{h:02d}:{minutes:02d}"


def parse_date_heading(text: str) -> Optional[str]:
    if not text:
        return None
    t = text.strip().lower()
    for key, iso in FESTIVAL_DATES.items():
        if key in t:
            return iso
    m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), m.group(3)
        year_i = int(year) if year else 2026
        if year_i < 100:
            year_i += 2000
        return f"{year_i:04d}-{month:02d}-{day:02d}"
    return None


def _looks_like_festival_stage(venue: str) -> bool:
    v = (venue or "").lower()
    return any(tag in v for tag in FESTIVAL_STAGES)


def _is_late_night(time_raw: str) -> bool:
    if not time_raw:
        return False
    m = TIME_RE.search(time_raw)
    if not m:
        return False
    hr = int(m.group(1))
    ap = m.group(3).upper().replace(".", "")
    return ap == "AM" and 1 <= hr <= 5


# Reject obvious non-artist strings. nola.show occasionally renders a heading
# like "Night-by-Night Listings" followed by a paragraph — we don't want
# either showing up as a show.
_BAD_PHRASES = (
    "night-by-night", "night by night", "shows are listed", "listings shows",
    "the cubes", "schedule",
    "open in youtube", "open in spotify",
    "most popular song",
)


def looks_like_artist(name: Optional[str]) -> bool:
    if not name:
        return False
    n = name.strip()
    if len(n) < 2 or len(n) > 100:
        return False
    if n.count("@") > 1:
        return False
    if n.count("—") > 1:
        return False
    lowered = n.lower()
    if any(p in lowered for p in _BAD_PHRASES):
        return False
    if len(re.findall(r"\d{1,2}:\d{2}\s*[ap]\.?m\.?", lowered)) > 1:
        return False
    return True


# ---------- Scrapers ------------------------------------------------------


NOLA_LINE_RE = re.compile(
    r"^\s*(?P<artist>[^|]+?)\s*\|\s*(?P<venue>[^|]+?)\s*\|\s*(?P<time>[^|]+?)\s*$"
)


_DOW_RE = re.compile(
    r"\b(mon|tues?|wed|wednes|thur?s?|fri|satur?|sun)(day)?\b",
    re.IGNORECASE,
)

# Narrative phrases that appear in nojazzfest.com prose but are not artists.
_NOJAZZFEST_NARRATIVE = (
    "jazz fest celebrates", "celebrates jamaica", "celebrates mali",
    "with special guest", "featuring special",
)


def scrape_nojazzfest(html: str) -> list[Show]:
    """Parse nojazzfest.com/music/ for per-day artist lists.

    Structure:
        <h1 data-target="thur-1">Thursday, April 23</h1>
        ...
        <div class="inner" data-target="thur-1">
            <h5>Artist, Artist, Artist, ...</h5>
        </div>

    The artist list is narrative prose separated by commas. No times, stages,
    or venues — the returned Shows carry only artist + date. They serve as an
    authoritative "who's officially on the bill each day" list; times/stages
    come from downstream sources.
    """
    if not HAS_BS4:
        return []

    soup = BeautifulSoup(html, "html.parser")
    shows: list[Show] = []

    for div in soup.find_all(attrs={"data-target": True}):
        target = div.get("data-target")
        date = NOJAZZFEST_DATE_MAP.get(target)
        if not date:
            continue
        # Only process content panels (have inner artist content). The <h1>
        # navigation anchors with the same data-target are too short to carry
        # a real list.
        text = norm(div.get_text(" ", strip=True))
        if len(text) < 40 or "," not in text:
            continue

        for chunk in text.split(","):
            artist = norm(chunk)
            if not artist:
                continue
            # Strip narrative prefixes like "and ", "plus ".
            artist = re.sub(r"^(and|plus|with|featuring)\s+", "", artist, flags=re.IGNORECASE)
            artist = norm(artist)
            if not artist:
                continue
            lower = artist.lower()
            if any(phrase in lower for phrase in _NOJAZZFEST_NARRATIVE):
                # Chunk is introducing a theme ("Jazz Fest celebrates Jamaica
                # with Monty Alexander ..."). Try to keep the trailing name
                # only — everything after the last "with ".
                m = re.search(r"\bwith\s+(.+)$", artist, re.IGNORECASE)
                if m:
                    artist = norm(m.group(1))
                else:
                    continue
            # Strip embedded double/curly quotes from named-show titles like
            # "Jamericana". Leave apostrophes alone (they appear in real
            # possessives like "Gregg Stafford's Jazz Hounds"). Do NOT strip
            # " of X" — that's part of band names like "Kings of Leon" and
            # "Blind Boys of Alabama".
            artist = re.sub(r'[“”"]', "", artist)
            artist = norm(artist)
            if not artist:
                continue
            shows.append(Show(
                artist=artist,
                date=date,
                time=None,
                location=None,
                stage=None,
                source="nojazzfest",
            ))

    return [s for s in shows if looks_like_artist(s.artist)]
_NOLA_ENTRY_RE = re.compile(
    r"(\d{1,2}:\d{2}\s*[AaPp]\.?[Mm]\.?)\s+(.+)"
)


def scrape_nola_show(html: str) -> list[Show]:
    """Parse nola.show/jazzfest-2026.html.

    Two distinct show formats live on the page:

      1. Festival day stages (day-time only):
           <h4>Thursday, April 23</h4>
           <p><strong>Festival Stage:</strong>
              11:20 AM Gov't Majik, 12:35 PM Johnny Sketch & The Dirty Notes, ...
           </p>

      2. Club night shows:
           <h4>Thursday, April 23, 2026</h4>
           <div class="show-entry">
             <span class="time">9:00 PM</span> •
             <a href="...">Artist</a>
             <span class="venue">@ Venue</span>
             <span class="price">($20)</span>
           </div>

    We track the most recent day heading (h2/h3/h4 with a weekday word). If the
    heading maps to a festival date (via FESTIVAL_DATES) we record shows under
    it; if it maps to a non-festival day we reset current_date to None and
    skip until the next festival heading.
    """
    shows: list[Show] = []
    if not HAS_BS4:
        return shows

    soup = BeautifulSoup(html, "html.parser")
    current_date: Optional[str] = None

    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "div"]):
        # Day heading: any weekday word in an h-tag resets current_date.
        if el.name in ("h1", "h2", "h3", "h4"):
            text = norm(el.get_text(" ", strip=True))
            if _DOW_RE.search(text):
                current_date = parse_date_heading(text)  # None if not a festival day
            continue

        if not current_date:
            continue

        # Festival stage: <p><strong>Stage Name:</strong> TIME ARTIST, TIME ARTIST, ...</p>
        if el.name == "p":
            strong = el.find("strong")
            if not strong:
                continue
            stage_name = norm(strong.get_text()).rstrip(":").strip()
            if not stage_name:
                continue
            # Everything after the <strong>.
            tail_bits: list[str] = []
            for sib in strong.next_siblings:
                if isinstance(sib, str):
                    tail_bits.append(sib)
                else:
                    tail_bits.append(sib.get_text(" ", strip=True))
            tail = norm(" ".join(tail_bits)).lstrip(":").strip()
            if not tail:
                continue
            for chunk in tail.split(","):
                chunk = norm(chunk)
                m = _NOLA_ENTRY_RE.match(chunk)
                if not m:
                    continue
                time_raw = m.group(1)
                artist = norm(m.group(2))
                if not artist:
                    continue
                is_stage = _looks_like_festival_stage(stage_name)
                shows.append(Show(
                    artist=artist,
                    date=current_date,
                    time=parse_time(time_raw),
                    location="Fairgrounds" if is_stage else stage_name,
                    stage=stage_name if is_stage else None,
                    source="nola.show",
                ))
            continue

        # Night show: <div class="show-entry">
        if el.name == "div" and "show-entry" in (el.get("class") or []):
            time_el  = el.find(class_="time")
            venue_el = el.find(class_="venue")
            if not time_el:
                continue
            time_raw  = norm(time_el.get_text())
            venue_raw = norm(venue_el.get_text()).lstrip("@").strip() if venue_el else ""
            # Build artist name from children that aren't time/venue/price spans.
            artist_parts: list[str] = []
            for node in el.children:
                name = getattr(node, "name", None)
                if name is None:
                    artist_parts.append(str(node))
                elif name == "span":
                    continue
                else:
                    artist_parts.append(node.get_text(" ", strip=True))
            artist = norm(" ".join(artist_parts))
            # Strip separator chars (em/en dash, bullets) and trailing annotations.
            artist = re.sub(r"[–—•·●◆|]+", " ", artist)
            artist = re.sub(r"\s*\((sold out|free)\)\s*", " ", artist, flags=re.IGNORECASE)
            artist = norm(artist)
            if not artist:
                continue
            shows.append(Show(
                artist=artist,
                date=current_date,
                time=parse_time(time_raw, night_context=_is_late_night(time_raw)),
                location=venue_raw or None,
                stage=None,
                source="nola.show",
            ))

    return [s for s in shows if looks_like_artist(s.artist)]


def scrape_jazzfestgrids(html: str) -> list[Show]:
    shows: list[Show] = []
    if not HAS_BS4:
        print("! jazzfestgrids parser needs beautifulsoup4 (pip install beautifulsoup4)",
              file=sys.stderr)
        return shows

    soup = BeautifulSoup(html, "html.parser")

    current_date: Optional[str] = None
    for heading in soup.find_all(["h1", "h2", "h3"]):
        maybe = parse_date_heading(norm(heading.get_text(" ", strip=True)))
        if maybe:
            current_date = maybe
            break

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        header_cells = rows[0].find_all(["th", "td"])
        venues = [norm(c.get_text(" ", strip=True)) for c in header_cells]
        time_col = 0 if venues and re.search(r"time|hour", venues[0], re.IGNORECASE) else None

        caption = table.find("caption")
        table_date = current_date
        if caption:
            maybe = parse_date_heading(norm(caption.get_text(" ", strip=True)))
            if maybe:
                table_date = maybe

        for tr in rows[1:]:
            cells = tr.find_all(["td", "th"])
            if not cells:
                continue
            time_raw = norm(cells[0].get_text(" ", strip=True)) if time_col == 0 else ""
            night = _is_late_night(time_raw)
            start_idx = 1 if time_col == 0 else 0
            for i, cell in enumerate(cells[start_idx:], start=start_idx):
                text = norm(cell.get_text("\n", strip=True))
                if not text:
                    continue
                venue = venues[i] if i < len(venues) else None
                for line in text.split("\n"):
                    artist = norm(line)
                    if not artist:
                        continue
                    shows.append(Show(
                        artist=artist,
                        date=table_date or "2026-04-23",
                        time=parse_time(time_raw, night_context=night),
                        location=venue,
                        stage=None,
                        source="jazzfestgrids",
                    ))
    return [s for s in shows if looks_like_artist(s.artist)]


# ---------- Resolvers -----------------------------------------------------


def resolve_deezer(query: str) -> tuple[Optional[dict], Optional[dict]]:
    """Return (artist, track) dicts from Deezer. Either may be None.

    Prefers the artist's #1 track; walks down the top 20 only if higher-
    ranked tracks lack a preview (rights restrictions, etc). This maximizes
    playable Deezer previews and minimizes YouTube-fallback rows while still
    landing on the most popular song when possible.
    """
    try:
        s = fetch_json(f"https://api.deezer.com/search/artist?limit=1&q={quote(query)}")
    except Exception:
        return (None, None)
    artist = (s.get("data") or [None])[0] if isinstance(s, dict) else None
    if not artist:
        return (None, None)
    try:
        t = fetch_json(f"https://api.deezer.com/artist/{artist['id']}/top?limit=20")
    except Exception:
        return (artist, None)
    tracks = t.get("data") or [] if isinstance(t, dict) else []
    if not tracks:
        return (artist, None)
    # First track with a preview (ordered by popularity). Falls back to the
    # #1 track with no preview, which lets deezer_result return mode='open'
    # instead of triggering the full chain — still better than a YT search.
    for track in tracks:
        if track.get("preview"):
            return (artist, track)
    return (artist, tracks[0])


def deezer_result(artist: Optional[dict], track: dict) -> dict:
    cover = ""
    album = track.get("album") or {}
    cover = album.get("cover_medium") or album.get("cover") or ""
    if not cover and artist:
        cover = artist.get("picture_medium") or ""
    title = track.get("title_short") or track.get("title") or ""
    url = track.get("link") or ""
    if track.get("preview"):
        return {
            "source": "deezer",
            "mode": "play",
            "title": title,
            "preview": track["preview"],
            "url": url,
            "cover": cover,
        }
    return {
        "source": "deezer",
        "mode": "open",
        "title": title,
        "url": url,
        "cover": cover,
    }


def resolve_itunes(query: str) -> Optional[dict]:
    """iTunes Search API with retry/backoff. Apple throttles aggressively
    (HTTP 403 / empty responses) once per-IP request volume climbs — which
    is exactly what happens when we blast through 2000 resolutions in one
    run. Prior to this we silently failed on the first hiccup and fell
    through to YouTube Music, producing the lopsided hit-count between
    Day 1 (resolved early, cached) and every later day.
    """
    # Ask for more results than we strictly need so we can walk down the
    # relevance-ordered list if the top match has no preview URL (Apple's
    # rights-cleared set is spotty for indie/NOLA-local acts).
    url = (
        "https://itunes.apple.com/search?"
        f"term={quote(query)}&entity=song&attribute=artistTerm&limit=25&media=music"
    )
    # Three attempts with growing backoff. Most throttle windows clear
    # within a second or two.
    for attempt in range(3):
        try:
            data = fetch_json(url)
            results = data.get("results") or []
            if not results:
                return None
            # Highest-ranked track with a preview wins; fall back to #1
            # without preview if nothing in the set is playable.
            for r in results:
                if r.get("previewUrl"):
                    return r
            return results[0]
        except HTTPError as e:
            # 403/429/503 → wait and retry. Anything else → give up.
            if e.code not in (403, 429, 500, 502, 503, 504):
                return None
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
            else:
                print(f"  ! iTunes throttled (HTTP {e.code}) on '{query[:40]}'",
                      file=sys.stderr)
                return None
        except (URLError, TimeoutError):
            if attempt < 2:
                time.sleep(1.0 * (attempt + 1))
            else:
                return None
        except Exception:
            return None
    return None


def itunes_result(pick: dict) -> dict:
    cover = (pick.get("artworkUrl100") or "").replace("100x100", "300x300")
    title = pick.get("trackName") or ""
    url = pick.get("trackViewUrl") or ""
    if pick.get("previewUrl"):
        return {
            "source": "itunes",
            "mode": "play",
            "title": title,
            "preview": pick["previewUrl"],
            "url": url,
            "cover": cover,
        }
    return {
        "source": "itunes",
        "mode": "open",
        "title": title,
        "url": url,
        "cover": cover,
    }


_YT_INITIAL_DATA_MARKERS = (
    "var ytInitialData =",
    "window[\"ytInitialData\"] =",
    "ytInitialData =",
)


def _extract_yt_initial_data(html: str) -> Optional[dict]:
    """Read the embedded ytInitialData JSON without relying on regex braces."""
    decoder = json.JSONDecoder()
    for marker in _YT_INITIAL_DATA_MARKERS:
        idx = html.find(marker)
        if idx < 0:
            continue
        start = html.find("{", idx + len(marker))
        if start < 0:
            continue
        try:
            data, _ = decoder.raw_decode(html[start:])
            if isinstance(data, dict):
                return data
        except ValueError:
            continue
    return None


def _walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _yt_text(value) -> str:
    if not isinstance(value, dict):
        return ""
    if value.get("simpleText"):
        return norm(value.get("simpleText"))
    runs = value.get("runs")
    if isinstance(runs, list):
        return norm("".join(str(r.get("text") or "") for r in runs if isinstance(r, dict)))
    return ""


def _best_thumbnail(value) -> str:
    best_url = ""
    best_score = -1
    for node in _walk_json(value):
        if not isinstance(node, dict):
            continue
        thumbs = node.get("thumbnails")
        if not isinstance(thumbs, list):
            continue
        for thumb in thumbs:
            if not isinstance(thumb, dict):
                continue
            url = thumb.get("url") or ""
            if not url:
                continue
            width = int(thumb.get("width") or 0)
            height = int(thumb.get("height") or 0)
            score = width * height
            if score >= best_score:
                best_url = url
                best_score = score
    return best_url


def _find_watch_video_id(value) -> str:
    for node in _walk_json(value):
        if not isinstance(node, dict):
            continue
        endpoint = node.get("watchEndpoint")
        if isinstance(endpoint, dict) and endpoint.get("videoId"):
            return str(endpoint["videoId"])
    return ""


def _music_item_title(renderer: dict) -> str:
    columns = renderer.get("flexColumns") or []
    for column in columns:
        if not isinstance(column, dict):
            continue
        text = (column.get("musicResponsiveListItemFlexColumnRenderer") or {}).get("text") or {}
        title = _yt_text(text)
        if title:
            return title
    return _yt_text(renderer.get("title") or {})


def _fetch_yt_initial_data(url: str, timeout: int = 15) -> Optional[dict]:
    try:
        req = Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urlopen(req, timeout=timeout) as r:
            html = r.read().decode("utf-8", errors="replace")
    except Exception:
        return None
    return _extract_yt_initial_data(html)


def resolve_youtube_music(query: str, song_title: str = "") -> Optional[dict]:
    """Scrape music.youtube.com for a specific watchable music result."""
    q = f"{query} {song_title}".strip() if song_title else query
    data = _fetch_yt_initial_data(f"https://music.youtube.com/search?q={quote(q)}")
    if not data:
        return None

    try:
        for node in _walk_json(data):
            renderer = node.get("musicResponsiveListItemRenderer") if isinstance(node, dict) else None
            if not isinstance(renderer, dict):
                continue
            vid = _find_watch_video_id(renderer)
            title = _music_item_title(renderer)
            if vid and title:
                return {
                    "title": title,
                    "video_id": vid,
                    "url": f"https://music.youtube.com/watch?v={vid}",
                    "cover": _best_thumbnail(renderer),
                }
    except (KeyError, TypeError, ValueError):
        return None
    return None


def resolve_youtube(query: str) -> Optional[dict]:
    """Scrape youtube.com/results for the top video matching `query`.

    Returns {title, video_id, url, cover} for the first videoRenderer found, or
    None. Uses the public page's embedded ytInitialData JSON, so every failure
    path is graceful and the caller can fall back to a search URL.
    """
    data = _fetch_yt_initial_data(f"https://www.youtube.com/results?search_query={quote(query)}")
    if not data:
        return None

    try:
        for node in _walk_json(data):
            video = node.get("videoRenderer") if isinstance(node, dict) else None
            if not isinstance(video, dict):
                continue
            vid = video.get("videoId")
            title = _yt_text(video.get("title") or {})
            if title and vid:
                return {
                    "title": title,
                    "video_id": str(vid),
                    "url": f"https://music.youtube.com/watch?v={vid}",
                    "cover": _best_thumbnail(video),
                }
    except (KeyError, TypeError, ValueError):
        return None
    return None


def youtube_open_result(found: dict) -> dict:
    return {
        "source": "youtube",
        "mode": "open",
        "title": found.get("title") or "",
        "url": found.get("url") or "",
        "cover": found.get("cover") or "",
    }


def youtube_music_link(query: str, song_title: str = "") -> dict:
    """Prefer a carried song title (from Deezer/Apple metadata). If we have
    none, scrape YouTube to get an actual track title + a direct watch URL.
    Last resort: a YouTube Music search page with "no track found" as label."""
    title = song_title
    url = None

    if not title:
        found = resolve_youtube(query)
        if found:
            title = found["title"]
            url = found["url"]
            return youtube_open_result(found)

    if not url:
        q = f"{query} {song_title}".strip() if song_title else query
        url = f"https://music.youtube.com/search?q={quote(q)}"

    return {
        "source": "youtube",
        "mode": "search",
        "title": title or "no track found",
        "url": url,
    }


def spotify_search(query: str) -> dict:
    return {
        "source": "spotify",
        "mode": "search",
        "title": "no track found",
        "url": f"https://open.spotify.com/search/{quote(query)}",
    }


def resolve_track(query: str, skip: Iterable[str] = ()) -> dict:
    """Chain previews first, then specific metadata/scrapes, then search."""
    skip_set = set(skip)
    d_artist = d_track = None
    fallback: Optional[dict] = None

    if "deezer" not in skip_set:
        d_artist, d_track = resolve_deezer(query)
        if d_track and d_track.get("preview"):
            return deezer_result(d_artist, d_track)
        if d_track:
            fallback = deezer_result(d_artist, d_track)

    i_pick = None
    if "itunes" not in skip_set:
        i_pick = resolve_itunes(query)
        if i_pick and i_pick.get("previewUrl"):
            return itunes_result(i_pick)
        if i_pick and not fallback:
            fallback = itunes_result(i_pick)

    # No in-browser preview available. Carry through any song title we found so
    # the no-API YouTube scrapes and last-resort search land closer to the
    # actual track.
    song_title = ""
    if fallback:
        song_title = fallback.get("title") or ""

    if "youtube" not in skip_set:
        found = resolve_youtube_music(query, song_title)
        if found:
            return youtube_open_result(found)
        q = f"{query} {song_title}".strip() if song_title else query
        found = resolve_youtube(q)
        if found:
            return youtube_open_result(found)

    if fallback and fallback.get("title"):
        return fallback

    if "youtube" not in skip_set:
        return youtube_music_link(query, "")
    return spotify_search(query)


# ---------- Batch resolve ------------------------------------------------


def resolve_shows(
    shows: list[dict],
    force: bool = False,
    skip: Iterable[str] = (),
    workers: int = 4,
    only_date=None,
    upgrade_only: bool = False,
) -> dict:
    """Re-run the resolver chain on rows that need it.

    Modes:
      - force=True: re-resolve every matching row (expensive but thorough).
      - upgrade_only=True: re-resolve only rows that currently lack a
        playable preview (YouTube/Spotify fallbacks, mode='open' without
        preview, or missing tracks). Rows already showing a Deezer/Apple
        playable preview are left alone — this is the cheap way to try to
        upgrade fallback rows without disturbing the ones that already work.
      - neither: resolve rows that have never been resolved.
    """
    allowed = _normalize_date_filter(only_date)
    tasks = []
    for s in shows:
        if allowed is not None and s.get("date") not in allowed:
            continue
        if upgrade_only:
            t = s.get("track") or {}
            # Skip rows that already have a working in-browser preview.
            if t.get("mode") == "play" and t.get("preview"):
                continue
            # Clear the fallback track so the resolver re-runs fresh.
            s.pop("track", None)
        elif s.get("track") and not force:
            continue
        tasks.append(s)

    stats = {
        "deezer_play": 0,
        "deezer_open": 0,
        "itunes_play": 0,
        "itunes_open": 0,
        "youtube_open": 0,
        "search": 0,
    }
    if not tasks:
        print("Nothing to resolve. Pass --force-resolve to re-run.")
        return stats

    print(f"→ Resolving {len(tasks)} show(s) · workers={workers} · skip={sorted(skip) or 'none'}")

    def work(show: dict) -> tuple[dict, dict]:
        q = show.get("query") or show.get("artist") or ""
        try:
            track = resolve_track(q, skip=skip)
        except Exception as e:  # network hiccup, etc.
            print(f"  ! resolver crashed on '{q}': {e}", file=sys.stderr)
            track = spotify_search(q)
        return show, track

    idx = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for show, track in ex.map(work, tasks):
            idx += 1
            show["track"] = track
            key = "search" if track["mode"] == "search" else f"{track['source']}_{track['mode']}"
            stats[key] = stats.get(key, 0) + 1
            label = f"{track['source']}/{track['mode']}"
            print(f"  [{idx:>3}/{len(tasks)}] {show.get('artist','')[:42]:<42}  →  {label:<14}  "
                  f"{track.get('title','')[:40]}")
    return stats


# ---------- Merge / IO ---------------------------------------------------


def load_existing() -> dict:
    if JSON_PATH.exists():
        return json.loads(JSON_PATH.read_text(encoding="utf-8"))
    return {
        "meta": {
            "tagline": "thirty seconds of sound from everyone in town",
            "last_updated": None,
            "sources": list(SOURCES.values()),
        },
        "shows": [],
    }


def save(data: dict, dry_run: bool) -> None:
    data.setdefault("meta", {})["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if dry_run:
        print("--- dry run: would write sampler.json ---")
        print(payload[:900] + ("\n…(truncated)" if len(payload) > 900 else ""))
        return
    JSON_PATH.write_text(payload, encoding="utf-8")


def merge(existing_shows: list[dict], incoming: list[Show],
          only_date=None) -> tuple[list[dict], int, int]:
    allowed = _normalize_date_filter(only_date)
    existing_by_key: dict[tuple, dict] = {}
    for s in existing_shows:
        key = (
            norm_artist(s.get("artist")),
            s.get("date") or "",
            s.get("time") or "",
            norm_location(s.get("location")),
        )
        existing_by_key[key] = s

    added = 0
    updated = 0
    for new in incoming:
        if allowed is not None and new.date and new.date not in allowed:
            continue
        if not new.artist:
            continue
        key = dedupe_key(new)
        payload = new.to_json()
        if key in existing_by_key:
            cur = existing_by_key[key]
            changed = False
            for field_name in ("time", "location", "stage", "source", "query"):
                val = payload.get(field_name)
                if val and cur.get(field_name) != val:
                    cur[field_name] = val
                    changed = True
            if changed:
                updated += 1
        else:
            existing_by_key[key] = payload
            added += 1
    return list(existing_by_key.values()), added, updated


def dedupe_bare_rows(shows: list[dict]) -> tuple[list[dict], int]:
    """Drop artist+date-only rows when a detailed row exists for the same act.

    nojazzfest seeds each day with artist+date entries (no time, no location,
    no stage). When nola.show or jazzfestgrids later contributes a detailed
    row for that same (artist, date), the bare row becomes redundant. This
    pass collapses them.

    Returns (keep, dropped_count).
    """
    detailed_by_date: dict[str, list[dict]] = {}
    by_key: dict[tuple, list[int]] = {}
    for i, s in enumerate(shows):
        date = s.get("date") or ""
        artist = s.get("artist") or ""
        key = (loose_artist_key(artist), date)
        if not key[0] or not key[1]:
            continue
        by_key.setdefault(key, []).append(i)
        if s.get("time") or s.get("location"):
            detailed_by_date.setdefault(date, []).append(s)

    drop: set[int] = set()
    for indices in by_key.values():
        if len(indices) < 2:
            continue
        has_detailed = any(
            shows[i].get("time") or shows[i].get("location")
            for i in indices
        )
        if has_detailed:
            for i in indices:
                if not shows[i].get("time") and not shows[i].get("location"):
                    drop.add(i)

    for i, s in enumerate(shows):
        if i in drop or s.get("time") or s.get("location"):
            continue
        date = s.get("date") or ""
        artist = s.get("artist") or ""
        if not date or not artist:
            continue
        if any(loose_artist_match(artist, d.get("artist") or "") for d in detailed_by_date.get(date, [])):
            drop.add(i)

    if not drop:
        return shows, 0
    kept = [s for i, s in enumerate(shows) if i not in drop]
    return kept, len(drop)


# ---------- Schema validation --------------------------------------------
# Audit a sampler.json against the contract the browser UI relies on.
# index.html reads: show.artist, show.date, show.time, show.location,
# show.stage, show.query, show.track{source,mode,title,preview,url,cover}.
# meta: meta.tagline, meta.last_updated.

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")  # allows 25:00–29:59 for late-night


def validate_track(track: dict, prefix: str = "") -> list[str]:
    issues: list[str] = []
    if not isinstance(track, dict):
        return [f"{prefix}track is not an object"]
    source = track.get("source")
    if source not in VALID_TRACK_SOURCES:
        issues.append(f"{prefix}track.source '{source}' not in {sorted(VALID_TRACK_SOURCES)}")
    mode = track.get("mode")
    if mode not in VALID_TRACK_MODES:
        issues.append(f"{prefix}track.mode '{mode}' not in {sorted(VALID_TRACK_MODES)}")
    if not track.get("title"):
        issues.append(f"{prefix}track.title is empty")
    if mode == "play" and not track.get("preview"):
        issues.append(f"{prefix}track.mode='play' but no preview URL")
    if mode != "play" and track.get("preview"):
        issues.append(f"{prefix}track.mode='{mode}' should not carry a preview URL")
    if not track.get("url"):
        issues.append(f"{prefix}track.url is empty (the UI needs it for lightbox/external open)")
    # Light sanity checks on URLs.
    for k in ("preview", "url", "cover"):
        v = track.get(k)
        if v and not str(v).startswith(("http://", "https://")):
            issues.append(f"{prefix}track.{k} is not a URL: {v!r}")
    return issues


def validate_show(show: dict, idx: int = 0) -> list[str]:
    issues: list[str] = []
    p = f"shows[{idx}] "
    if not isinstance(show, dict):
        return [f"{p}is not an object"]

    artist = show.get("artist")
    if not artist or not isinstance(artist, str):
        issues.append(f"{p}artist missing")
    elif not looks_like_artist(artist):
        issues.append(f"{p}artist looks like a heading/paragraph: {artist[:60]!r}")

    date = show.get("date")
    if not date or not isinstance(date, str) or not _ISO_DATE_RE.match(date):
        issues.append(f"{p}date '{date}' is not YYYY-MM-DD")
    elif not (DATE_RANGE_START <= date <= DATE_RANGE_END):
        issues.append(f"{p}date '{date}' outside festival range {DATE_RANGE_START}..{DATE_RANGE_END}")

    time_v = show.get("time")
    if time_v is not None and (not isinstance(time_v, str) or not _TIME_RE.match(time_v)):
        issues.append(f"{p}time '{time_v}' is not 'HH:MM'")

    stage = show.get("stage")
    location = show.get("location")
    if stage and location != "Fairgrounds":
        issues.append(f"{p}has stage but location is not 'Fairgrounds' (location={location!r})")

    src = show.get("source")
    if src and src not in {"nojazzfest", "jazzfestgrids", "nola.show"}:
        issues.append(f"{p}source '{src}' is unknown")

    track = show.get("track")
    if track is not None:
        issues.extend(validate_track(track, prefix=p))

    return issues


def validate_json(data: dict) -> list[str]:
    issues: list[str] = []
    if not isinstance(data, dict):
        return ["root is not an object"]

    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        issues.append("meta is not an object")
    else:
        if not meta.get("tagline"):
            issues.append("meta.tagline missing (UI swaps it into the header)")
        lu = meta.get("last_updated")
        if lu and (not isinstance(lu, str) or not _ISO_DATE_RE.match(lu)):
            issues.append(f"meta.last_updated '{lu}' is not YYYY-MM-DD")

    shows = data.get("shows")
    if not isinstance(shows, list):
        issues.append("shows is not a list")
        return issues

    for i, show in enumerate(shows):
        issues.extend(validate_show(show, idx=i))

    # Dedupe check.
    seen: dict[tuple, int] = {}
    for i, show in enumerate(shows):
        key = (norm_artist(show.get("artist") or ""), show.get("date") or "",
               show.get("time") or "", norm_location(show.get("location") or ""))
        if key in seen and all(key):
            issues.append(f"shows[{i}] duplicates shows[{seen[key]}] (key={key})")
        else:
            seen[key] = i

    return issues


def print_validation(issues: list[str], shows_total: int) -> None:
    if not issues:
        print(f"  ✓ validation passed ({shows_total} shows)")
        return
    print(f"  ⚠ {len(issues)} issue(s):")
    for msg in issues[:50]:
        print(f"      - {msg}")
    if len(issues) > 50:
        print(f"      ({len(issues) - 50} more)")


def _sort_time_key(t: Optional[str]) -> int:
    if not t:
        return 99_999
    try:
        h, m = t.split(":")
        hi, mi = int(h), int(m)
    except ValueError:
        return 99_999
    return (hi + 24 if hi < 6 else hi) * 60 + mi


# ---------- Main ---------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", help="Only operate on shows matching this ISO date")
    parser.add_argument("--only", choices=list(SOURCES), action="append",
                        help="Restrict scraping to these sources")
    parser.add_argument("--no-scrape", action="store_true",
                        help="Skip scraping; just resolve existing shows")
    parser.add_argument("--no-resolve", action="store_true",
                        help="Skip resolution; just scrape")
    parser.add_argument("--force-resolve", action="store_true",
                        help="Re-resolve every matching show (slow, thorough)")
    parser.add_argument("--upgrade-fallbacks", action="store_true",
                        help="Only re-resolve rows without a playable preview "
                             "(upgrades YouTube/Spotify fallbacks; leaves "
                             "working Deezer/Apple rows alone)")
    parser.add_argument("--skip", default="",
                        help="Comma-separated resolvers to skip: deezer,itunes,youtube")
    parser.add_argument("--workers", type=int, default=4,
                        help="Resolver thread count (default 4)")
    parser.add_argument("--query", help="One-off: resolve a single query and print the result")
    parser.add_argument("--dry-run", action="store_true", help="Do not write sampler.json")
    parser.add_argument("--validate", action="store_true",
                        help="Audit sampler.json against the UI schema and exit")
    args = parser.parse_args()

    skip_set = {x.strip().lower() for x in args.skip.split(",") if x.strip()}

    # One-off lookup mode
    if args.query:
        track = resolve_track(args.query, skip=skip_set)
        print(json.dumps(track, indent=2, ensure_ascii=False))
        return 0

    data = load_existing()

    # Audit-only mode
    if args.validate:
        issues = validate_json(data)
        print_validation(issues, len(data.get("shows") or []))
        return 1 if issues else 0

    # Scrape
    gathered: list[Show] = []
    if not args.no_scrape:
        sources = args.only or list(SOURCES)
        for label in sources:
            url = SOURCES[label]
            print(f"→ Fetching {label}: {url}")
            try:
                html = fetch(url)
            except (URLError, HTTPError, TimeoutError) as e:
                print(f"  ! fetch failed: {e}")
                continue
            try:
                if label == "nojazzfest":
                    found = scrape_nojazzfest(html)
                elif label == "jazzfestgrids":
                    found = scrape_jazzfestgrids(html)
                elif label == "nola.show":
                    found = scrape_nola_show(html)
                else:
                    found = []
            except Exception as e:
                print(f"  ! parse failed: {e}")
                continue
            print(f"  ✓ parsed {len(found)} show(s)")
            gathered.extend(found)

    merged, added, updated = merge(data.get("shows", []), gathered, only_date=args.date)
    merged, dropped_bare = dedupe_bare_rows(merged)
    if dropped_bare:
        print(f"  ✓ collapsed {dropped_bare} bare nojazzfest row(s) into detailed matches")
    reclassified = reclassify_fair_grounds_stages(merged)
    if reclassified:
        print(f"  ✓ reclassified {reclassified} Fairgrounds stage row(s)")
    overridden = apply_artist_overrides(merged)
    if overridden:
        print(f"  ✓ applied {overridden} artist override(s) — stale tracks cleared for re-resolve")
    data["shows"] = merged

    # Resolve
    resolve_stats = {}
    if not args.no_resolve:
        resolve_stats = resolve_shows(
            merged,
            force=args.force_resolve,
            skip=skip_set,
            workers=args.workers,
            only_date=args.date,
            upgrade_only=args.upgrade_fallbacks,
        )

    merged.sort(key=lambda s: (
        s.get("date") or "9999",
        _sort_time_key(s.get("time")),
        (s.get("location") or "").lower(),
    ))
    data["shows"] = merged
    save(data, dry_run=args.dry_run)

    # Audit what we just produced against the UI's schema.
    issues = validate_json(data)
    print_validation(issues, len(data.get("shows") or []))

    print(f"\nScrape: +{added} new, ~{updated} updated, {len(merged)} total.")
    if resolve_stats:
        p = sum(v for k, v in resolve_stats.items() if k.endswith("_play"))
        o = sum(v for k, v in resolve_stats.items() if k.endswith("_open"))
        s = resolve_stats.get("search", 0)
        print(f"Resolve: {p} playable · {o} open-link · {s} search-only")
        print(f"         ({resolve_stats})")
    return 0


def prompt_for_end_date() -> Optional[str]:
    """Ask the user for an end date. The scraper then pulls every festival
    day from today through the chosen end (inclusive). Returns ISO or None."""
    print()
    print("  Jazz Fest 2026 Sampler · scraper")
    print()
    today = datetime.now().strftime("%Y-%m-%d")
    start = max(today, DAYS[0]["iso"])
    if start > DAYS[-1]["iso"]:
        print(f"  Today ({today}) is past the festival. Nothing to scrape.")
        return None
    print(f"  Will scrape from {start} through an end date you pick.")
    print()
    print("  Pick the end date:")
    for i, day in enumerate(DAYS, 1):
        marker = "   ← today" if day["iso"] == today else ""
        in_range = "   (in range)" if day["iso"] >= start else ""
        print(f"    [{i:>2}]  {day['label']:<14}  {day['badge']}{marker or in_range}")
    print()
    while True:
        try:
            raw = input("  End day number (1-11), YYYY-MM-DD, or blank to cancel: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return None
        if not raw:
            return None
        if raw.isdigit():
            idx = int(raw) - 1
            if 0 <= idx < len(DAYS):
                return DAYS[idx]["iso"]
        elif re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
            return raw
        print("  Didn't understand that. Try again.")


def interactive_main() -> int:
    end = prompt_for_end_date()
    if not end:
        print("  Cancelled.")
        return 0

    target_dates = dates_in_range(end)
    if not target_dates:
        print(f"\n  No festival days between today and {end}.")
        return 0
    sorted_dates = sorted(target_dates)
    span = sorted_dates[0] if len(sorted_dates) == 1 else f"{sorted_dates[0]} through {sorted_dates[-1]}"
    print(f"\n  → Working on {len(target_dates)} day(s): {span}\n")

    data = load_existing()

    # Offer to sweep obvious bad entries out of the existing file before adding
    # anything new. Past scraper bugs may have left paragraph-as-artist rows.
    bad = [s for s in data.get("shows", []) if not looks_like_artist(s.get("artist", ""))]
    if bad:
        print(f"  ⚠ Found {len(bad)} bad entry(ies) already in sampler.json:")
        for s in bad[:5]:
            artist = (s.get("artist") or "")[:70]
            suffix = "…" if len(s.get("artist") or "") > 70 else ""
            print(f"      - {artist}{suffix}")
        if len(bad) > 5:
            print(f"      ({len(bad) - 5} more)")
        try:
            resp = input("  Remove them? [Y/n]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            resp = "n"
        if resp in ("", "y", "yes"):
            data["shows"] = [s for s in data["shows"] if looks_like_artist(s.get("artist", ""))]
            print(f"  ✓ removed {len(bad)} bad entries\n")
        else:
            print()

    # Scrape each source once and filter to the target date range.
    gathered: list[Show] = []
    for label, url in SOURCES.items():
        print(f"  → Fetching {label}")
        try:
            html = fetch(url)
        except (URLError, HTTPError, TimeoutError) as e:
            print(f"    ! fetch failed: {e}")
            continue
        try:
            if label == "nojazzfest":
                found = scrape_nojazzfest(html)
            elif label == "jazzfestgrids":
                found = scrape_jazzfestgrids(html)
            elif label == "nola.show":
                found = scrape_nola_show(html)
            else:
                found = []
        except Exception as e:
            print(f"    ! parse failed: {e}")
            continue
        found_in_range = [s for s in found if not s.date or s.date in target_dates]
        print(f"    ✓ {len(found_in_range)} show(s) in range")
        gathered.extend(found_in_range)

    merged, added, updated = merge(data.get("shows", []), gathered, only_date=target_dates)
    merged, dropped_bare = dedupe_bare_rows(merged)
    reclassified = reclassify_fair_grounds_stages(merged)
    overridden = apply_artist_overrides(merged)
    data["shows"] = merged
    extras = []
    if dropped_bare:
        extras.append(f"collapsed {dropped_bare} bare row(s)")
    if reclassified:
        extras.append(f"reclassified {reclassified} Fairgrounds row(s)")
    if overridden:
        extras.append(f"{overridden} artist override(s) applied")
    extra = " · " + " · ".join(extras) if extras else ""
    print(f"\n  Scrape: +{added} new, ~{updated} updated{extra}")

    # Resolve tracks for every date in the range.
    print()
    stats = resolve_shows(merged, force=False, skip=set(), workers=4, only_date=target_dates)

    merged.sort(key=lambda s: (
        s.get("date") or "9999",
        _sort_time_key(s.get("time")),
        (s.get("location") or "").lower(),
    ))
    data["shows"] = merged
    save(data, dry_run=False)

    # Audit against the UI's schema so we notice regressions right away.
    issues = validate_json(data)
    print()
    print_validation(issues, len(data.get("shows") or []))

    if stats:
        p = sum(v for k, v in stats.items() if k.endswith("_play"))
        o = sum(v for k, v in stats.items() if k.endswith("_open"))
        s = stats.get("search", 0)
        print(f"\n  Resolve: {p} playable · {o} link · {s} search")

    range_shows = [s for s in merged if s.get("date") in target_dates]
    print(f"\n  ✓ Saved. Range has {len(range_shows)} show(s) in sampler.json.")
    return 0


if __name__ == "__main__":
    # Windows consoles default to cp1252 which chokes on ✓/⚠/→ etc.
    # Reconfiguring here keeps our progress output portable without surgery
    # on every print statement.
    for stream in (sys.stdout, sys.stderr):
        # reconfigure() exists on TextIOWrapper (the actual runtime type) but
        # not on TextIO (what type stubs expose), so Pylance flags direct
        # access. Fetch dynamically to keep the tool quiet.
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

    # Default behavior when you just "Run Python File" in VS Code (no args):
    # walk today's rows and try to upgrade YouTube/Spotify fallbacks into real
    # Deezer/Apple previews. Leaves already-playable rows alone so every run
    # is cheap and strictly improves the catalog. Run with --force-resolve
    # for a full refresh, or -i / --interactive for the date-picker prompt.
    if len(sys.argv) == 1:
        today = datetime.now().strftime("%Y-%m-%d")
        target = max(today, DAYS[0]["iso"])
        if target > DAYS[-1]["iso"]:
            print(f"  Past the end of Jazz Fest 2026 ({DAYS[-1]['iso']}). "
                  "Nothing to do — run with -i to pick any day.")
            sys.exit(0)
        print(f"  → Quick run: upgrading fallback rows on {target} (no scrape)\n")
        sys.argv += ["--no-scrape", "--upgrade-fallbacks", "--date", target]
    elif sys.argv[1] in ("-i", "--interactive"):
        sys.argv.pop(1)
        sys.exit(interactive_main())

    sys.exit(main())
