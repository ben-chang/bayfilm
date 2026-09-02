"""Stanford Theatre (Palo Alto) — static festival calendar pages."""
from __future__ import annotations

import re
from datetime import date, timedelta
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_bare, infer_year, clean_text, MONTHS

HOME_URL = "https://stanfordtheatre.org/"

MONTH_NAMES = "|".join(m.capitalize() for m in MONTHS)
# "September 11-13" or "October 30-November 1"
RANGE_RE = re.compile(
    rf"({MONTH_NAMES})\s+(\d{{1,2}})\s*[-–]\s*(?:({MONTH_NAMES})\s+)?(\d{{1,2}})"
)
PLUS_RE = re.compile(r"\(plus\s+([\d:]+)\s+([^)]*)\)", re.I)
TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\b")


def _calendar_links() -> list[str]:
    soup = BeautifulSoup(fetch(HOME_URL), "html.parser")
    links = []
    for a in soup.select("a[href*='calendars/']"):
        href = urljoin(HOME_URL, a["href"])
        if href.endswith(".html") and "index" not in href and href not in links:
            links.append(href)
    return links


def _parse_calendar(url: str, today: date) -> list[Screening]:
    soup = BeautifulSoup(fetch(url), "html.parser")
    screenings: list[Screening] = []
    for cell in soup.select("td.playdate"):
        # The site's HTML has unclosed <td> tags, so the parser nests sibling
        # cells inside each other — only look at this cell's direct children.
        own_ps = cell.find_all("p", recursive=False)
        date_el = next((p for p in own_ps if "date" in (p.get("class") or [])), None)
        if not date_el:
            continue
        m = RANGE_RE.search(clean_text(date_el.get_text()))
        if not m:
            continue
        start = infer_year(MONTHS[m.group(1).lower()], int(m.group(2)), today)
        end_month = MONTHS[m.group(3).lower()] if m.group(3) else start.month
        end = infer_year(end_month, int(m.group(4)), today)
        if end < start:
            end = start
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]

        for p in own_ps:
            if p is date_el or not p.select_one("a"):
                continue
            title = clean_text(p.select_one("a").get_text())
            text = clean_text(p.get_text(" "))
            if not title or not TIME_RE.search(text):
                continue
            # "(plus 3:45 Sat/Sun)" — extra matinee on specific days
            extras: list[tuple[str, set[int]]] = []
            for pm in PLUS_RE.finditer(text):
                t = parse_time_bare(pm.group(1))
                wanted = {
                    i for i, wd in enumerate(
                        ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
                    if wd in pm.group(2).lower()
                }
                if t and wanted:
                    extras.append((t, wanted))
            base_text = PLUS_RE.sub("", text)
            base_text = base_text[len(title):] if base_text.startswith(title) else base_text
            base_times = [parse_time_bare(t) for t in TIME_RE.findall(base_text)]
            base_times = [t for t in base_times if t]
            for d in days:
                iso = d.isoformat()
                for t in base_times:
                    screenings.append(Screening("stanford", title, iso, t, url))
                for t, wanted in extras:
                    if d.weekday() in wanted:
                        screenings.append(Screening("stanford", title, iso, t, url))
    return screenings


def scrape() -> list[Screening]:
    today = date.today()
    screenings: list[Screening] = []
    for url in _calendar_links():
        try:
            screenings += _parse_calendar(url, today)
        except Exception:
            continue
    # De-dupe (home page may link the same calendar twice)
    seen: set[tuple] = set()
    out = []
    for s in screenings:
        key = (s.title, s.date, s.time)
        if key not in seen:
            seen.add(key)
            out.append(s)
    return out
