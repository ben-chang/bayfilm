# BayFilm

**[bayfilm.net](https://bayfilm.net)** — one guide to what's playing at San
Francisco Bay Area independent movie theaters.

## What is this?

BayFilm is an aggregation website for San Francisco Bay Area independent movie theaters.

Every night, BayFilm reads the calendars that theaters publish on
their own websites — from San Francisco across the East Bay, Marin, the
Peninsula, and the South Bay — and lays the showtimes out side by side. You can see the whole
day at a glance on a time grid, look up a specific film and every place it's
playing, search for special presentations like 70mm or live scores, and jump
straight to each theater's box office to buy tickets. It works in light or
dark mode, on your phone or your laptop, and every screening has an
add-to-calendar button.

BayFilm sells nothing, shows no ads, and isn't affiliated with any theater.
It's a fan project that just wants you to see more movies on real screens.
Everything below this line is for people who want to run or modify it.

---

## How it works

A Python scraper pulls each theater's own calendar into a single JSON file,
and a dependency-free static site renders it. No frameworks, no database, no
build step — the only dependencies are `requests` and `beautifulsoup4` for
the scraper, and the site can be hosted anywhere that serves files.

```
theater calendars ──> scraper/ ──> site/data/showtimes.json ──> site/ (static HTML/JS)
```

## Theaters covered

| Theater | City | Source |
|---|---|---|
| Roxie Theater | San Francisco | roxie.com calendar (server-rendered HTML) |
| Balboa Theater | San Francisco | Veezi ticketing feed (HTML) |
| 4 Star Theater | San Francisco | Veezi ticketing feed (HTML) |
| Vogue Theater | San Francisco | Veezi ticketing feed (HTML) |
| Alamo Drafthouse New Mission | San Francisco | drafthouse.com JSON schedule API |
| Alamo Drafthouse Mountain View | Mountain View | drafthouse.com JSON schedule API (same SF-market feed) |
| Marina Theatre | San Francisco | Fandango napi JSON (lntsf.com has no showtimes) |
| Presidio Theatre | San Francisco | Fandango napi JSON (lntsf.com has no showtimes) |
| Landmark Opera Plaza | San Francisco | landmarktheatres.com Boxoffice/Webedia JSON API |
| Landmark Piedmont | Oakland | landmarktheatres.com Boxoffice/Webedia JSON API |
| Landmark Aquarius | Palo Alto | landmarktheatres.com Boxoffice/Webedia JSON API |
| BAMPFA | Berkeley | bampfa.org calendar (HTML, "Film" events only) |
| Grand Lake Theatre | Oakland | renaissancerialto.com homepage (HTML) |
| Vine Cinema & Alehouse | Livermore | vinecinema.com Boxoffice/Webedia JSON API |
| Stanford Theatre | Palo Alto | stanfordtheatre.org festival calendars (HTML) |
| Lark Theater | Larkspur | Agile Ticketing public JSON feed |
| Smith Rafael Film Center | San Rafael | cinema.cafilm.org film pages (HTML, shared with Sequoia) |
| Sequoia Cinema | Mill Valley | cinema.cafilm.org film pages (HTML, shared with Rafael) |
| Cinelounge Tiburon | Tiburon | cineloungefilm.com GraphQL API (Indy Cinema Group) |
| CineLux Almaden | San Jose | cineluxtheatres.com day pages (server-rendered HTML) |
| Pruneyard Cinemas | Campbell | pruneyardcinemas.com nowplaying partial (Theater Toolkit HTML) |
| CinéArts Santana Row | San Jose | cinemark.com theater day pages (server-rendered HTML) |

**Not covered (yet):** New Parkway (JS-only app with no accessible feed),
Rialto Cinemas Elmwood/Cerrito (showtimes JS-injected, no accessible feed).

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
calendars weekly (most on Fridays), so daily is plenty. Set `TMDB_API_KEY`
in the environment if you want poster lookups for new titles (see Data
format below); without it, cached posters still work.

## Project layout

```
bayfilm/
├── scraper/
│   ├── main.py              # runs all scrapers, format badges, writes showtimes.json
│   ├── model.py             # Screening/Theater dataclasses + THEATERS registry
│   ├── util.py              # fetch helpers, time/date parsing
│   ├── tmdb.py              # TMDb poster lookup (optional TMDB_API_KEY)
│   ├── tmdb_cache.json      # committed lookup cache (hits and misses)
│   └── theaters/
│       ├── __init__.py      # SCRAPERS list — register scrapers here
│       ├── roxie.py         # one module per source...
│       ├── alamo.py
│       ├── veezi.py         # shared by Balboa and 4 Star (different tokens)
│       ├── bampfa.py
│       ├── grandlake.py
│       ├── stanford.py
│       └── lark.py
├── site/
│   ├── index.html
│   ├── style.css            # theme tokens (light + dark), all styling
│   ├── app.js               # renders all views from the JSON
│   ├── og.png / robots.txt / sitemap.xml   # share image + crawler files
│   └── data/showtimes.json  # generated — the only thing the site loads
├── refresh.sh               # scrape everything, then serve locally
└── .github/workflows/scrape.yml  # scheduled scrape + GitHub Pages deploy
```

## Data format

`site/data/showtimes.json`:

```json
{
  "generated_at": "2026-09-02T17:28:12Z",
  "theaters": {
    "roxie": {"id": "roxie", "name": "Roxie Theater", "city": "San Francisco",
              "region": "SF", "url": "https://roxie.com",
              "scraped_at": "2026-09-02T17:28:12Z"}
  },
  "films": {
    "colony": {"desc": "…", "img": "https://image.tmdb.org/t/p/w342/…"}
  },
  "screenings": [
    {"theater": "roxie", "title": "Colony", "date": "2026-09-02",
     "time": "18:00", "url": "https://roxie.com/film/colony//#showtimes"}
  ]
}
```

- `date` is `YYYY-MM-DD`, `time` is 24-hour `HH:MM` local (absent if the
  source doesn't list one). Screenings may carry a `note` (format badges
  like `70mm`, detected from titles via `FORMAT_PATTERNS` in `main.py`).
- The `films` map (lowercased title → `{desc, img}`) holds blurbs and poster
  URLs so they aren't repeated on every screening. Posters come from TMDb
  when a title matches (`scraper/tmdb.py`, needs `TMDB_API_KEY` — set as a
  GitHub Actions secret for CI), falling back to the theater's own image.
  Lookups (including misses) are cached in the committed
  `scraper/tmdb_cache.json`, so repeat runs make few API calls and CI keeps
  posters even without the key.
- Theater entries carry `scraped_at` so the frontend can flag stale rows.
- `main.py` drops past dates, sorts by date/time, and writes the file.
  Screenings are already filtered to today-forward, so the frontend does no
  date math beyond picking the default day and dimming today's past times.

## The frontend

`app.js` fetches the JSON once and renders everything client-side:

- **Day strip** — the next 14 days that have screenings, with show counts.
- **Region + theater filters** — Everywhere/SF/East Bay/Peninsula/North Bay
  quick toggles plus per-theater chips; selections persist in localStorage.
  The per-theater chips collapse behind a "Theaters · N of M" dropdown at
  every width; the region row stays visible as the primary filter.
- **Board view (desktop)** — one row per theater, grouped under region
  headers (SF, East Bay, …); each screening is a stub positioned on a
  shared time axis that always runs to 1am. The day strip and time axis
  stay pinned while you scroll the lanes. Overlapping stubs stack into
  lanes. On today's board, past showtimes are dimmed and an orange line
  marks the current time (updated in place each minute — no DOM rebuild,
  so scrolling is never interrupted).
- **Board view (mobile, below 761px)** — a chronological timeline for the
  day: sticky hour markers, one row per screening (time / title / venue
  tag), and an orange "now" divider that slides forward. Today's view
  opens scrolled to "now", folds finished screenings behind an "N earlier
  screenings" toggle, and shows a floating "now" button whenever the
  divider is off-screen.
- **By-film view** — the same day grouped by title, with poster thumbnails,
  blurbs, and Letterboxd/IMDb links.
- **All films view** — every upcoming film across dates with a search box
  (matches titles and formats, e.g. "70mm").
- **Add to calendar** — the `+` beside any time in the film views downloads
  an `.ics` for that screening (correct Pacific timezone).
- **Freshness badges** — rows whose data is >24h older than the rest are
  flagged "listings from …" (this is how the BAMPFA/Stanford CI fallback
  stays honest).
- **Light/dark themes** — token-driven; follows the OS preference, with a
  masthead toggle that persists. A pre-paint script in `index.html` prevents
  theme flash. All text pairs meet WCAG AA in both themes.
- **URL hash state** — `#2026-09-05`, `#2026-09-05/films`, or
  `#2026-09-05/all`, so days and views are shareable/bookmarkable.

Design system in brief: Big Shoulders (display) for the venue "machinery,"
Instrument Serif (+italic) for film titles and editorial copy, Spline Sans
Mono for times and labels, Archivo for body; fog/ink palette with
international orange as the single accent (`--bridge`, with a darker
text-safe variant `--bridge-ink` in light mode).

## Scraper notes and quirks

Things the parsers rely on, so you know where to look when one breaks:

- **Times without am/pm** (Grand Lake, Stanford) follow the standard movie
  listings convention: 10:00–11:59 are matinee AM, everything below 10 is PM.
- **Grand Lake** publishes day-of-week schedules ("FRI: 3:15, 7:00"); the
  scraper expands them into concrete dates over the next 7 days.
- **Stanford** posts per-festival calendar pages with weekend date ranges
  ("September 11-13") and matinee notes ("plus 3:45 Sat/Sun"). Its HTML has
  unclosed `<td>` tags, so the parser only reads each cell's direct
  children, and the year comes from the calendar banner (never inferred —
  past summer dates would jump a year forward).
- **Alamo**'s API `superTitle` is sometimes a dict; COLLECTION badges (e.g.
  "Drafthouse Recommends") are dropped so titles stay readable.
- **BAMPFA** lists museum events alongside films; only events tagged "Film"
  are kept. Current and next month are both fetched. Event images hide in a
  popup twin of each calendar entry, matched by ID.
- **Veezi** (Balboa, 4 Star, Vogue) dates come as "Wednesday 2, September"
  with no year; the scraper infers the closest sensible year.
- **Webedia/Boxoffice API** (Landmark ×3, Vine) — `POST /api/gatsby-source-boxofficeapi/schedule`
  then `GET …/movies?ids=…` on the theater's own domain. Landmark's CDN
  caches schedule POSTs loosely across differing bodies, so the scraper
  always requests all three Landmark IDs in one call (memoized) and slices
  per theater. Theater IDs must be UPPERCASE (`X00U8`/`X00Y7`/`X00TM`;
  Vine `X018Q`). `startsAt` is naive local Pacific. Display titles are
  editorialized ("EMPIRE WEEK…: Star Wars…"); `originalTitle` is substituted
  only when the display title contains it (and a trailing "(originalTitle)"
  parenthetical is stripped — "Hope (Hopeu)" → "Hope"), so foreign-language
  originals aren't swapped in.
- **Fandango napi** (Marina, Presidio — lntsf.com publishes no showtimes):
  `theaterCalendar/{tid}` for dates, then `theaterMovieShowtimes/{tid}?startDate=`
  per day (tids `AAUVR`/`AACFS`). The WAF 403s bare requests — the scraper
  sends Referer/X-Requested-With/Accept-Language. Titles carry a "(2026)"
  year suffix (stripped). Possibly datacenter-blocked on Actions; the
  stale-fallback covers it.
- **CAFilm** (Smith Rafael + Sequoia share cinema.cafilm.org): `/schedule`
  enumerates film slugs, each `/film/{slug}` page has every showing with an
  explicit `cal_date`, AM/PM time button, and per-showing venue code
  (`RAF1-3` vs `Sequoia1-2` — one film can play both houses). One crawl
  (~26 pages, memoized) serves both theaters. The old Cloudflare block on
  rafaelfilm.cafilm.org is gone; never fetch tix.cafilm.org (Imperva).
- **Cinelounge Tiburon** — public GraphQL at cineloungefilm.com/graphql with
  `site-id: 173` + `client-type: consumer` headers; `showingsForDate` per
  date from `datesWithShowing`. Showtime `time` is UTC and is converted to
  Pacific; showings crossing midnight UTC are deduped by id.
- **CineLux** (Almaden) and **Cinemark** (CinéArts Santana Row) are
  server-rendered day pages (`?date=` / `?showDate=`), looped 7 days out.
  Cinemark date+time come from the ticket link's `Showtime=` ISO param;
  it's Cloudflare-fronted so may 403 from Actions (stale-fallback).
- **Pruneyard** (Theater Toolkit platform) — `/theater/nowplaying?locationKey=Pruneyard&date=M/D/YYYY`
  returns an HTML partial per day; ticket URLs are parsed out of button
  `onclick` handlers. CineLux/Pruneyard titles arrive ALL-CAPS and go
  through `util.uncaps()`.

Debugging one parser without re-scraping everything:

```sh
.venv/bin/python -m scraper.main --only roxie   # merges into existing JSON
```

## Adding a theater

1. Write `scraper/theaters/yourtheater.py` exposing
   `scrape() -> list[Screening]` (set `desc`/`img` on screenings if the
   source has blurbs or posters — they're lifted into the films map).
2. Add the venue to `THEATERS` in `scraper/model.py` (including its
   `region`) and register the scraper in `SCRAPERS` in
   `scraper/theaters/__init__.py`.
3. Run `python -m scraper.main --only yourtheater` and eyeball the output.

The frontend picks up new theaters automatically — board rows, filter chips,
region toggles, and the sources footer are all driven by the JSON. The only
frontend touch is a short venue tag in `SHORT_NAMES` in `site/app.js` for
the mobile timeline (it falls back to the full name).

## Deploying

The live site is GitHub Pages behind the custom domain **bayfilm.net** (set
in the repo's Pages settings; the github.io URL 301s there).
`.github/workflows/scrape.yml` re-scrapes nightly at 6am Pacific (and
on every push) and publishes `site/`. To reproduce the setup: push to
GitHub, set Pages → Source → "GitHub Actions", and add a `TMDB_API_KEY`
repository secret for poster lookups.

Two operational notes:

- If a workflow run fails, **trigger a fresh run** (Actions → Run workflow)
  — re-running the failed run trips a `deploy-pages` quirk ("Multiple
  artifacts named github-pages").
- GitHub pauses scheduled workflows after ~60 days without repo activity;
  the warning email has a one-click re-enable.

## Caveats

- **BAMPFA and Stanford block datacenter IPs** (Cloudflare), so the GitHub
  Actions scrape gets a 403 from them. The scraper degrades gracefully: a
  failed theater keeps its still-upcoming screenings from the committed
  `showtimes.json` (with its old `scraped_at`, which surfaces as a stale
  badge). To refresh those two, run `python -m scraper.main` locally (home
  IPs work fine) and push the updated JSON — the push triggers a deploy.
- Listings are only as accurate as the theaters' own calendars; programs
  change, so confirm with the box office for anything important.
- Scrapers are polite (one or two requests per theater per run), but sites
  change their markup. If a theater's count drops to zero in the scrape
  output, its parser probably needs a look.
- TMDb title matching takes the first search result; a generic title can
  occasionally get the wrong poster. Delete that title's line from
  `scraper/tmdb_cache.json` and re-scrape to retry it.
