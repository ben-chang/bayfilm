"""BAMPFA (Berkeley) — Drupal month-view calendar, filtered to Film events."""
from __future__ import annotations

from datetime import date

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_12h, clean_text

CALENDAR_URL = "https://bampfa.org/visit/calendar"


def _scrape_month(url: str) -> list[Screening]:
    soup = BeautifulSoup(fetch(url), "html.parser")
    screenings: list[Screening] = []
    for td in soup.select("td[data-date]"):
        iso = td["data-date"]
        for ev in td.select("div.calendar-event"):
            # Skip the duplicated popup rendering of each event
            if ev.find_parent(class_="popupboxthing"):
                continue
            cats = [clean_text(li.get_text()) for li in ev.select("ul.calendar_filter li")]
            if "Film" not in cats:
                continue
            title_el = ev.select_one(".title a")
            if not title_el:
                continue
            time_el = ev.select_one(".time")
            t = parse_time_12h(time_el.get_text()) if time_el else None
            href = title_el.get("href", "")
            if href.startswith("/"):
                href = "https://bampfa.org" + href
            # the event's image only appears in its popup twin, matched by id
            img = None
            title_div = ev.select_one(".title[data-id]")
            if title_div:
                img_el = td.select_one(
                    f'.popupboxthing[data-popup="{title_div["data-id"]}"] .image img')
                if img_el and (img_el.get("src") or "").startswith("http"):
                    img = img_el["src"]
            screenings.append(
                Screening("bampfa", clean_text(title_el.get_text()), iso, t, href, img=img)
            )
    return screenings


def scrape() -> list[Screening]:
    today = date.today()
    screenings = _scrape_month(CALENDAR_URL)
    # Try the next month too; skip silently if the URL scheme isn't supported.
    year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    try:
        more = _scrape_month(f"{CALENDAR_URL}?month={year}-{month:02d}")
        seen = {(s.title, s.date, s.time) for s in screenings}
        screenings += [s for s in more if (s.title, s.date, s.time) not in seen]
    except Exception:
        pass
    return [s for s in screenings if s.date >= today.isoformat()]
