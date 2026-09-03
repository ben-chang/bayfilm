"""Fandango napi — used for Lee Neighborhood Theatres (Marina, Presidio),
whose own site (lntsf.com) carries no showtimes.

One theaterCalendar call for the date list, then one theaterMovieShowtimes
call per date (~8 days out).
"""
from __future__ import annotations

import re
import time

import requests

from ..model import Screening
from ..util import USER_AGENT, clean_text

CALENDAR_URL = "https://www.fandango.com/napi/theaterCalendar/{tid}"
SHOWTIMES_URL = "https://www.fandango.com/napi/theaterMovieShowtimes/{tid}?startDate={date}"

# Fandango's WAF 403s bare requests; a browsery header set flips it to 200.
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.fandango.com/",
}

YEAR_SUFFIX = re.compile(r"\s*\((19|20)\d{2}\)$")


def _get(url: str) -> dict:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def scrape(theater_id: str, fandango_tid: str) -> list[Screening]:
    dates = _get(CALENDAR_URL.format(tid=fandango_tid)).get("showtimeDates") or []
    screenings: list[Screening] = []
    for day in dates:
        data = _get(SHOWTIMES_URL.format(tid=fandango_tid, date=day))
        for movie in (data.get("viewModel") or {}).get("movies") or []:
            title = clean_text(YEAR_SUFFIX.sub("", movie.get("title") or ""))
            if not title:
                continue
            img = ((movie.get("poster") or {}).get("size") or {}).get("300")
            for variant in movie.get("variants") or []:
                for group in variant.get("amenityGroups") or []:
                    for show in group.get("showtimes") or []:
                        if show.get("expired"):
                            continue
                        # ticketingDate: "2026-09-05+15:30" (local Pacific)
                        ticketing = show.get("ticketingDate") or ""
                        date_part, _, time_part = ticketing.partition("+")
                        if date_part != day:
                            continue
                        screenings.append(
                            Screening(theater_id, title, date_part,
                                      time_part[:5] or None,
                                      show.get("ticketingJumpPageURL"), img=img)
                        )
        time.sleep(0.5)
    return screenings
