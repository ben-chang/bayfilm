"""Run all theater scrapers and write site/data/showtimes.json.

Usage: python -m scraper.main [--only theater_id]
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from dataclasses import asdict
from datetime import date, datetime, timezone
from pathlib import Path

from .model import THEATERS
from .theaters import SCRAPERS

OUTPUT = Path(__file__).resolve().parent.parent / "site" / "data" / "showtimes.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="run a single scraper by theater id")
    args = parser.parse_args()

    today = date.today().isoformat()
    all_screenings = []
    errors = []
    if args.only and OUTPUT.exists():
        # keep other theaters' existing screenings when re-running one scraper
        prior = json.loads(OUTPUT.read_text())["screenings"]
        from .model import Screening
        all_screenings += [
            Screening(**{k: s.get(k) for k in ("theater", "title", "date", "time", "url", "note")})
            for s in prior if s["theater"] != args.only and s["date"] >= today
        ]
    for theater_id, scrape in SCRAPERS:
        if args.only and theater_id != args.only:
            continue
        try:
            results = scrape()
        except Exception as e:
            errors.append(theater_id)
            print(f"[FAIL] {theater_id}: {e}", file=sys.stderr)
            traceback.print_exc()
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
        print(f"Failed scrapers: {', '.join(errors)}", file=sys.stderr)
    return 1 if errors and not all_screenings else 0


if __name__ == "__main__":
    sys.exit(main())
