"""Pruneyard Dine-In Cinemas (Campbell) — Theater Toolkit platform; the
/theater/nowplaying endpoint returns a server-rendered HTML partial per day."""
from __future__ import annotations

import re
import time
from datetime import date, timedelta

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_12h, clean_text, uncaps

BASE = "https://www.pruneyardcinemas.com"
DAYS_AHEAD = 7

ONCLICK_URL = re.compile(r"window\.location\s*=\s*'([^']+)'")


def scrape() -> list[Screening]:
    today = date.today()
    screenings: list[Screening] = []
    for offset in range(DAYS_AHEAD):
        d = today + timedelta(days=offset)
        url = f"{BASE}/theater/nowplaying?locationKey=Pruneyard&date={d.month}/{d.day}/{d.year}"
        soup = BeautifulSoup(fetch(url), "html.parser")
        for item in soup.select("div.nowPlaying__item"):
            title_el = item.select_one(".nowPlaying__movieTitle a")
            if not title_el:
                continue
            title = uncaps(clean_text(title_el.get_text()))
            source = item.select_one("picture source[data-srcset]")
            img = source["data-srcset"].split()[0] if source else None
            for perf in item.select(".performance__item a.button--showtime"):
                span = perf.select_one("span")
                t = parse_time_12h(span.get_text()) if span else None
                if not t:
                    continue
                m = ONCLICK_URL.search(perf.get("onclick") or "")
                ticket = BASE + m.group(1) if m and m.group(1).startswith("/") else None
                screenings.append(Screening("pruneyard", title, d.isoformat(), t, ticket, img=img))
        time.sleep(0.3)
    return screenings
