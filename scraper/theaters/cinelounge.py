"""Cinelounge Tiburon — Indy Cinema Group platform; public GraphQL API.
Showtime `time` values are UTC and must be converted to Pacific."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

from ..model import Screening
from ..util import USER_AGENT, clean_text, uncaps

GRAPHQL_URL = "https://www.cineloungefilm.com/graphql"
HEADERS = {"User-Agent": USER_AGENT, "site-id": "173", "client-type": "consumer"}
PACIFIC = ZoneInfo("America/Los_Angeles")

DATES_QUERY = "query { datesWithShowing { value } }"
SHOWINGS_QUERY = """query {
  showingsForDate(date: "%s") {
    data { id time movie { name synopsis posterImage } }
  }
}"""


def _query(q: str) -> dict:
    resp = requests.post(GRAPHQL_URL, json={"query": q}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    if body.get("errors"):
        raise RuntimeError(f"graphql: {body['errors']}")
    return body["data"]


def scrape() -> list[Screening]:
    raw = _query(DATES_QUERY)["datesWithShowing"]["value"]
    dates = json.loads(raw) if isinstance(raw, str) else raw
    screenings: list[Screening] = []
    seen: set[str] = set()
    for day in sorted(dates):
        for show in _query(SHOWINGS_QUERY % day)["showingsForDate"]["data"]:
            if show["id"] in seen:  # UTC crossover can repeat a showing
                continue
            seen.add(show["id"])
            movie = show.get("movie") or {}
            title = uncaps(clean_text(movie.get("name") or ""))
            if not title or not show.get("time"):
                continue
            utc = datetime.fromisoformat(show["time"].replace("Z", "+00:00"))
            local = utc.astimezone(PACIFIC)
            poster = movie.get("posterImage")
            img = f"https://indy-systems.imgix.net/{poster}?w=300&fm=jpg" if poster else None
            screenings.append(
                Screening("cinelounge", title, local.date().isoformat(),
                          local.strftime("%H:%M"),
                          f"https://www.cineloungefilm.com/checkout/showing/{show['id']}",
                          desc=movie.get("synopsis"), img=img)
            )
    return screenings
