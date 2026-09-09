"""Poster + release-year enrichment via TMDb (themoviedb.org).

Looks up each film title and prefers TMDb's canonical poster over whatever
image the theater site had, and records the release year (the frontend's
new-release/revival filter reads it). Needs TMDB_API_KEY in the environment;
without it, lookups are skipped and only cached results are used.

Results (including misses) are cached in tmdb_cache.json, which is committed
so CI runs reuse lookups and still get posters even if the key is absent.
Cache values are {"img": url|null, "year": int|null}; legacy entries are
bare poster URLs — they keep their poster and get a year on the next keyed
run. The file stays one title per line so a bad match can be fixed by
deleting its line.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import requests

from .util import USER_AGENT

CACHE_PATH = Path(__file__).resolve().parent / "tmdb_cache.json"
SEARCH_URL = "https://api.themoviedb.org/3/search/movie"
IMG_BASE = "https://image.tmdb.org/t/p/w342"

YEAR_RE = re.compile(r"\((19|20)\d{2}\)")
ANNIV_RE = re.compile(r"\b(\d+)(?:th|st|nd|rd)\s+anniversary\b", re.I)
NOISE_RES = [
    re.compile(r"\([^)]*\)"),                          # any parenthetical
    re.compile(r"\bin\s+(70|35|16)\s*mm\b.*$", re.I),  # "in 70MM", trailing
    re.compile(r"\b(70|35|16)\s*mm\b", re.I),
    re.compile(r"\b(in\s+)?4k(\s+restoration)?\b", re.I),
    re.compile(r"\bnewly\s+struck\b", re.I),
    re.compile(r"\b\d+(?:th|st|nd|rd)\s+anniversary\b", re.I),
    re.compile(r"\bremaster(?:ed)?\b", re.I),
]


def clean_title(title: str) -> tuple[str, str | None]:
    """'Angel Heart (1987) in 70MM' -> ('Angel Heart', '1987')."""
    m = YEAR_RE.search(title)
    year = m.group(0)[1:-1] if m else None
    if not year:
        # "30th Anniversary" ≈ released N years ago (approximate — used as a
        # ranking hint, never as a hard search filter)
        m = ANNIV_RE.search(title)
        if m:
            year = str(date.today().year - int(m.group(1)))
    t = title
    for pat in NOISE_RES:
        t = pat.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—:·")
    return t, year


def _pick(results: list[dict], year: str | None) -> dict | None:
    """Best search result: nearest the year hint, posters preferred."""
    cands = [r for r in results if r.get("poster_path")] or results
    if not cands:
        return None
    if year:
        def dist(r):
            rel = (r.get("release_date") or "")[:4]
            return abs(int(rel) - int(year)) if rel.isdigit() else 999
        return min(cands, key=dist)
    return cands[0]


def enrich(titles: set[str], films: dict[str, dict]) -> None:
    key = os.environ.get("TMDB_API_KEY")
    cache: dict[str, dict] = {}
    if CACHE_PATH.exists():
        cache = {
            k: v if isinstance(v, dict) else {"img": v}
            for k, v in json.loads(CACHE_PATH.read_text()).items()
        }

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    looked_up = hits = 0
    for title in sorted(titles):
        k = title.lower()
        entry = cache.get(k)
        if key and (entry is None or "year" not in entry):
            query, year = clean_title(title)
            if len(query) < 2:
                cache[k] = {"img": None, "year": None}
            else:
                def search(params):
                    try:
                        resp = session.get(SEARCH_URL, params=params, timeout=15)
                        resp.raise_for_status()
                        return resp.json().get("results", [])
                    except Exception as e:
                        print(f"[tmdb] lookup failed for {title!r}: {e}",
                              file=sys.stderr)
                        return None  # not cached — retried next run

                params = {"api_key": key, "query": query, "include_adult": "false"}
                if year:
                    params["year"] = year
                results = search(params)
                if results == [] and "year" in params:
                    # the year hint can be off (anniversary math, re-release
                    # years) — retry unfiltered rather than caching a miss
                    del params["year"]
                    results = search(params)
                if results is not None:
                    best = _pick(results, year)
                    # a legacy entry keeps its poster (only the year is new)
                    img = (entry or {}).get("img") or (
                        IMG_BASE + best["poster_path"]
                        if best and best.get("poster_path") else None)
                    rel = (best or {}).get("release_date") or ""
                    cache[k] = {"img": img,
                                "year": int(rel[:4]) if rel[:4].isdigit() else None}
                    looked_up += 1
        entry = cache.get(k)
        if entry and entry.get("img"):
            films.setdefault(k, {})["img"] = entry["img"]
            hits += 1
        if entry and entry.get("year") is not None:
            films.setdefault(k, {})["year"] = entry["year"]

    body = ",\n".join(
        f"{json.dumps(k, ensure_ascii=False)}: "
        f"{json.dumps(v, ensure_ascii=False, sort_keys=True)}"
        for k, v in sorted(cache.items()))
    CACHE_PATH.write_text("{\n" + body + "\n}")
    src = "TMDb" if key else "TMDb cache (no TMDB_API_KEY set)"
    print(f"[tmdb] posters for {hits}/{len(titles)} titles via {src} "
          f"({looked_up} new lookups)")
