"""Run all theater scrapers and write site/data/showtimes.json.

Usage: python -m scraper.main [--only theater_id]

If a scraper fails (some theater sites block cloud/datacenter IPs), that
theater's still-upcoming screenings from the existing output file are kept,
so a bad run degrades to stale data instead of an empty theater.
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from dataclasses import asdict
from datetime import date, datetime, timezone
from pathlib import Path

from .model import THEATERS, Screening
from .theaters import SCRAPERS

OUTPUT = Path(__file__).resolve().parent.parent / "site" / "data" / "showtimes.json"


def load_prior(today: str) -> dict[str, list[Screening]]:
    """Upcoming screenings from the existing output file, keyed by theater."""
    prior: dict[str, list[Screening]] = {}
    if OUTPUT.exists():
        for s in json.loads(OUTPUT.read_text())["screenings"]:
            if s["date"] >= today:
                prior.setdefault(s["theater"], []).append(
                    Screening(**{k: s.get(k) for k in
                                 ("theater", "title", "date", "time", "url", "note")})
                )
    return prior


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="run a single scraper by theater id")
    args = parser.parse_args()

    today = date.today().isoformat()
    prior = load_prior(today)
    all_screenings = []
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
        kept = [s for s in results if s.date >= today and s.title]
        print(f"[ ok ] {theater_id}: {len(kept)} screenings "
              f"({len(results) - len(kept)} past/dropped)")
        all_screenings += kept

    all_screenings.sort(key=lambda s: (s.date, s.time or "99:99", s.theater, s.title))

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "theaters": {tid: asdict(t) for tid, t in THEATERS.items()},
        "screenings": [s.to_dict() for s in all_screenings],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"\nWrote {len(all_screenings)} screenings to {OUTPUT}")
    if errors:
        print(f"Failed scrapers (kept previous data): {', '.join(errors)}",
              file=sys.stderr)
    return 1 if errors and not all_screenings else 0


if __name__ == "__main__":
    sys.exit(main())
