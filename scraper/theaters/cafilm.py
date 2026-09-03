"""California Film Institute (cinema.cafilm.org) — Smith Rafael Film Center
and the Sequoia share one server-rendered site. /schedule enumerates film
slugs; each /film/{slug} page carries every showing with an explicit date
(cal_date link), an AM/PM time button, and a venue code (RAF* = Rafael,
Sequoia* = Sequoia). One crawl serves both theaters; venue is per-showing
(a film can play both houses)."""
from __future__ import annotations

import re
import time
from datetime import date

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_12h, clean_text, uncaps

BASE = "https://cinema.cafilm.org"

SLUG_RE = re.compile(r"/film/([a-z0-9-]+)")
CAL_DATE_RE = re.compile(r"cal_date=(\d{4}-\d{2}-\d{2})")
TICKET_RE = re.compile(r"openTicketModal\('([^']+)'\)")

_cache: list[tuple[str, Screening]] | None = None  # (venue_code, screening)


def _crawl() -> list[tuple[str, Screening]]:
    slugs = sorted(set(SLUG_RE.findall(fetch(f"{BASE}/schedule"))))
    results: list[tuple[str, Screening]] = []
    for slug in slugs:
        soup = BeautifulSoup(fetch(f"{BASE}/film/{slug}"), "html.parser")
        title_el = soup.find("div", class_=re.compile(r"\btext-2xl\b"))
        if not title_el:
            continue
        title = uncaps(clean_text(title_el.get_text()))
        desc_el = soup.select_one("section > p")
        desc = clean_text(desc_el.get_text(" ")) if desc_el else None
        img = f"{BASE}/drive_serve/{slug}/0-600.webp"
        for btn in soup.find_all("button", onclick=TICKET_RE):
            t = parse_time_12h(btn.get_text())
            block = btn.parent
            cal = block.find("a", href=CAL_DATE_RE) if block else None
            venue_el = block.select_one("button.venue-link[data-venue]") if block else None
            if not (t and cal and venue_el):
                continue
            iso = CAL_DATE_RE.search(cal["href"]).group(1)
            url = TICKET_RE.search(btn["onclick"]).group(1)
            url = url.replace("\\/", "/").replace("\\u0026", "&")
            results.append(
                (venue_el["data-venue"],
                 Screening("", title, iso, t, url, desc=desc, img=img))
            )
        time.sleep(0.2)
    return results


def scrape(theater_id: str, venue_prefix: str) -> list[Screening]:
    global _cache
    if _cache is None:
        _cache = _crawl()
    out = []
    for venue, s in _cache:
        if venue.lower().startswith(venue_prefix.lower()):
            out.append(Screening(theater_id, s.title, s.date, s.time, s.url,
                                 desc=s.desc, img=s.img))
    return out
