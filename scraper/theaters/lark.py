"""Lark Theater (Larkspur) — Agile Ticketing public JSON feed."""
from __future__ import annotations

from ..model import Screening
from ..util import fetch_json

FEED_URL = (
    "https://prod1.agileticketing.net/websales/feed.ashx"
    "?guid=fb90deda-265e-4618-8289-7268bfb70ada&showslist=true&format=json"
)


def scrape() -> list[Screening]:
    data = fetch_json(FEED_URL)
    screenings: list[Screening] = []
    for show in data.get("ArrayOfShows", []):
        title = (show.get("Name") or "").strip()
        desc = (show.get("ShortDescription") or "").strip() or None
        img = (show.get("EventImage") or show.get("ThumbImage") or "").strip() or None
        for s in show.get("CurrentShowings", []):
            venue = (s.get("Venue") or {}).get("Name", "")
            if venue and "Lark" not in venue:
                continue
            start = s.get("StartDate") or ""  # 2026-12-04T21:00:00 (local)
            date, _, clock = start.partition("T")
            if not date:
                continue
            screenings.append(
                Screening(
                    "lark",
                    title,
                    date,
                    clock[:5] or None,
                    s.get("LegacyPurchaseLink") or "https://larktheater.net/showtimes/",
                    desc=desc,
                    img=img,
                )
            )
    return screenings
