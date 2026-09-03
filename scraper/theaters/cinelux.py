"""CineLux chain (cineluxtheatres.com, "CinemaPlus" platform) — one
server-rendered page per day, ?date=YYYY-MM-DD."""
from __future__ import annotations

import time
from datetime import date, timedelta

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_12h, clean_text, uncaps

DAYS_AHEAD = 7


def scrape(theater_id: str, slug: str) -> list[Screening]:
    today = date.today()
    screenings: list[Screening] = []
    for offset in range(DAYS_AHEAD):
        day = (today + timedelta(days=offset)).isoformat()
        soup = BeautifulSoup(
            fetch(f"https://www.cineluxtheatres.com/{slug}?date={day}"), "html.parser"
        )
        for card in soup.select("div.cin-movie-card"):
            title_el = card.select_one("h3 a")
            if not title_el:
                continue
            title = uncaps(clean_text(title_el.get_text()))
            img_el = card.select_one("img.cin-showtimes-poster-img")
            img = img_el.get("src") if img_el else None
            for a in card.select("a.cin-showtimes-button"):
                t = parse_time_12h(a.get_text())  # "12:30p" / "11:00a"
                if t:
                    screenings.append(
                        Screening(theater_id, title, day, t, a.get("href"), img=img)
                    )
        time.sleep(0.3)
    return screenings
