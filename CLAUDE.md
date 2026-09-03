# CLAUDE.md — BayFilm

Showtime aggregator for SF Bay Area independent movie theaters. Python
scrapers → `site/data/showtimes.json` → dependency-free static site. Live at
**https://bayfilm.net** (GitHub Pages, repo `ben-chang/bayfilm`). Full
architecture and feature docs live in `README.md` — this file is the
operational knowledge for working on the project.

## Working agreements

- **Local-first**: don't commit, push, or deploy until the user says they've
  reached a steady point. Then batch into clean commits. **Every push
  deploys the live site** (Actions workflow runs on push).
- The user edits copy in `site/index.html` directly — never overwrite their
  wording; check the file's current state before editing near it.
- User-facing text says listings are **"indexed"**, never "scraped"
  (scrape/scraper language is fine in code and README).
- Verify visual changes with headless-Chrome screenshots before reporting
  (recipes below), and verify data changes by inspecting the JSON output.

## Commands

```sh
uv venv && uv pip install requests beautifulsoup4   # once
./refresh.sh                            # full scrape + serve on :8741
.venv/bin/python -m scraper.main        # full scrape only
.venv/bin/python -m scraper.main --only roxie   # one theater, merges into existing JSON
python3 -m http.server 8741 -d site     # serve only
node --check site/app.js                # syntax-check after JS edits
```

- `TMDB_API_KEY` env enables poster lookups for new titles (it's set as a
  GitHub Actions secret; ask the user for the value if needed locally —
  never write it into a repo file, the repo is public). Without it, the
  committed `scraper/tmdb_cache.json` still supplies known posters.
- A dev server is often already running on :8741 — check before starting.

## Verification recipes

Headless Chrome (macOS path): `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`

```sh
# screenshot a view (hash picks date/view: #2026-09-05, /films, /all)
chrome --headless --disable-gpu --window-size=1440,1500 \
  --screenshot=out.png "http://localhost:8741/#2026-09-05" --virtual-time-budget=6000
```

- **Headless Chrome enforces a 500px minimum window width** — a 390px
  screenshot clips the image, it does not reflow. For real phone widths or
  to run JS assertions, use a same-origin iframe probe page written into
  `site/_probe.html` (iframe any width; read `contentDocument`, click
  elements, check computed styles via `--dump-dom`), and delete it after.
- To screenshot a specific theme, seed `localStorage.setItem('bayfilm.theme',
  'dark'|'light')` in a wrapper page before the iframe loads — headless
  follows the OS `prefers-color-scheme` otherwise.
- Font-load races can make a single screenshot lie (e.g. wordmark rendered
  in the wrong color once) — if something looks impossible, retake it and
  check computed styles/pixels before "fixing" CSS.
- WCAG contrast check (all text pairs must be ≥4.5:1 in both themes):

```python
def lum(h):
    c = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    c = [x/12.92 if x<=.03928 else ((x+.055)/1.055)**2.4 for x in c]
    return .2126*c[0]+.7152*c[1]+.0722*c[2]
ratio = lambda f,b: (max(lum(f),lum(b))+.05)/(min(lum(f),lum(b))+.05)
```

## Scraper knowledge

- Failure fallback: a scraper that throws keeps that theater's still-upcoming
  screenings from the existing JSON, carrying its old `scraped_at` (frontend
  shows a stale badge past 24h). `--only X` re-runs one scraper and keeps
  everyone else's data.
- **BAMPFA and Stanford 403 on GitHub Actions** (datacenter IP blocks) —
  expected; they refresh only from local (residential) scrapes. Vogue is
  dead/unreachable; Rafael is Cloudflare-blocked; New Parkway and Rialto
  Elmwood/Cerrito are JS-only with no accessible feed.
- Per-theater quirks (details in README "Scraper notes"): bare times are
  10:00–11:59=AM / <10=PM; Grand Lake day-of-week expansion; Stanford year
  must come from the calendar banner (never `infer_year` — past dates jump a
  year) and its HTML has unclosed `<td>`s (use `recursive=False`); Alamo
  `superTitle` can be a dict, COLLECTION badges dropped; BAMPFA filters to
  "Film" tag, images live in popup twins matched by `data-id`; Veezi dates
  lack a year.
- Lark feed: `prod1.agileticketing.net/websales/feed.ashx?guid=fb90deda-…&showslist=true&format=json`.
- Format badges (`70mm`, `live score`, `Q&A`, …) are detected from titles in
  `FORMAT_PATTERNS` (`scraper/main.py`) and stored on `Screening.note`.
- `desc`/`img` on screenings get lifted into the top-level `films` map
  (keyed by lowercased title) and stripped from screening dicts.
- Wrong TMDb poster? Delete that title's line from `scraper/tmdb_cache.json`
  and re-scrape (first-search-result matching; misses cached permanently).

## Frontend conventions

- Vanilla JS, no build. All user text through `escapeHtml()`. State lives in
  the `state` object + URL hash (`#date`, `#date/films`, `#date/all`);
  filters and theme persist in localStorage (`bayfilm.hidden`,
  `bayfilm.theme`).
- **Theming is token-driven** — never hardcode a hex in a component rule.
  Light + dark palettes live in `:root` / `:root[data-theme="dark"]` at the
  top of `style.css`. Key tokens: `--bridge` (display orange, ≥3:1 only —
  large text/accents) vs `--bridge-ink` (text-safe orange, ≥4.5:1 — any
  small text); `--edge`/`--shadow` for component outlines and hard offset
  shadows. A pre-paint script in `index.html` sets `data-theme`.
- Font roles: Big Shoulders = venue "machinery" (wordmark, theater names,
  day strip); Instrument Serif (+italic) = film titles and editorial copy;
  Spline Sans Mono = times/labels; Archivo = body.
- **Never rebuild board DOM on a timer** — the minute tick goes through
  `updateBoardClock()` which moves the now-line/divider and toggles
  `is-past` in place. Full re-renders mid-scroll kill mobile momentum
  scrolling (this was a real user-reported bug).
- Mobile (<761px) board is a chronological timeline (`renderMobileTimeline`),
  not the lane grid; theater chips collapse behind a dropdown; venue tags
  come from `SHORT_NAMES` in `app.js` (add new theaters there too).
- Type floor is 12px; inputs ≥16px (iOS zoom); tap targets ≥44px on mobile.

## Deployment

- GitHub Pages via `.github/workflows/scrape.yml`: on push + every 3 days
  (`0 13 */3 * *`). Custom domain bayfilm.net is set in Pages settings (the
  github.io URL 301s to it — use bayfilm.net when curling live data).
- **Never "re-run" a failed Pages run** — the retry sees two `github-pages`
  artifacts and fails. Trigger a fresh run instead (`gh workflow run scrape.yml`).
- GitHub pauses the schedule after ~60 days of repo inactivity (email has a
  re-enable button).
- Live-data smoke test: `curl -s https://bayfilm.net/data/showtimes.json`
  and check screening/theater counts and `generated_at`.
