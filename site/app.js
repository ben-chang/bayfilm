/* BayFilm — renders site/data/showtimes.json */

const $ = (sel) => document.querySelector(sel);

const state = {
  data: null,
  date: null,            // "YYYY-MM-DD"
  off: new Set(),        // disabled theater ids
  view: "board",         // board | films | all
  query: "",
  film: null,            // slug for #date/film/slug
  scrollTitle: null,     // board stub to highlight after a time click
  pendingScroll: false,
  chipsOpen: false,      // theater list expanded (collapsed by default)
  filtersOpen: false,    // mobile: film-filter row expanded
  era: "all",            // all | new (recent releases) | rep (revivals)
  onfilm: false,         // only 35/70/16mm screenings
};

const DAY_WINDOW = 14;

const LANE_H = 40;
const STUB_EST_PX = 230;  // rough rendered stub width, for lane collision
const STORAGE_KEY = "bayfilm.hidden";

// board lanes group under these region headers, in this order
const REGION_ORDER = ["SF", "East Bay", "North Bay", "Peninsula", "South Bay"];

const regionRank = (r) =>
  REGION_ORDER.indexOf(r) === -1 ? REGION_ORDER.length : REGION_ORDER.indexOf(r);

// compact venue tags for the mobile timeline
const SHORT_NAMES = {
  roxie: "Roxie", balboa: "Balboa", "4star": "4 Star", newmission: "Alamo",
  bampfa: "BAMPFA", grandlake: "Grand Lake", stanford: "Stanford", lark: "Lark",
  alamomv: "Alamo MV", vogue: "Vogue", marina: "Marina", presidio: "Presidio",
  operaplaza: "Opera Plaza", piedmont: "Piedmont", aquarius: "Aquarius",
  vine: "Vine", almaden: "CineLux", pruneyard: "Pruneyard", santanarow: "Santana Row",
  rafael: "Rafael", sequoia: "Sequoia", cinelounge: "Cinelounge",
};

function isoToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fmtTime(hhmm) {
  if (!hhmm) return "TBA";
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}

function fmtHour(h) {
  const hh = h % 24;
  const ap = hh >= 12 ? "p" : "a";
  return `${hh % 12 || 12}${ap}`;
}

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso) {
  const d = parseISO(iso);
  return `${DOWS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function screeningsOn(date) {
  return state.data.screenings.filter(
    (s) => s.date === date && !state.off.has(s.theater) && passesFilters(s) && matchesQuery(s)
  );
}

function queryText() {
  return state.query.trim();
}

function matchesQuery(s) {
  const q = queryText().toLowerCase();
  if (!q) return true;
  const desc = (filmDesc(s.title) || "").toLowerCase();
  return s.title.toLowerCase().includes(q) ||
    (s.note || "").toLowerCase().includes(q) ||
    desc.includes(q);
}

function filmSlug(title) {
  const slug = title.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "film";
}

function futureDates() {
  const today = isoToday();
  const counts = {};
  for (const s of state.data.screenings) {
    if (s.date >= today) counts[s.date] = (counts[s.date] || 0) + 1;
  }
  const dates = Object.keys(counts).sort();
  return { dates, counts };
}

/* ---------- film filters (release era + on-film) ---------- */

const FILTERS_KEY = "bayfilm.filmFilters";
const ON_FILM_RE = /\b(70|35|16)mm\b/i;

// "new" = released this year or last (release years come from the films map,
// filled by TMDb / a year in the title). Unknown years pass both era filters.
function eraOf(title) {
  const y = (state.data.films[title.toLowerCase()] || {}).year;
  if (!y) return null;
  return y >= new Date().getFullYear() - 1 ? "new" : "rep";
}

function passesFilters(s) {
  if (state.onfilm && !(s.note && ON_FILM_RE.test(s.note))) return false;
  if (state.era !== "all") {
    const era = eraOf(s.title);
    if (era && era !== state.era) return false;
  }
  return true;
}

function saveFilmFilters() {
  try {
    localStorage.setItem(FILTERS_KEY,
      JSON.stringify({ era: state.era, onfilm: state.onfilm }));
  } catch (e) { /* private mode */ }
}

// when the filters leave a day empty, point at the reset next to the message
function updateEmptyFilters() {
  const showingEmpty = !$("#empty").hidden || !$("#emptySearch").hidden;
  $("#emptyFilters").hidden =
    !showingEmpty || (state.era === "all" && !state.onfilm);
}

function filmDesc(title) {
  return (state.data.films[title.toLowerCase()] || {}).desc || null;
}

function filmYearHtml(title) {
  const y = (state.data.films[title.toLowerCase()] || {}).year;
  // skip when the title already carries the year ("The Fog (1980)")
  if (!y || title.includes(String(y))) return "";
  return ` <span class="film__year">${y}</span>`;
}

function filmThumb(title) {
  const img = (state.data.films[title.toLowerCase()] || {}).img;
  return `<div class="film__thumb">` +
    (img
      ? `<img src="${img.replace(/"/g, "&quot;")}" alt="" loading="lazy"
           onerror="this.parentNode.classList.add('film__thumb--empty');this.remove()">`
      : "") +
    `</div>`;
}

function staleLabel(theater) {
  // scraped noticeably earlier than the rest of the data -> "listings from …"
  if (!theater.scraped_at) return null;
  const gap = new Date(state.data.generated_at) - new Date(theater.scraped_at);
  if (gap < 24 * 3600 * 1000) return null;
  const d = new Date(theater.scraped_at);
  return `listings from ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/* ---------- add-to-calendar (.ics) ---------- */

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:America/Los_Angeles",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0800", "TZOFFSETTO:-0700",
  "TZNAME:PDT", "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:-0700", "TZOFFSETTO:-0800",
  "TZNAME:PST", "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function icsEscape(s) {
  return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c);
}

function downloadICS(s) {
  const t = state.data.theaters[s.theater];
  const start = s.date.replace(/-/g, "") + "T" + (s.time || "19:00").replace(":", "") + "00";
  const endMin = minutes(s.time || "19:00") + 120;
  const endH = Math.min(Math.floor(endMin / 60), 23);
  const end = s.date.replace(/-/g, "") +
    `T${String(endH).padStart(2, "0")}${String(endMin % 60).padStart(2, "0")}00`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BayFilm//EN",
    VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${s.date}-${(s.time || "").replace(":", "")}-${s.theater}-${Date.now()}@bayfilm`,
    `DTSTART;TZID=America/Los_Angeles:${start}`,
    `DTEND;TZID=America/Los_Angeles:${end}`,
    `SUMMARY:${icsEscape(s.title)} @ ${icsEscape(t.name)}`,
    `LOCATION:${icsEscape(t.name + ", " + t.city + ", CA")}`,
    s.url ? `URL:${s.url}` : "",
    `DESCRIPTION:${icsEscape("Tickets: " + (s.url || t.url))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${s.title.replace(/[^\w ]+/g, "").slice(0, 40).trim() || "screening"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- day strip ---------- */

function renderDaystrip() {
  const { dates, counts } = futureDates();
  const strip = $("#daystrip");
  strip.innerHTML = "";
  if (!dates.length) return;

  let idx = dates.indexOf(state.date);
  if (idx < 0) idx = 0;
  const pageStart = Math.floor(idx / DAY_WINDOW) * DAY_WINDOW;
  const windowDates = dates.slice(pageStart, pageStart + DAY_WINDOW);

  const goTo = (iso) => {
    state.date = iso;
    state.film = null;
    state.scrollTitle = null;
    if (state.view === "all") state.view = "board";
    syncHash();
    render();
  };

  if (pageStart > 0) {
    const dest = dates[Math.max(0, pageStart - DAY_WINDOW)];
    strip.appendChild(edgeDay("Earlier", dest, counts, goTo));
  }
  for (const iso of windowDates) {
    const d = parseISO(iso);
    const btn = document.createElement("button");
    btn.className = "day" +
      (iso === state.date ? " is-selected" : "") +
      (iso === isoToday() ? " is-today" : "");
    btn.innerHTML =
      `<span class="day__dow">${iso === isoToday() ? "Today" : DOWS[d.getDay()]}</span>` +
      `<span class="day__num">${MONTHS[d.getMonth()]} ${d.getDate()}</span>` +
      `<span class="day__count">${counts[iso]} shows</span>`;
    btn.addEventListener("click", () => goTo(iso));
    strip.appendChild(btn);
  }
  if (pageStart + DAY_WINDOW < dates.length) {
    strip.appendChild(edgeDay("Later", dates[pageStart + DAY_WINDOW], counts, goTo));
  }
}

function edgeDay(label, iso, counts, goTo) {
  const d = parseISO(iso);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "day day--edge";
  btn.innerHTML =
    `<span class="day__dow">${label}</span>` +
    `<span class="day__num">${MONTHS[d.getMonth()]} ${d.getDate()}</span>` +
    `<span class="day__count">${counts[iso]} shows</span>`;
  btn.addEventListener("click", () => goTo(iso));
  return btn;
}

function renderStaleNote() {
  const note = $("#staleNote");
  const today = isoToday();
  const groups = new Map();
  for (const [id, t] of Object.entries(state.data.theaters)) {
    if (state.off.has(id)) continue;
    const label = staleLabel(t);
    if (!label) continue;
    const upcoming = state.data.screenings.some(
      (s) => s.theater === id && s.date >= today);
    if (!upcoming) continue;
    const when = label.replace(/^listings from /, "");
    if (!groups.has(when)) groups.set(when, []);
    groups.get(when).push(t.name);
  }
  if (!groups.size) {
    note.hidden = true;
    note.textContent = "";
    return;
  }
  const parts = [...groups.entries()].map(([when, names]) => {
    const who = names.length > 4
      ? `${names.length} theaters`
      : names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    return `${who} last indexed ${when}`;
  });
  note.textContent = parts.join(". ") + ".";
  note.hidden = false;
}

/* ---------- theater + region filters ---------- */

function regions() {
  return [...new Set(Object.values(state.data.theaters).map((t) => t.region))];
}

function saveFilters() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.off])); }
  catch (e) { /* private mode */ }
}

function renderChips() {
  const wrap = $("#theaterChips");
  wrap.innerHTML = "";

  const regionRow = document.createElement("div");
  regionRow.className = "regions";
  const allBtn = document.createElement("button");
  allBtn.className = "region" + (state.off.size === 0 ? " is-active" : "");
  allBtn.textContent = "Everywhere";
  allBtn.addEventListener("click", () => {
    state.off.clear();
    saveFilters();
    render();
  });
  regionRow.appendChild(allBtn);
  for (const r of regions()) {
    const ids = Object.entries(state.data.theaters)
      .filter(([, t]) => t.region === r).map(([id]) => id);
    const others = Object.keys(state.data.theaters).filter((id) => !ids.includes(id));
    const isActive = others.every((id) => state.off.has(id)) &&
                     ids.every((id) => !state.off.has(id));
    const btn = document.createElement("button");
    btn.className = "region" + (isActive ? " is-active" : "");
    btn.textContent = r;
    btn.addEventListener("click", () => {
      state.off = new Set(others);
      saveFilters();
      render();
    });
    regionRow.appendChild(btn);
  }
  wrap.appendChild(regionRow);

  // one toggle bar for both collapsible sections; on mobile they behave as
  // an accordion (opening one closes the other) to keep the stack short
  const togglebar = document.createElement("div");
  togglebar.className = "togglebar";

  // film filters collapse behind this toggle on mobile (hidden on desktop)
  const filterToggle = document.createElement("button");
  filterToggle.className = "filtertoggle";
  filterToggle.setAttribute("aria-expanded", String(state.filtersOpen));
  const filtersOn = (state.era !== "all" ? 1 : 0) + (state.onfilm ? 1 : 0);
  filterToggle.innerHTML =
    `Film filters${filtersOn ? ` <span class="togglecount">· ${filtersOn} on</span>` : ""} ` +
    `<span class="chiptoggle__arrow">${state.filtersOpen ? "▴" : "▾"}</span>`;
  filterToggle.addEventListener("click", () => {
    state.filtersOpen = !state.filtersOpen;
    if (state.filtersOpen) state.chipsOpen = false;
    renderChips();
  });
  togglebar.appendChild(filterToggle);

  // the theater list collapses behind this toggle at every width
  const total = Object.keys(state.data.theaters).length;
  const on = total - state.off.size;
  const toggle = document.createElement("button");
  toggle.className = "chiptoggle";
  toggle.setAttribute("aria-expanded", String(state.chipsOpen));
  toggle.innerHTML =
    `Theaters <span class="togglecount${state.off.size ? "" : " is-quiet"}">· ${on}/${total}</span> ` +
    `<span class="chiptoggle__arrow">${state.chipsOpen ? "▴" : "▾"}</span>`;
  toggle.addEventListener("click", () => {
    state.chipsOpen = !state.chipsOpen;
    if (state.chipsOpen) state.filtersOpen = false;
    renderChips();
  });
  togglebar.appendChild(toggle);
  wrap.appendChild(togglebar);

  const filterRow = document.createElement("div");
  filterRow.className = "filmfilters" + (state.filtersOpen ? " is-open" : "");
  filterRow.setAttribute("role", "group");
  filterRow.setAttribute("aria-label", "Filter films");
  for (const [val, label] of
       [["all", "Everything"], ["new", "New releases"], ["rep", "Revivals"]]) {
    const btn = document.createElement("button");
    btn.className = "region" + (state.era === val ? " is-active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.era = val;
      saveFilmFilters();
      render();
    });
    filterRow.appendChild(btn);
  }
  const sep = document.createElement("span");
  sep.className = "filmfilters__sep";
  sep.textContent = "·";
  filterRow.appendChild(sep);
  const onfilmBtn = document.createElement("button");
  onfilmBtn.className = "region" + (state.onfilm ? " is-active" : "");
  onfilmBtn.setAttribute("aria-pressed", String(state.onfilm));
  onfilmBtn.textContent = "On film ✦";
  onfilmBtn.title = "Only 35mm / 70mm / 16mm screenings";
  onfilmBtn.addEventListener("click", () => {
    state.onfilm = !state.onfilm;
    saveFilmFilters();
    render();
  });
  filterRow.appendChild(onfilmBtn);
  wrap.appendChild(filterRow);

  // theater chips group under region headers, mirroring the board
  const chipRow = document.createElement("div");
  chipRow.className = "chiprow" + (state.chipsOpen ? " is-open" : "");
  const byRegion = new Map();
  for (const entry of Object.entries(state.data.theaters)) {
    const r = entry[1].region;
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r).push(entry);
  }
  for (const r of [...byRegion.keys()].sort((a, b) => regionRank(a) - regionRank(b))) {
    const head = document.createElement("div");
    head.className = "chiprow__region";
    head.textContent = r;
    chipRow.appendChild(head);
    for (const [id, t] of byRegion.get(r)) {
      const off = state.off.has(id);
      const btn = document.createElement("button");
      btn.className = "chip" + (off ? " is-off" : "");
      btn.setAttribute("aria-pressed", String(!off));
      btn.innerHTML = (off ? "" : `<span class="chip__check">✓</span> `) +
        `${t.name}<small>${t.city}</small>`;
      btn.addEventListener("click", () => {
        off ? state.off.delete(id) : state.off.add(id);
        saveFilters();
        render();
      });
      chipRow.appendChild(btn);
    }
  }
  wrap.appendChild(chipRow);
}

/* ---------- board view ---------- */

function renderBoard() {
  const board = $("#board");
  board.innerHTML = "";
  const shows = screeningsOn(state.date);
  if (!shows.length) return;

  const isToday = state.date === isoToday();
  const nowMin = minutes(nowHHMM());
  const desktopMq = window.matchMedia("(min-width: 761px)").matches;

  if (!desktopMq) {
    renderMobileTimeline(board, shows, isToday, nowMin);
    setupNowJump(board, isToday);
    return;
  }

  const timed = shows.filter((s) => s.time);
  let startH = 12;
  const endH = 25;  // axis always runs to 1am the next day
  if (timed.length) {
    startH = Math.min(12, Math.floor(minutes(timed[0].time) / 60));
  }
  const span = (endH - startH) * 60;
  const desktop = window.matchMedia("(min-width: 761px)").matches;
  const nowPct = ((nowMin - startH * 60) / span) * 100;
  const showNowLine = isToday && desktop && nowPct > 0 && nowPct < 100;
  // stashed so updateBoardClock() can adjust in place without a rebuild
  board.dataset.startMin = startH * 60;
  board.dataset.span = span;

  const axis = document.createElement("div");
  axis.className = "axis";
  const axisInner = document.createElement("div");
  axisInner.className = "axis__inner";
  axis.appendChild(axisInner);
  const step = endH - startH > 10 ? 2 : 1;
  for (let h = startH; h <= endH; h += step) {
    const tick = document.createElement("span");
    tick.className = "axis__tick";
    tick.style.left = (((h - startH) * 60) / span) * 100 + "%";
    tick.textContent = fmtHour(h);
    axisInner.appendChild(tick);
  }
  board.appendChild(axis);

  // lanes group by region (stable sort keeps model order within a region)
  const ordered = Object.entries(state.data.theaters)
    .sort((a, b) => regionRank(a[1].region) - regionRank(b[1].region));

  let lastRegion = null;
  for (const [id, t] of ordered) {
    if (state.off.has(id)) continue;
    const mine = shows
      .filter((s) => s.theater === id)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    if (!mine.length) continue;

    // region tag rides in the label column so the grid stays continuous
    const regionTag = t.region !== lastRegion
      ? `<div class="trow__regiontag">${t.region}</div>` : "";
    lastRegion = t.region;

    const stale = staleLabel(t);
    const row = document.createElement("div");
    row.className = "trow" + (stale ? " is-stale" : "");
    row.innerHTML =
      `<div class="trow__label">` + regionTag + `<div class="trow__name">` +
      `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${t.name}</a></div>` +
      `<div class="trow__city">${t.city}</div>` +
      `</div>`;
    const lanes = document.createElement("div");
    lanes.className = "trow__lanes";
    lanes.style.setProperty("--hours", endH - startH);
    row.appendChild(lanes);
    board.appendChild(row);

    if (showNowLine) {
      const line = document.createElement("div");
      line.className = "nowline";
      line.style.left = nowPct + "%";
      lanes.appendChild(line);
    }

    // lane assignment needs the rendered width to estimate stub overlap
    const width = lanes.clientWidth || 900;
    const gapMin = (STUB_EST_PX / width) * span;
    const laneEnds = [];

    for (const s of mine) {
      const past = isToday && s.time && minutes(s.time) < nowMin;
      const a = document.createElement("a");
      a.className = "stub-link" + (past ? " is-past" : "") +
        (state.scrollTitle === s.title ? " is-focus" : "");
      if (isToday && s.time) a.dataset.time = s.time;
      a.dataset.title = s.title;
      a.href = s.url || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML =
        `<span class="stub"><span class="stub__time">${fmtTime(s.time)}</span>` +
        `<span class="stub__title">${escapeHtml(s.title)}</span>` +
        (s.note ? `<span class="stub__badge">${escapeHtml(s.note)}</span>` : "") +
        `</span>`;
      a.title = `${s.title} — ${fmtTime(s.time)} at ${t.name}` +
        (s.note ? ` (${s.note})` : "") + (past ? " — already started" : "");
      if (desktop) {
        const m = s.time ? minutes(s.time) : startH * 60;
        let lane = laneEnds.findIndex((end) => m >= end);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = m + gapMin;
        a.style.left = ((m - startH * 60) / span) * 100 + "%";
        a.style.top = 9 + lane * LANE_H + "px";
      }
      lanes.appendChild(a);
    }
    if (desktop) {
      lanes.style.height = 9 + laneEnds.length * LANE_H + 4 + "px";
    }
  }
}

/* ---------- mobile board: chronological timeline ---------- */

function nowDividerHtml(nowMin) {
  return `<div class="tl__now"><span>now ${fmtTime(
    `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`
  )}</span></div>`;
}

function renderMobileTimeline(board, shows, isToday, nowMin) {
  const sorted = [...shows].sort((a, b) =>
    (a.time || "00:00").localeCompare(b.time || "00:00") ||
    a.theater.localeCompare(b.theater));

  // rows before "now" collect separately so today can fold them away
  const upcoming = [];
  const earlier = [];
  let earlierCount = 0;
  let lastHour = null;
  let nowPlaced = !isToday;
  for (const s of sorted) {
    const m = s.time ? minutes(s.time) : null;
    if (!nowPlaced && m !== null && m >= nowMin) {
      nowPlaced = true;
      lastHour = null; // first upcoming hour repeats its header after the fold
    }
    const bucket = nowPlaced ? upcoming : earlier;
    const hour = m === null ? "TBA" : fmtHour(Math.floor(m / 60)).toUpperCase();
    if (hour !== lastHour) {
      bucket.push(`<div class="tl__hour">${hour === "TBA" ? "TBA" : hour + "M"}</div>`);
      lastHour = hour;
    }
    const t = state.data.theaters[s.theater];
    const past = isToday && m !== null && m < nowMin;
    const stale = staleLabel(t);
    const focus = state.scrollTitle === s.title;
    if (!nowPlaced) earlierCount++;
    const img = (state.data.films[s.title.toLowerCase()] || {}).img;
    bucket.push(
      `<a class="tl__row${past ? " is-past" : ""}${stale ? " is-stale" : ""}` +
      `${focus ? " is-focus" : ""}" href="${s.url || "#"}"` +
      (isToday && s.time ? ` data-time="${s.time}"` : "") +
      ` data-title="${escapeHtml(s.title)}"` +
      ` target="_blank" rel="noopener">` +
      `<span class="tl__time">${fmtTime(s.time)}</span>` +
      `<span class="tl__thumb">` +
      (img ? `<img src="${img.replace(/"/g, "&quot;")}" alt="" loading="lazy"` +
             ` decoding="async" onerror="this.remove()">` : "") +
      `</span>` +
      `<span class="tl__title">${escapeHtml(s.title)}` +
      (s.note ? ` <span class="fbadge">${escapeHtml(s.note)}</span>` : "") +
      `</span>` +
      `<span class="tl__venue">${SHORT_NAMES[s.theater] || t.name}</span>` +
      `</a>`);
  }

  const parts = [];
  if (earlier.length && earlierCount > 5) {
    parts.push(
      `<button class="tl__earlier" aria-expanded="false" data-count="${earlierCount}">` +
      `▸ ${earlierCount} earlier screenings</button>`,
      `<div class="tl__past" hidden>${earlier.join("")}</div>`);
  } else {
    parts.push(...earlier);
  }
  // the divider stays outside the fold so updateBoardClock can slide it
  if (isToday) parts.push(nowDividerHtml(nowMin));
  parts.push(...upcoming);
  board.innerHTML = `<div class="tl">${parts.join("")}</div>`;

  const fold = board.querySelector(".tl__earlier");
  if (fold) {
    fold.addEventListener("click", () => {
      const wrap = board.querySelector(".tl__past");
      wrap.hidden = !wrap.hidden;
      fold.setAttribute("aria-expanded", String(!wrap.hidden));
      fold.textContent =
        `${wrap.hidden ? "▸" : "▾"} ${fold.dataset.count} earlier screenings`;
    });
  }
}

// floating "now" button + one-shot auto-scroll for today's mobile timeline
let nowDivider = null;

function updateNowJump() {
  const jump = $("#nowJump");
  if (!jump) return;
  if (state.view !== "board" || !nowDivider || !nowDivider.isConnected) {
    jump.hidden = true;
    return;
  }
  const r = nowDivider.getBoundingClientRect();
  const onScreen = r.bottom > 0 && r.top < window.innerHeight;
  jump.hidden = onScreen;
  if (!onScreen) jump.textContent = r.top <= 0 ? "now ↑" : "now ↓";
}

function setupNowJump(board, isToday) {
  const jump = $("#nowJump");
  if (!jump) return;
  nowDivider = isToday ? board.querySelector(".tl__now") : null;
  if (!nowDivider) {
    jump.hidden = true;
    return;
  }
  jump.onclick = () => nowDivider.scrollIntoView({
    block: "center",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto" : "smooth",
  });
  updateNowJump();
}

// Nudge the now-line and past-dimming along without rebuilding the board —
// a full re-render mid-scroll kills momentum scrolling on touch devices.
function updateBoardClock() {
  if (state.view !== "board" || state.date !== isoToday()) return;
  const board = $("#board");
  const nowMin = minutes(nowHHMM());

  const span = Number(board.dataset.span);
  if (span) {  // desktop grid
    const startMin = Number(board.dataset.startMin);
    const pct = ((nowMin - startMin) / span) * 100;
    board.querySelectorAll(".nowline").forEach((line) => {
      line.style.left = pct + "%";
      line.style.display = pct > 0 && pct < 100 ? "" : "none";
    });
  }
  board.querySelectorAll("[data-time]").forEach((a) => {
    a.classList.toggle("is-past", minutes(a.dataset.time) < nowMin);
  });
  // slide the mobile now-divider down past finished screenings
  const divider = board.querySelector(".tl__now");
  if (divider) {
    divider.innerHTML = nowDividerHtml(nowMin).replace(/^<div[^>]*>|<\/div>$/g, "");
    const rows = [...board.querySelectorAll(".tl__row[data-time]")];
    const next = rows.find((r) => minutes(r.dataset.time) >= nowMin);
    if (next) {
      const hour = next.previousElementSibling?.classList.contains("tl__hour")
        ? next.previousElementSibling : next;
      if (hour.previousElementSibling !== divider) {
        divider.parentNode.insertBefore(divider, hour);
      }
    } else if (divider.nextElementSibling) {
      divider.parentNode.appendChild(divider);
    }
  }
}

/* ---------- shared film-row rendering ---------- */

function pillGroup(s) {
  const past = s.date === isoToday() && s.time && minutes(s.time) < minutes(nowHHMM());
  return `<span class="pillgroup${past ? " is-past" : ""}">` +
    `<button type="button" class="timepill" data-date="${s.date}"` +
    ` data-title="${escapeHtml(s.title)}"` +
    ` title="Show ${fmtDate(s.date)} on the board">${fmtTime(s.time)}</button>` +
    `<button class="icsbtn" data-ics="1" title="Add to calendar" aria-label="Add ${escapeHtml(s.title)} ${fmtTime(s.time)} to calendar">+</button>` +
    `</span>`;
}

function filmTitleHtml(title, date) {
  const slug = filmSlug(title);
  return `<h2 class="film__title"><a class="filmpermalink" href="#${date}/film/${slug}"` +
    ` data-date="${date}" data-slug="${slug}">${escapeHtml(title)}</a>` +
    `${filmYearHtml(title)}</h2>`;
}

function filmLinks(title) {
  const q = encodeURIComponent(title);
  return `<span class="filmlinks">` +
    `<a href="https://letterboxd.com/search/${q}/" target="_blank" rel="noopener">Letterboxd</a>` +
    `<a href="https://www.imdb.com/find/?q=${q}" target="_blank" rel="noopener">IMDb</a>` +
    `</span>`;
}

function badgeHtml(notes) {
  const set = [...new Set(notes.filter(Boolean).flatMap((n) => n.split(", ")))];
  return set.map((b) => `<span class="fbadge">${escapeHtml(b)}</span>`).join("");
}

// event delegation for the calendar buttons (screenings attached at render)
const icsRegistry = new Map();
let icsCounter = 0;

function registerIcs(s) {
  const key = String(++icsCounter);
  icsRegistry.set(key, s);
  return key;
}

document.addEventListener("click", (e) => {
  const perm = e.target.closest("a.filmpermalink");
  if (perm) {
    e.preventDefault();
    state.date = perm.dataset.date;
    state.view = "films";
    state.film = perm.dataset.slug;
    state.scrollTitle = null;
    state.pendingScroll = true;
    syncHash();
    render();
    return;
  }
  const time = e.target.closest("button.timepill");
  if (time) {
    state.date = time.dataset.date;
    state.view = "board";
    state.film = null;
    state.scrollTitle = time.dataset.title;
    state.pendingScroll = true;
    syncHash();
    render();
    return;
  }
  const goto = e.target.closest("[data-goto-date]");
  if (goto) {
    state.date = goto.dataset.gotoDate;
    state.film = null;
    state.scrollTitle = null;
    if (state.view === "all") state.view = "board";
    syncHash();
    render();
    return;
  }
  const btn = e.target.closest("[data-ics]");
  if (btn && icsRegistry.has(btn.dataset.icsKey)) {
    downloadICS(icsRegistry.get(btn.dataset.icsKey));
  }
});

function attachIcsKeys(container, list) {
  const btns = container.querySelectorAll("[data-ics]:not([data-ics-key])");
  btns.forEach((b, i) => {
    if (list[i]) b.dataset.icsKey = registerIcs(list[i]);
  });
}

/* ---------- by-film view (single day) ---------- */

function renderFilms() {
  const wrap = $("#films");
  wrap.innerHTML = "";
  icsRegistry.clear();
  const shows = screeningsOn(state.date);
  if (!shows.length) return;

  const byFilm = new Map();
  for (const s of shows) {
    const key = s.title.toLowerCase();
    if (!byFilm.has(key)) byFilm.set(key, { title: s.title, venues: new Map(), notes: [] });
    const f = byFilm.get(key);
    if (!f.venues.has(s.theater)) f.venues.set(s.theater, []);
    f.venues.get(s.theater).push(s);
    f.notes.push(s.note);
  }

  const films = [...byFilm.values()].sort((a, b) => a.title.localeCompare(b.title));
  for (const f of films) {
    const div = document.createElement("div");
    div.className = "film";
    const ordered = [];
    const venues = [...f.venues.entries()]
      .map(([id, list]) => {
        const t = state.data.theaters[id];
        list.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        ordered.push(...list);
        const pills = list.map(pillGroup).join("");
        return `<div class="film__venue"><span class="film__venuename">` +
               `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${t.name}</a>` +
               `<small>${t.city}</small></span>${pills}</div>`;
      })
      .join("");
    const desc = filmDesc(f.title);
    const slug = filmSlug(f.title);
    div.className = "film" + (state.film === slug ? " is-focus" : "");
    div.innerHTML =
      filmThumb(f.title) +
      `<div class="film__head">${filmTitleHtml(f.title, state.date)}` +
      badgeHtml(f.notes) + filmLinks(f.title) +
      (desc ? `<p class="film__desc">${escapeHtml(desc)}</p>` : "") +
      `</div>` +
      `<div class="film__where">${venues}</div>`;
    attachIcsKeys(div, ordered);
    wrap.appendChild(div);
  }
}

/* ---------- all-films view (search across dates) ---------- */

function renderAll() {
  const wrap = $("#allfilmsList");
  wrap.innerHTML = "";
  icsRegistry.clear();
  const today = isoToday();

  const byFilm = new Map();
  for (const s of state.data.screenings) {
    if (s.date < today || state.off.has(s.theater) || !passesFilters(s) || !matchesQuery(s)) continue;
    const key = s.title.toLowerCase();
    if (!byFilm.has(key)) byFilm.set(key, { title: s.title, dates: new Map(), notes: [] });
    const f = byFilm.get(key);
    if (!f.dates.has(s.date)) f.dates.set(s.date, []);
    f.dates.get(s.date).push(s);
    f.notes.push(s.note);
  }

  const films = [...byFilm.values()].sort((a, b) => a.title.localeCompare(b.title));
  for (const f of films) {
    const div = document.createElement("div");
    div.className = "film";
    const ordered = [];
    const dateRows = [...f.dates.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, list]) => {
        list.sort((a, b) =>
          (a.theater + (a.time || "")).localeCompare(b.theater + (b.time || "")));
        const byTheater = new Map();
        for (const s of list) {
          if (!byTheater.has(s.theater)) byTheater.set(s.theater, []);
          byTheater.get(s.theater).push(s);
        }
        const parts = [...byTheater.entries()].map(([tid, ss]) => {
          ordered.push(...ss);
          const t = state.data.theaters[tid];
          return `<span class="allfilm__venue">` +
                 `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${t.name}</a>` +
                 `</span>` +
                 ss.map(pillGroup).join("");
        }).join("");
        return `<div class="film__venue"><span class="film__venuename">` +
               `${fmtDate(iso)}</span>${parts}</div>`;
      })
      .join("");
    const desc = filmDesc(f.title);
    const firstDate = [...f.dates.keys()].sort()[0];
    const slug = filmSlug(f.title);
    div.className = "film" + (state.film === slug ? " is-focus" : "");
    div.innerHTML =
      filmThumb(f.title) +
      `<div class="film__head">${filmTitleHtml(f.title, firstDate)}` +
      badgeHtml(f.notes) + filmLinks(f.title) +
      (desc ? `<p class="film__desc">${escapeHtml(desc)}</p>` : "") +
      `</div>` +
      `<div class="film__where">${dateRows}</div>`;
    attachIcsKeys(div, ordered);
    wrap.appendChild(div);
  }
}

/* ---------- shell ---------- */

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- theme ---------- */

const THEME_KEY = "bayfilm.theme";
const THEME_COLORS = { light: "#F1F2EF", dark: "#191B1C" };

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
  const btn = $("#themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "Light mode ◐" : "Dark mode ◐";
}

function initTheme() {
  applyTheme(document.documentElement.dataset.theme || "light");
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    applyTheme(next);
  });
  // follow OS changes unless the user has made an explicit choice
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (err) {}
    if (stored !== "light" && stored !== "dark") {
      applyTheme(e.matches ? "dark" : "light");
    }
  });
}

function initMastPanels() {
  // masthead disclosure links; one panel open at a time, below the link row
  const links = [...document.querySelectorAll(".mastlink[aria-controls]")];
  for (const btn of links) {
    btn.addEventListener("click", () => {
      const panel = $("#" + btn.getAttribute("aria-controls"));
      const willOpen = panel.hidden;
      for (const other of links) {
        $("#" + other.getAttribute("aria-controls")).hidden = true;
        other.setAttribute("aria-expanded", "false");
      }
      panel.hidden = !willOpen;
      btn.setAttribute("aria-expanded", String(willOpen));
    });
  }
}

function syncHash() {
  let suffix = "";
  if (state.film) suffix = "/film/" + state.film;
  else if (state.view === "films") suffix = "/films";
  else if (state.view === "all") suffix = "/all";
  history.replaceState(null, "", "#" + state.date + suffix);
}

function otherDatesForQuery() {
  const today = isoToday();
  const dates = new Set();
  for (const s of state.data.screenings) {
    if (s.date < today || s.date === state.date) continue;
    if (state.off.has(s.theater) || !passesFilters(s) || !matchesQuery(s)) continue;
    dates.add(s.date);
  }
  return [...dates].sort();
}

function hiddenQueryHit() {
  const today = isoToday();
  const q = queryText();
  if (!q || !state.off.size) return false;
  return state.data.screenings.some((s) =>
    s.date >= today &&
    (state.view === "all" || s.date === state.date) &&
    state.off.has(s.theater) && passesFilters(s) && matchesQuery(s));
}

function updateEmptyState() {
  const q = queryText();
  const empty = $("#empty");
  const emptySearch = $("#emptySearch");
  const also = $("#alsoOn");
  const countEl = $("#matchCount");
  const count = state.view === "all"
    ? $("#allfilmsList").children.length
    : screeningsOn(state.date).length;
  const blank = count === 0;

  empty.hidden = !(blank && !q);
  emptySearch.hidden = !(blank && q);
  if (blank && q) {
    const quoted = `“${q}”`;
    if (hiddenQueryHit() && state.view === "all") {
      emptySearch.textContent = `No films match ${quoted} in the theaters that are on.`;
    } else if (state.view === "all") {
      emptySearch.textContent = `No films match ${quoted}.`;
    } else if (hiddenQueryHit()) {
      emptySearch.textContent = `No films match ${quoted} on this day in the theaters that are on.`;
    } else {
      emptySearch.textContent = `No films match ${quoted} on this day.`;
    }
  }

  const others = state.view === "all" || !q ? [] : otherDatesForQuery();
  if (others.length) {
    const shown = others.slice(0, 5);
    const more = others.length - shown.length;
    also.hidden = false;
    also.innerHTML = `Also playing ` + shown.map((iso) =>
      `<button type="button" class="linkbtn" data-goto-date="${iso}">${fmtDate(iso)}</button>`
    ).join(" · ") + (more ? ` · and ${more} more` : "");
  } else {
    also.hidden = true;
    also.innerHTML = "";
  }

  if (state.view === "all") {
    countEl.hidden = count === 0;
    countEl.textContent = count ? `${count} film${count === 1 ? "" : "s"}` : "";
  } else if (q && count) {
    countEl.hidden = false;
    countEl.textContent = `${count} on this day`;
  } else {
    countEl.hidden = true;
    countEl.textContent = "";
  }
  updateEmptyFilters();
}

function scrollToFocus() {
  const go = () => {
    setStickyOffsets();
    const target = document.querySelector(
      ".film.is-focus, .stub-link.is-focus, .tl__row.is-focus");
    if (!target) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };
  // wait for the display font — it changes the day strip's height, and a
  // scroll that lands first slides the row out from under the strip
  if (document.fonts && document.fonts.status !== "loaded") {
    document.fonts.ready.then(() => requestAnimationFrame(go));
  } else {
    requestAnimationFrame(go);
  }
}

function setStickyOffsets() {
  // sticky axis / hour headers pin just below the sticky day strip
  const strip = $("#daystrip");
  document.documentElement.style.setProperty(
    "--daystrip-h", (strip ? strip.offsetHeight : 0) + "px");
  updateStuckShade();
}

// while the day strip is pinned, a solid cover extends above it so board
// content can't peek out the top during mobile toolbar/overscroll shifts
function updateStuckShade() {
  const strip = $("#daystrip");
  if (strip) {
    // pinned position can land on a subpixel just above 0
    strip.classList.toggle("is-stuck", strip.getBoundingClientRect().top <= 1);
  }
}

function render() {
  renderDaystrip();
  renderStaleNote();
  renderChips();
  setStickyOffsets();
  $("#nowJump").hidden = true; // board render re-shows it when applicable
  $("#board").hidden = state.view !== "board";
  $("#films").hidden = state.view !== "films";
  $("#allfilms").hidden = state.view !== "all";
  for (const [id, v] of [["viewBoard", "board"], ["viewFilms", "films"], ["viewAll", "all"]]) {
    $("#" + id).classList.toggle("is-active", state.view === v);
    $("#" + id).setAttribute("aria-pressed", String(state.view === v));
  }
  if (state.view === "board") renderBoard();
  else if (state.view === "films") renderFilms();
  else renderAll();
  updateEmptyState();
  const scroll = state.pendingScroll;
  state.pendingScroll = false;
  if (scroll) scrollToFocus();
}

async function init() {
  initTheme();
  initMastPanels();
  try {
    const resp = await fetch("data/showtimes.json");
    if (!resp.ok) throw new Error(resp.status);
    state.data = await resp.json();
  } catch (e) {
    $("#loaderror").hidden = false;
    return;
  }
  state.data.films = state.data.films || {};

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    state.off = new Set(saved.filter((id) => id in state.data.theaters));
  } catch (e) { /* ignore bad storage */ }

  try {
    const f = JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}");
    if (f.era === "new" || f.era === "rep") state.era = f.era;
    state.onfilm = !!f.onfilm;
  } catch (e) { /* ignore bad storage */ }

  const today = isoToday();
  const { dates } = futureDates();
  const parts = location.hash.replace(/^#/, "").split("/");
  const hashDate = parts[0];
  state.date = dates.includes(hashDate) ? hashDate : dates[0] || today;
  if (parts[1] === "film" && parts[2]) {
    state.view = "films";
    state.film = decodeURIComponent(parts[2]);
    state.pendingScroll = true;
  } else if (parts[1] === "films") {
    state.view = "films";
  } else if (parts[1] === "all") {
    state.view = "all";
  }

  $("#updated").textContent =
    "Listings refreshed " +
    new Date(state.data.generated_at).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

  console.log(
    "%cBAYFILM",
    "font: 600 22px 'Source Sans 3', sans-serif; color: #DB4B1F;",
    "· the data lives at /data/showtimes.json · see more movies on real screens ✦"
  );

  $("#sources").innerHTML =
    "Sources: " +
    Object.values(state.data.theaters)
      .map((t) => `<a href="${t.url}" target="_blank" rel="noopener">${t.name}</a>`)
      .join(" · ");

  for (const [id, v] of [["viewBoard", "board"], ["viewFilms", "films"], ["viewAll", "all"]]) {
    $("#" + id).addEventListener("click", () => {
      state.view = v;
      state.film = null;
      state.scrollTitle = null;
      syncHash();
      render();
      if (v === "all") $("#filmSearch").focus();
    });
  }

  $("#filmSearch").addEventListener("input", (e) => {
    state.query = e.target.value;
    state.film = null;
    render();
  });

  $("#clearFilters").addEventListener("click", () => {
    state.era = "all";
    state.onfilm = false;
    saveFilmFilters();
    render();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setStickyOffsets();
      if (state.view === "board") renderBoard();
    }, 150);
  });

  // keep the now-line and past-dimming honest while the tab stays open
  setInterval(updateBoardClock, 60 * 1000);

  // show/hide the floating "now" button as the divider leaves the viewport
  let jumpTick = false;
  window.addEventListener("scroll", () => {
    if (jumpTick) return;
    jumpTick = true;
    requestAnimationFrame(() => {
      jumpTick = false;
      updateNowJump();
      updateStuckShade();
    });
  }, { passive: true });

  render();
}

init();
