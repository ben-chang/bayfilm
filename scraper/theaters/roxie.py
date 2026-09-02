"""Roxie Theater (San Francisco) — server-rendered calendar at roxie.com/calendar."""
from __future__ import annotations

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_12h, clean_text

CALENDAR_URL = "https://roxie.com/calendar/"


def scrape() -> list[Screening]:
    soup = BeautifulSoup(fetch(CALENDAR_URL), "html.parser")
    screenings: list[Screening] = []
    for day in soup.select("div.calendar-block__day[id^=day-]"):
        iso_date = day["id"].removeprefix("day-")  # day-2026-09-02
        for strip in day.select("div.film-strip"):
            title_el = strip.select_one(".film-strip__title a")
            if not title_el:
                continue
            title = clean_text(title_el.get_text())
            url = title_el.get("href")
            times = strip.select(".film-strip__showtimes p a")
            if not times:
                screenings.append(Screening("roxie", title, iso_date, None, url))
            for a in times:
                t = parse_time_12h(a.get_text())
                if t:
                    screenings.append(
                        Screening("roxie", title, iso_date, t, a.get("href") or url)
                    )
    return screenings
