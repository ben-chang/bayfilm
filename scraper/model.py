"""Shared data model for the showtime aggregator."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class Theater:
    id: str
    name: str
    city: str
    url: str
    region: str = "SF"  # SF | East Bay | North Bay | Peninsula | South Bay


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
        Theater("alamomv", "Alamo Drafthouse Mountain View", "Mountain View", "https://drafthouse.com/sf", "Peninsula"),
        Theater("bampfa", "BAMPFA", "Berkeley", "https://bampfa.org", "East Bay"),
        Theater("grandlake", "Grand Lake Theatre", "Oakland", "https://renaissancerialto.com", "East Bay"),
        Theater("stanford", "Stanford Theatre", "Palo Alto", "https://stanfordtheatre.org", "Peninsula"),
        Theater("vogue", "Vogue Theater", "San Francisco", "https://www.voguemovies.com", "SF"),
        Theater("marina", "Marina Theatre", "San Francisco", "https://www.lntsf.com", "SF"),
        Theater("presidio", "Presidio Theatre", "San Francisco", "https://www.lntsf.com", "SF"),
        Theater("lark", "Lark Theater", "Larkspur", "https://larktheater.net", "North Bay"),
        Theater("rafael", "Smith Rafael Film Center", "San Rafael", "https://cinema.cafilm.org", "North Bay"),
        Theater("sequoia", "Sequoia Cinema", "Mill Valley", "https://cinema.cafilm.org", "North Bay"),
        Theater("cinelounge", "Cinelounge Tiburon", "Tiburon", "https://www.cineloungefilm.com", "North Bay"),
        Theater("vine", "Vine Cinema & Alehouse", "Livermore", "https://www.vinecinema.com", "East Bay"),
        Theater("operaplaza", "Landmark Opera Plaza", "San Francisco", "https://www.landmarktheatres.com/theaters/x00u8-landmark-opera-plaza-cinema-san-francisco/", "SF"),
        Theater("piedmont", "Landmark Piedmont", "Oakland", "https://www.landmarktheatres.com/theaters/x00y7-landmark-piedmont-theatre-oakland/", "East Bay"),
        Theater("aquarius", "Landmark Aquarius", "Palo Alto", "https://www.landmarktheatres.com/theaters/x00tm-landmark-aquarius-theatre-palo-alto/", "Peninsula"),
        Theater("almaden", "CineLux Almaden", "San Jose", "https://www.cineluxtheatres.com/cinelux-almaden-cafe-lounge", "South Bay"),
        Theater("pruneyard", "Pruneyard Cinemas", "Campbell", "https://www.pruneyardcinemas.com", "South Bay"),
        Theater("santanarow", "CinéArts Santana Row", "San Jose", "https://www.cinemark.com/theatres/ca-san-jose/cinemark-cinearts-santana-row", "South Bay"),
    ]
}
