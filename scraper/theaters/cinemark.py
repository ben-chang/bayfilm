"""Cinemark (CinéArts Santana Row) — server-rendered theater page per day.
Dates and times come from the ticket link's Showtime= ISO param, so no
time-format parsing is needed. Cloudflare-fronted: may 403 from datacenter
IPs (stale-fallback covers CI, like BAMPFA/Stanford)."""
from __future__ import annotations

import time
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, clean_text

DAYS_AHEAD = 7


def scrape(theater_id: str, page_url: str) -> list[Screening]:
    today = date.today()
    screenings: list[Screening] = []
    seen: set[tuple] = set()
    for offset in range(DAYS_AHEAD):
        day = (today + timedelta(days=offset)).isoformat()
        soup = BeautifulSoup(fetch(f"{page_url}?showDate={day}"), "html.parser")
        for block in soup.select("div.showtimeMovieBlock"):
            title_el = block.select_one("h3")
            if not title_el:
                continue
            title = clean_text(title_el.get_text())
            source = block.select_one("picture source[srcset]")
            img = source["srcset"].split()[0] if source else None
            for a in block.select("a.showtime-link[href]"):
                qs = parse_qs(urlparse(a["href"]).query)
                iso = (qs.get("Showtime") or [""])[0]  # 2026-09-06T10:05:00
                if iso[:10] != day:
                    continue
                key = (title, day, iso[11:16])
                if key in seen:
                    continue
                seen.add(key)
                screenings.append(
                    Screening(theater_id, title, day, iso[11:16] or None,
                              "https://www.cinemark.com" + a["href"], img=img)
                )
        time.sleep(0.3)
    return screenings
