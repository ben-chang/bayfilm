"""Fetch and parsing helpers shared by theater scrapers."""
from __future__ import annotations

import re
from datetime import date, timedelta

import requests

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 "
    "bayfilm-aggregator/0.1 (personal showtime aggregator)"
)

MONTHS = {
    m.lower(): i
    for i, m in enumerate(
        ["January", "February", "March", "April", "May", "June", "July",
         "August", "September", "October", "November", "December"],
        start=1,
    )
}

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def fetch(url: str, timeout: int = 30) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def fetch_json(url: str, timeout: int = 30) -> dict:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def parse_time_12h(text: str) -> str | None:
    """'6:00 pm' / '7 PM' / '11:30am' -> 'HH:MM' 24-hour."""
    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)", text, re.I)
    if not m:
        return None
    hour = int(m.group(1)) % 12
    minute = int(m.group(2) or 0)
    if m.group(3).lower().startswith("p"):
        hour += 12
    return f"{hour:02d}:{minute:02d}"


def parse_time_bare(text: str) -> str | None:
    """Showtime with no am/pm marker, e.g. '3:15' or '11:30'.

    Convention for movie listings: 10:00-11:59 are matinee AM times,
    everything below 10 is PM.
    """
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    if hour == 12 or 10 <= hour <= 11:
        pass  # 10:00, 11:30, 12:15 -> as-is (matinee / noon)
    elif hour < 10:
        hour += 12
    return f"{hour:02d}:{minute:02d}"


def infer_year(month: int, day: int, today: date) -> date:
    """Pick the year that puts (month, day) closest to today, preferring future."""
    for year in (today.year, today.year + 1, today.year - 1):
        try:
            d = date(year, month, day)
        except ValueError:
            continue
        if timedelta(days=-45) < (d - today) < timedelta(days=320):
            return d
    return date(today.year, month, day)


def expand_day_tokens(token: str, today: date, horizon: int = 7) -> list[date]:
    """Expand 'FRI', 'MON-THUR', 'SAT/SUN', 'DAILY' into concrete dates
    within the next `horizon` days starting today."""
    token = token.strip().lower().rstrip(":")
    window = [today + timedelta(days=i) for i in range(horizon)]
    if token in ("daily", "everyday", "every day"):
        return window

    def day_index(name: str) -> int | None:
        name = name.strip()
        for i, wd in enumerate(WEEKDAYS):
            if wd.startswith(name[:3]):
                return i
        return None

    wanted: set[int] = set()
    for part in re.split(r"[/,&+]| and ", token):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, _, b = part.partition("-")
            ia, ib = day_index(a), day_index(b)
            if ia is None or ib is None:
                continue
            i = ia
            wanted.add(ia)
            while i != ib:
                i = (i + 1) % 7
                wanted.add(i)
        else:
            i = day_index(part)
            if i is not None:
                wanted.add(i)
    return [d for d in window if d.weekday() in wanted]


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()
