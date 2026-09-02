"""Veezi ticketing feed — shared by CinemaSF theaters (Balboa, 4 Star)."""
from __future__ import annotations

import re
from datetime import date

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_12h, infer_year, clean_text

SESSIONS_URL = "https://ticketing.us.veezi.com/sessions/?siteToken={token}"

# "Wednesday 2, September" (Veezi's odd day-first format)
DATE_RE = re.compile(r"(\d{1,2}),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)", re.I)


def parse_veezi_date(text: str, today: date) -> str | None:
    m = DATE_RE.search(text)
    if not m:
        return None
    from ..util import MONTHS
    return infer_year(MONTHS[m.group(2).lower()], int(m.group(1)), today).isoformat()


def scrape(theater_id: str, site_token: str) -> list[Screening]:
    soup = BeautifulSoup(fetch(SESSIONS_URL.format(token=site_token)), "html.parser")
    today = date.today()
    screenings: list[Screening] = []
    by_date = soup.select_one("#sessionsByDateConent") or soup
    for date_block in by_date.select("div.date"):
        title_el = date_block.select_one("h3.date-title")
        if not title_el:
            continue
        iso = parse_veezi_date(title_el.get_text(), today)
        if not iso:
            continue
        for film in date_block.select("div.film"):
            name_el = film.select_one("h3.title")
            if not name_el:
                continue
            title = clean_text(name_el.get_text())
            for a in film.select("ul.session-times li a"):
                t = parse_time_12h(a.get_text())
                if t:
                    screenings.append(
                        Screening(theater_id, title, iso, t, a.get("href"))
                    )
    return screenings
