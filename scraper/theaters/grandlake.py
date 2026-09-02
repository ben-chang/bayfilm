"""Grand Lake Theatre (Oakland) — static homepage with weekly day/time listings."""
from __future__ import annotations

import re
from datetime import date

from bs4 import BeautifulSoup

from ..model import Screening
from ..util import fetch, parse_time_bare, expand_day_tokens, clean_text

HOME_URL = "https://renaissancerialto.com/"
TICKETS_URL = "http://73279.formovietickets.com:2235/"

# "FRI: 3:15, 7:00" — day token(s) followed by a colon and times
DAY_LINE_RE = re.compile(
    r"\b((?:MON|TUE|TUES|WED|THUR|THURS|THU|FRI|SAT|SUN|DAILY)"
    r"(?:\s*[-/&]\s*(?:MON|TUE|TUES|WED|THUR|THURS|THU|FRI|SAT|SUN))*)\s*:\s*"
    r"([\d:,\s]+)",
    re.I,
)


def scrape() -> list[Screening]:
    soup = BeautifulSoup(fetch(HOME_URL), "html.parser")
    today = date.today()
    screenings: list[Screening] = []
    for pod in soup.select("div.movPod"):
        title_el = pod.select_one("h3.movTitle")
        if not title_el:
            continue
        title = clean_text(title_el.get_text())
        # theaternum spans inject screen numbers right after each time ("3:15" + "1")
        for span in pod.select("span.theaternum"):
            span.decompose()
        seen: set[tuple[str, str]] = set()
        for p in pod.select("p.movPrev"):
            text = clean_text(p.get_text(" "))
            for m in DAY_LINE_RE.finditer(text):
                days, times_text = m.group(1), m.group(2)
                times = [
                    t for chunk in times_text.split(",")
                    if (t := parse_time_bare(chunk))
                ]
                for d in expand_day_tokens(days, today):
                    for t in times:
                        key = (d.isoformat(), t)
                        if key not in seen:
                            seen.add(key)
                            screenings.append(
                                Screening("grandlake", title, d.isoformat(), t, TICKETS_URL)
                            )
    return screenings
