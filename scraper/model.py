"""Shared data model for the showtime aggregator."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class Theater:
    id: str
    name: str
    city: str
    url: str


@dataclass
class Screening:
    theater: str          # Theater.id
    title: str
    date: str             # YYYY-MM-DD (local)
    time: str | None      # HH:MM 24-hour, None if unknown
    url: str | None = None    # ticket / film info link
    note: str | None = None   # e.g. "70mm", "Q&A with director"

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


THEATERS: dict[str, Theater] = {
    t.id: t
    for t in [
        Theater("roxie", "Roxie Theater", "San Francisco", "https://roxie.com"),
        Theater("balboa", "Balboa Theater", "San Francisco", "https://www.balboamovies.com"),
        Theater("4star", "4 Star Theater", "San Francisco", "https://www.4-star-movies.com"),
        Theater("newmission", "Alamo Drafthouse New Mission", "San Francisco", "https://drafthouse.com/sf"),
        Theater("bampfa", "BAMPFA", "Berkeley", "https://bampfa.org"),
        Theater("grandlake", "Grand Lake Theatre", "Oakland", "https://renaissancerialto.com"),
        Theater("stanford", "Stanford Theatre", "Palo Alto", "https://stanfordtheatre.org"),
    ]
}
