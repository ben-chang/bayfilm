"""Alamo Drafthouse New Mission (San Francisco) — official JSON schedule API."""
from __future__ import annotations

from ..model import Screening
from ..util import fetch_json

API_URL = "https://drafthouse.com/s/mother/v2/schedule/market/sf"
CINEMA_SLUG = "new-mission"


def scrape() -> list[Screening]:
    data = fetch_json(API_URL)["data"]
    cinemas = {c["id"]: c for m in data["market"] for c in m["cinemas"]}
    cinema_ids = {cid for cid, c in cinemas.items() if c["slug"] == CINEMA_SLUG}

    titles: dict[str, str] = {}
    for p in data["presentations"]:
        show_title = p["show"]["title"]
        super_title = p.get("superTitle")
        # superTitle can be a plain string or {"superTitle", "type", "slug"};
        # skip COLLECTION badges like "Drafthouse Recommends" — they hide the
        # actual film title in compact listings.
        if isinstance(super_title, dict):
            if super_title.get("type") == "COLLECTION":
                super_title = None
            else:
                super_title = super_title.get("superTitle")
        if isinstance(super_title, str) and super_title:
            show_title = f"{super_title}: {show_title}"
        titles[p["slug"]] = show_title

    screenings: list[Screening] = []
    for s in data["sessions"]:
        if s["cinemaId"] not in cinema_ids or s.get("isHidden"):
            continue
        slug = s["presentationSlug"]
        title = titles.get(slug, slug.replace("-", " ").title())
        show_time = s.get("showTimeClt") or ""  # 2026-09-02T18:00:00
        date, _, clock = show_time.partition("T")
        screenings.append(
            Screening(
                "newmission",
                title,
                date or s.get("businessDateClt", ""),
                clock[:5] or None,
                f"https://drafthouse.com/sf/show/{slug}",
            )
        )
    return [s for s in screenings if s.date]
