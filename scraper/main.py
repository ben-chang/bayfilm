"""Run all theater scrapers and write site/data/showtimes.json.

Usage: python -m scraper.main [--only theater_id]

If a scraper fails (some theater sites block cloud/datacenter IPs), that
theater's still-upcoming screenings from the existing output file are kept —
along with its previous scraped_at, so the frontend can flag stale listings.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import traceback
from dataclasses import asdict
from datetime import date, datetime, timezone
from pathlib import Path

from .model import THEATERS, Screening
from .theaters import SCRAPERS

OUTPUT = Path(__file__).resolve().parent.parent / "site" / "data" / "showtimes.json"

# Special-presentation markers detected in titles/notes -> badge text
FORMAT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b70\s*mm\b", re.I), "70mm"),
    (re.compile(r"\b35\s*mm\b", re.I), "35mm"),
    (re.compile(r"\b16\s*mm\b", re.I), "16mm"),
    (re.compile(r"\blive\s+(score|music|soundtrack)\b", re.I), "live score"),
    (re.compile(r"\bq\s*&\s*a\b|\bq&a\b", re.I), "Q&A"),
    (re.compile(r"\bsing[- ]?along\b", re.I), "sing-along"),
    (re.compile(r"\bdouble\s+feature\b", re.I), "double feature"),
    (re.compile(r"\bsneak\s+preview\b|\badvance\s+screening\b", re.I), "preview"),
    (re.compile(r"\bsilent\b.*\borgan\b|\borgan\b.*\bsilent\b|\bwurlitzer\b", re.I), "live organ"),
]


def detect_formats(s: Screening) -> None:
    text = f"{s.title} {s.note or ''}"
    badges = [badge for pat, badge in FORMAT_PATTERNS if pat.search(text)]
    if badges:
        s.note = ", ".join(dict.fromkeys(badges))


def load_prior() -> tuple[dict[str, list[Screening]], dict[str, str]]:
    """(upcoming screenings by theater, previous scraped_at by theater)."""
    today = date.today().isoformat()
    prior: dict[str, list[Screening]] = {}
    scraped_at: dict[str, str] = {}
    if OUTPUT.exists():
        data = json.loads(OUTPUT.read_text())
        for tid, t in data.get("theaters", {}).items():
            if t.get("scraped_at"):
                scraped_at[tid] = t["scraped_at"]
        films = data.get("films", {})
        for s in data["screenings"]:
            if s["date"] >= today:
                info = films.get(s["title"].lower(), {})
                prior.setdefault(s["theater"], []).append(
                    Screening(
                        **{k: s.get(k) for k in ("theater", "title", "date", "time", "url", "note")},
                        desc=info.get("desc"),
                        img=info.get("img"),
                    )
                )
    return prior, scraped_at


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="run a single scraper by theater id")
    args = parser.parse_args()

    today = date.today().isoformat()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    prior, scraped_at = load_prior()
    all_screenings: list[Screening] = []
    errors = []
    for theater_id, scrape in SCRAPERS:
        if args.only and theater_id != args.only:
            all_screenings += prior.get(theater_id, [])
            continue
        try:
            results = scrape()
        except Exception as e:
            errors.append(theater_id)
            kept = prior.get(theater_id, [])
            print(f"[FAIL] {theater_id}: {e} — keeping {len(kept)} screenings "
                  f"from previous run", file=sys.stderr)
            traceback.print_exc()
            all_screenings += kept
            continue
        scraped_at[theater_id] = now
        kept = [s for s in results if s.date >= today and s.title]
        print(f"[ ok ] {theater_id}: {len(kept)} screenings "
              f"({len(results) - len(kept)} past/dropped)")
        all_screenings += kept

    films: dict[str, dict] = {}
    for s in all_screenings:
        detect_formats(s)
        if s.desc or s.img:
            info = films.setdefault(s.title.lower(), {})
            if s.desc and "desc" not in info:
                info["desc"] = s.desc
            if s.img and "img" not in info:
                info["img"] = s.img

    # canonical posters from TMDb override theater images where available
    from . import tmdb
    tmdb.enrich({s.title for s in all_screenings}, films)

    all_screenings.sort(key=lambda s: (s.date, s.time or "99:99", s.theater, s.title))

    theaters_out = {}
    for tid, t in THEATERS.items():
        theaters_out[tid] = asdict(t)
        if scraped_at.get(tid):
            theaters_out[tid]["scraped_at"] = scraped_at[tid]

    out = {
        "generated_at": now,
        "theaters": theaters_out,
        "films": films,
        "screenings": [s.to_dict() for s in all_screenings],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"\nWrote {len(all_screenings)} screenings, {len(films)} film blurbs to {OUTPUT}")
    if errors:
        print(f"Failed scrapers (kept previous data): {', '.join(errors)}",
              file=sys.stderr)
    return 1 if errors and not all_screenings else 0


if __name__ == "__main__":
    sys.exit(main())
