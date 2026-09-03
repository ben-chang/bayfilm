"""Webedia Movies Pro platform (Boxoffice API proxied on the theater's own
domain) — used by Vine Cinema and the Landmark chain sites.

Two calls: POST /schedule for showtimes, GET /movies?ids=… for titles,
posters, and synopses.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from ..model import Screening
from ..util import fetch_json, post_json, clean_text

DAYS_AHEAD = 21


def _clean_title(title: str, original: str | None) -> str:
    """Prefer the clean originalTitle, but only when the display title is
    just the original plus editorial decoration (e.g. "EMPIRE WEEK Sept.
    4-10: Star Wars…") — for foreign films originalTitle is the
    untranslated title, which we don't want."""
    title = clean_text(title)
    if original:
        original = clean_text(original)
        # "Hope (Hopeu)" -> "Hope": the parenthetical is just the original
        if title.lower().endswith(f"({original.lower()})"):
            return clean_text(title[: title.lower().rfind("(")])
        if original.lower() in title.lower() and original.lower() != title.lower():
            return original
    return title


_schedule_cache: dict[tuple, dict] = {}


def _fetch_schedules(base_url: str, api_ids: tuple[str, ...]) -> dict:
    """One POST covering every theater on a domain. The Landmark CDN caches
    schedule responses loosely across differing POST bodies, so per-theater
    requests can get another request's cached body — always ask for the
    full set (as the site's own frontend does) and slice per theater."""
    key = (base_url, api_ids)
    if key not in _schedule_cache:
        today = date.today()
        _schedule_cache[key] = post_json(
            f"{base_url}/api/gatsby-source-boxofficeapi/schedule",
            {
                "theaters": [{"id": i, "timeZone": "America/Los_Angeles"} for i in api_ids],
                "from": today.isoformat(),
                "to": (today + timedelta(days=DAYS_AHEAD)).isoformat(),
            },
        )
    return _schedule_cache[key]


def scrape(theater_id: str, base_url: str, api_theater_id: str,
           all_api_ids: tuple[str, ...] | None = None) -> list[Screening]:
    data = _fetch_schedules(base_url, all_api_ids or (api_theater_id,))
    schedule = data[api_theater_id]["schedule"]

    movies: dict[str, dict] = {}
    movie_ids = list(schedule)
    for i in range(0, len(movie_ids), 40):
        chunk = movie_ids[i:i + 40]
        url = f"{base_url}/api/gatsby-source-boxofficeapi/movies?" + "&".join(
            f"ids={mid}" for mid in chunk
        )
        for m in fetch_json(url):
            movies[str(m["id"])] = m

    screenings: list[Screening] = []
    for movie_id, dates in schedule.items():
        m = movies.get(str(movie_id), {})
        title = _clean_title(m.get("title") or "", m.get("originalTitle"))
        if not title:
            continue
        desc = clean_text(m["synopsis"]) if m.get("synopsis") else None
        img = m.get("poster") or None
        for day, shows in dates.items():
            for show in shows:
                if show.get("isExpired"):
                    continue
                starts = show.get("startsAt") or ""  # local: 2026-09-04T21:00:00
                url = None
                for t in (show.get("data") or {}).get("ticketing") or []:
                    if t.get("urls"):
                        url = t["urls"][0]
                        if t.get("provider") == "default":
                            break
                screenings.append(
                    Screening(theater_id, title, starts[:10] or day,
                              starts[11:16] or None, url, desc=desc, img=img)
                )
    return screenings
