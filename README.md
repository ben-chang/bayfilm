# BayFilm

One guide to what's playing at Bay Area independent movie theaters.

A Python scraper pulls each theater's own calendar into a single JSON file,
and a static site renders it two ways: a **board** view (theaters × a real
time axis, so you can see everything playing at 7pm at a glance) and a
**by-film** view (a day's screenings grouped by title across venues). Every
showtime links to that theater's ticket page.

```
theater calendars ──> scraper/ ──> site/data/showtimes.json ──> site/ (static HTML/JS)
```

No frameworks, no database, no build step. The only dependencies are
`requests` and `beautifulsoup4` for the scraper; the site is vanilla
HTML/CSS/JS and can be hosted anywhere that serves files.

## Theaters covered

| Theater | City | Source |
|---|---|---|
| Roxie Theater | San Francisco | roxie.com calendar (server-rendered HTML) |
| Balboa Theater | San Francisco | Veezi ticketing feed (HTML) |
| 4 Star Theater | San Francisco | Veezi ticketing feed (HTML) |
| Alamo Drafthouse New Mission | San Francisco | drafthouse.com JSON schedule API |
| BAMPFA | Berkeley | bampfa.org calendar (HTML, "Film" events only) |
| Grand Lake Theatre | Oakland | renaissancerialto.com homepage (HTML) |
| Stanford Theatre | Palo Alto | stanfordtheatre.org festival calendars (HTML) |

**Not covered (yet):** Vogue (site was unreachable when built — may have
closed), Smith Rafael Film Center (Cloudflare-blocked to scripts), New
Parkway (JS-only app with no accessible feed).

## Quick start

```sh
uv venv && uv pip install requests beautifulsoup4   # once
./refresh.sh                                        # scrape + serve
```

Then open http://localhost:8741. Or run the steps separately:

```sh
.venv/bin/python -m scraper.main        # writes site/data/showtimes.json
python3 -m http.server 8741 -d site     # serve the static site
```

Re-scrape whenever you want fresh listings — theaters usually update their
calendars weekly (most on Fridays), so daily is plenty.

## Project layout

```
bayfilm/
├── scraper/
│   ├── main.py              # runs all scrapers, writes showtimes.json
│   ├── model.py             # Screening dataclass + THEATERS registry
│   ├── util.py              # fetch helpers, time/date parsing
│   └── theaters/
│       ├── __init__.py      # SCRAPERS list — register scrapers here
│       ├── roxie.py         # one module per source...
│       ├── alamo.py
│       ├── veezi.py         # shared by Balboa and 4 Star (different tokens)
│       ├── bampfa.py
│       ├── grandlake.py
│       └── stanford.py
├── site/
│   ├── index.html
│   ├── style.css
│   ├── app.js               # renders board + by-film views from the JSON
│   └── data/showtimes.json  # generated — the only thing the site loads
├── refresh.sh               # scrape everything, then serve locally
└── .github/workflows/scrape.yml  # nightly scrape + GitHub Pages deploy
```

## Data format

`site/data/showtimes.json`:

```json
{
  "generated_at": "2026-09-02T17:28:12Z",
  "theaters": {
    "roxie": {"id": "roxie", "name": "Roxie Theater",
              "city": "San Francisco", "url": "https://roxie.com"}
  },
  "screenings": [
    {"theater": "roxie", "title": "Colony", "date": "2026-09-02",
     "time": "18:00", "url": "https://roxie.com/film/colony//#showtimes"}
  ]
}
```

- `date` is `YYYY-MM-DD`, `time` is 24-hour `HH:MM` local (absent if the
  source doesn't list one).
- `main.py` drops past dates, sorts by date/time, and writes the file.
  Screenings are already filtered to today-forward, so the frontend does no
  date math beyond picking the default day.

## The frontend

`app.js` fetches the JSON once and renders everything client-side:

- **Day strip** — the next 14 days that have screenings, with show counts.
- **Theater chips** — toggle venues on and off (struck-through = hidden).
- **Board view** — one row per theater; each screening is a stub positioned
  on a shared time axis. Overlapping stubs stack into lanes. Below 760px the
  axis collapses and stubs flow as a wrapped list.
- **By-film view** — the same day grouped by title, one line per venue.
- **URL hash state** — `#2026-09-05` or `#2026-09-05/films`, so days and
  views are shareable/bookmarkable.

## Scraper notes and quirks

Things the parsers rely on, so you know where to look when one breaks:

- **Times without am/pm** (Grand Lake, Stanford) follow the standard movie
  listings convention: 10:00–11:59 are matinee AM, everything below 10 is PM.
- **Grand Lake** publishes day-of-week schedules ("FRI: 3:15, 7:00"); the
  scraper expands them into concrete dates over the next 7 days.
- **Stanford** posts per-festival calendar pages with weekend date ranges
  ("September 11-13") and matinee notes ("plus 3:45 Sat/Sun"). Its HTML has
  unclosed `<td>` tags, so the parser only reads each cell's direct children.
- **Alamo**'s API `superTitle` is sometimes a dict; COLLECTION badges (e.g.
  "Drafthouse Recommends") are dropped so titles stay readable.
- **BAMPFA** lists museum events alongside films; only events tagged "Film"
  are kept. Current and next month are both fetched.
- **Veezi** (Balboa, 4 Star) dates come as "Wednesday 2, September" with no
  year; the scraper infers the closest sensible year.

Debugging one parser without re-scraping everything:

```sh
.venv/bin/python -m scraper.main --only roxie   # merges into existing JSON
```

## Adding a theater

1. Write `scraper/theaters/yourtheater.py` exposing
   `scrape() -> list[Screening]`.
2. Add the venue to `THEATERS` in `scraper/model.py` and register the
   scraper in `SCRAPERS` in `scraper/theaters/__init__.py`.
3. Run `python -m scraper.main --only yourtheater` and eyeball the output.

The frontend picks up new theaters automatically — rows, chips, and the
sources footer are all driven by the JSON.

## Deploying

The site is fully static — host the `site/` directory anywhere.
`.github/workflows/scrape.yml` is included for GitHub: it re-scrapes every
3 days at 6am Pacific (and on every push) and publishes `site/` to GitHub
Pages. To use it, push this repo to GitHub and set Pages → Source →
"GitHub Actions".

## Caveats

- Listings are only as accurate as the theaters' own calendars; programs
  change, so confirm with the box office for anything important.
- Scrapers are polite (one or two requests per theater per run), but sites
  change their markup. If a theater's count drops to zero in the scrape
  output, its parser probably needs a look.
