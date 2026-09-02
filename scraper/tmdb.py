"""Poster enrichment via TMDb (themoviedb.org).

Looks up each film title and prefers TMDb's canonical poster over whatever
image the theater site had. Needs TMDB_API_KEY in the environment; without
it, enrichment is skipped and theater images are used as-is.

Results (including misses) are cached in tmdb_cache.json, which is committed
so CI runs reuse lookups and still get posters even if the key is absent.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import requests

from .util import USER_AGENT

CACHE_PATH = Path(__file__).resolve().parent / "tmdb_cache.json"
SEARCH_URL = "https://api.themoviedb.org/3/search/movie"
IMG_BASE = "https://image.tmdb.org/t/p/w342"

YEAR_RE = re.compile(r"\((19|20)\d{2}\)")
NOISE_RES = [
    re.compile(r"\([^)]*\)"),                          # any parenthetical
    re.compile(r"\bin\s+(70|35|16)\s*mm\b.*$", re.I),  # "in 70MM", trailing
    re.compile(r"\b(70|35|16)\s*mm\b", re.I),
    re.compile(r"\b4k(\s+restoration)?\b", re.I),
    re.compile(r"\bnewly\s+struck\b", re.I),
]


def clean_title(title: str) -> tuple[str, str | None]:
    """'Angel Heart (1987) in 70MM' -> ('Angel Heart', '1987')."""
    m = YEAR_RE.search(title)
    year = m.group(0)[1:-1] if m else None
    t = title
    for pat in NOISE_RES:
        t = pat.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—:·")
    return t, year


def enrich(titles: set[str], films: dict[str, dict]) -> None:
    key = os.environ.get("TMDB_API_KEY")
    cache: dict[str, str | None] = {}
    if CACHE_PATH.exists():
        cache = json.loads(CACHE_PATH.read_text())

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    looked_up = hits = 0
    for title in sorted(titles):
        k = title.lower()
        if k not in cache:
            if not key:
                continue
            query, year = clean_title(title)
            if len(query) < 2:
                cache[k] = None
                continue
            params = {"api_key": key, "query": query, "include_adult": "false"}
            if year:
                params["year"] = year
            try:
                resp = session.get(SEARCH_URL, params=params, timeout=15)
                resp.raise_for_status()
                results = resp.json().get("results", [])
            except Exception as e:
                print(f"[tmdb] lookup failed for {title!r}: {e}", file=sys.stderr)
                continue  # not cached — retried next run
            poster = next((r["poster_path"] for r in results if r.get("poster_path")), None)
            cache[k] = IMG_BASE + poster if poster else None
            looked_up += 1
        if cache[k]:
            films.setdefault(k, {})["img"] = cache[k]
            hits += 1

    CACHE_PATH.write_text(json.dumps(cache, indent=0, sort_keys=True, ensure_ascii=False))
    src = "TMDb" if key else "TMDb cache (no TMDB_API_KEY set)"
    print(f"[tmdb] posters for {hits}/{len(titles)} titles via {src} "
          f"({looked_up} new lookups)")
