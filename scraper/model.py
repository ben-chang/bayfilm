"""Shared data model for the showtime aggregator."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class Theater:
    id: str
    name: str
    city: str
    url: str
    region: str = "SF"  # SF | East Bay | North Bay | Peninsula


@dataclass
class Screening:
    theater: str          # Theater.id
    title: str
    date: str             # YYYY-MM-DD (local)
    time: str | None      # HH:MM 24-hour, None if unknown
    url: str | None = None    # ticket / film info link
    note: str | None = None   # special formats, e.g. "70mm" or "Q&A"
    desc: str | None = None   # film blurb; lifted into the films map by main.py
    img: str | None = None    # poster/thumbnail URL; lifted like desc

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if v is not None}
        d.pop("desc", None)  # descriptions and images live in the films map
        d.pop("img", None)
        return d


THEATERS: dict[str, Theater] = {
    t.id: t
    for t in [
        Theater("roxie", "Roxie Theater", "San Francisco", "https://roxie.com", "SF"),
        Theater("balboa", "Balboa Theater", "San Francisco", "https://www.balboamovies.com", "SF"),
        Theater("4star", "4 Star Theater", "San Francisco", "https://www.4-star-movies.com", "SF"),
        Theater("newmission", "Alamo Drafthouse New Mission", "San Francisco", "https://drafthouse.com/sf", "SF"),
        Theater("bampfa", "BAMPFA", "Berkeley", "https://bampfa.org", "East Bay"),
        Theater("grandlake", "Grand Lake Theatre", "Oakland", "https://renaissancerialto.com", "East Bay"),
        Theater("stanford", "Stanford Theatre", "Palo Alto", "https://stanfordtheatre.org", "Peninsula"),
        Theater("lark", "Lark Theater", "Larkspur", "https://larktheater.net", "North Bay"),
    ]
}
