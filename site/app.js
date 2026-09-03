/* BayFilm — renders site/data/showtimes.json */

const $ = (sel) => document.querySelector(sel);

const state = {
  data: null,
  date: null,            // "YYYY-MM-DD"
  off: new Set(),        // disabled theater ids
  view: "board",         // board | films | all
  query: "",
  chipsOpen: false,      // theater list expanded (collapsed by default)
};

const LANE_H = 40;
const STUB_EST_PX = 230;  // rough rendered stub width, for lane collision
const STORAGE_KEY = "bayfilm.hidden";

// board lanes group under these region headers, in this order
const REGION_ORDER = ["SF", "East Bay", "North Bay", "Peninsula", "South Bay"];

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
    (s) => s.date === date && !state.off.has(s.theater)
  );
}

function filmDesc(title) {
  return (state.data.films[title.toLowerCase()] || {}).desc || null;
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
  const counts = {};
  for (const s of state.data.screenings) {
    counts[s.date] = (counts[s.date] || 0) + 1;
  }
  const today = isoToday();
  const dates = Object.keys(counts).sort().filter((d) => d >= today).slice(0, 14);
  const strip = $("#daystrip");
  strip.innerHTML = "";
  for (const iso of dates) {
    const d = parseISO(iso);
    const btn = document.createElement("button");
    btn.className = "day" +
      (iso === state.date ? " is-selected" : "") +
      (iso === today ? " is-today" : "");
    btn.innerHTML =
      `<span class="day__dow">${iso === today ? "Today" : DOWS[d.getDay()]}</span>` +
      `<span class="day__num">${MONTHS[d.getMonth()]} ${d.getDate()}</span>` +
      `<span class="day__count">${counts[iso]} shows</span>`;
    btn.addEventListener("click", () => {
      state.date = iso;
      if (state.view === "all") state.view = "board";
      syncHash();
      render();
    });
    strip.appendChild(btn);
  }
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

  // mobile: the theater list collapses behind this toggle
  const total = Object.keys(state.data.theaters).length;
  const on = total - state.off.size;
  const toggle = document.createElement("button");
  toggle.className = "chiptoggle";
  toggle.setAttribute("aria-expanded", String(state.chipsOpen));
  toggle.innerHTML =
    `Theaters · ${on} of ${total} <span class="chiptoggle__arrow">${state.chipsOpen ? "▴" : "▾"}</span>`;
  toggle.addEventListener("click", () => {
    state.chipsOpen = !state.chipsOpen;
    renderChips();
  });
  wrap.appendChild(toggle);

  const chipRow = document.createElement("div");
  chipRow.className = "chiprow" + (state.chipsOpen ? " is-open" : "");
  for (const [id, t] of Object.entries(state.data.theaters)) {
    const btn = document.createElement("button");
    btn.className = "chip" + (state.off.has(id) ? " is-off" : "");
    btn.setAttribute("aria-pressed", String(!state.off.has(id)));
    btn.innerHTML = `${t.name}<small>${t.city}</small>`;
    btn.addEventListener("click", () => {
      state.off.has(id) ? state.off.delete(id) : state.off.add(id);
      saveFilters();
      render();
    });
    chipRow.appendChild(btn);
  }
  wrap.appendChild(chipRow);
}

/* ---------- board view ---------- */

function renderBoard() {
  const board = $("#board");
  board.innerHTML = "";
  const shows = screeningsOn(state.date);
  $("#empty").hidden = shows.length > 0;
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
  const regionRank = (r) =>
    REGION_ORDER.indexOf(r) === -1 ? REGION_ORDER.length : REGION_ORDER.indexOf(r);
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
    row.className = "trow";
    row.innerHTML =
      `<div class="trow__label">` + regionTag + `<div class="trow__name">` +
      `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${t.name}</a></div>` +
      `<div class="trow__city">${t.city}</div>` +
      (stale ? `<div class="trow__stale">${stale}</div>` : "") +
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
      a.className = "stub-link" + (past ? " is-past" : "");
      if (isToday && s.time) a.dataset.time = s.time;
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

  const staleNotes = [...new Set(
    sorted.map((s) => {
      const t = state.data.theaters[s.theater];
      const label = staleLabel(t);
      return label ? `${SHORT_NAMES[s.theater] || t.name} ${label}` : null;
    }).filter(Boolean))];

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
    if (!nowPlaced) earlierCount++;
    const img = (state.data.films[s.title.toLowerCase()] || {}).img;
    bucket.push(
      `<a class="tl__row${past ? " is-past" : ""}" href="${s.url || "#"}"` +
      (isToday && s.time ? ` data-time="${s.time}"` : "") +
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
  if (staleNotes.length) {
    parts.push(`<p class="tl__stale">${staleNotes.join(" · ")}</p>`);
  }
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
    `<a class="timepill" href="${s.url || "#"}" target="_blank" rel="noopener"` +
    ` title="Tickets: ${escapeHtml(s.title)} ${fmtTime(s.time)}">${fmtTime(s.time)}</a>` +
    `<button class="icsbtn" data-ics="1" title="Add to calendar" aria-label="Add ${escapeHtml(s.title)} ${fmtTime(s.time)} to calendar">+</button>` +
    `</span>`;
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
  $("#empty").hidden = shows.length > 0;

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
        return `<div class="film__venue"><span class="film__venuename">${t.name}` +
               `<small>${t.city}</small></span>${pills}</div>`;
      })
      .join("");
    const desc = filmDesc(f.title);
    div.innerHTML =
      filmThumb(f.title) +
      `<div class="film__head"><h2 class="film__title">${escapeHtml(f.title)}</h2>` +
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
  const q = state.query.trim().toLowerCase();

  const byFilm = new Map();
  for (const s of state.data.screenings) {
    if (s.date < today || state.off.has(s.theater)) continue;
    if (q && !(s.title.toLowerCase().includes(q) ||
               (s.note || "").toLowerCase().includes(q))) continue;
    const key = s.title.toLowerCase();
    if (!byFilm.has(key)) byFilm.set(key, { title: s.title, dates: new Map(), notes: [] });
    const f = byFilm.get(key);
    if (!f.dates.has(s.date)) f.dates.set(s.date, []);
    f.dates.get(s.date).push(s);
    f.notes.push(s.note);
  }

  $("#empty").hidden = byFilm.size > 0;
  $("#allCount").textContent = byFilm.size
    ? `${byFilm.size} film${byFilm.size === 1 ? "" : "s"}`
    : "";

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
          return `<span class="allfilm__venue">${state.data.theaters[tid].name}</span>` +
                 ss.map(pillGroup).join("");
        }).join("");
        return `<div class="film__venue"><span class="film__venuename">` +
               `${fmtDate(iso)}</span>${parts}</div>`;
      })
      .join("");
    const desc = filmDesc(f.title);
    div.innerHTML =
      filmThumb(f.title) +
      `<div class="film__head"><h2 class="film__title">${escapeHtml(f.title)}</h2>` +
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
  const suffix = state.view === "films" ? "/films" : state.view === "all" ? "/all" : "";
  history.replaceState(null, "", "#" + state.date + suffix);
}

// now-playing marquee under the masthead; decorative (aria-hidden), built once
function buildTicker() {
  const el = $("#ticker");
  if (!el) return;
  const today = isoToday();
  const now = nowHHMM();
  let prefix = "NOW PLAYING";
  let items = state.data.screenings.filter(
    (s) => s.date === today && s.time && s.time >= now);
  if (items.length < 3) {
    const nextDate = [...new Set(state.data.screenings.map((s) => s.date))]
      .sort().find((d) => d > today);
    if (nextDate) {
      prefix = "COMING UP";
      items = state.data.screenings.filter((s) => s.date === nextDate && s.time);
    }
  }
  items = items.slice(0, 24);
  if (!items.length) return;
  const half = `${prefix} ✦ ` + items.map((s) =>
    `${s.title} ${fmtTime(s.time)} ${SHORT_NAMES[s.theater] || ""}`.trim()
  ).join(" ✦ ") + " ✦ ";
  const track = document.createElement("div");
  track.className = "ticker__track";
  track.textContent = half + half; // two copies = seamless -50% loop
  el.style.setProperty("--ticker-dur", Math.max(45, items.length * 5) + "s");
  el.appendChild(track);
  el.hidden = false;
}

function setStickyOffsets() {
  // sticky axis / hour headers pin just below the sticky day strip
  const strip = $("#daystrip");
  document.documentElement.style.setProperty(
    "--daystrip-h", (strip ? strip.offsetHeight : 0) + "px");
}

function render() {
  renderDaystrip();
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

  const today = isoToday();
  const dates = [...new Set(state.data.screenings.map((s) => s.date))]
    .sort()
    .filter((d) => d >= today);
  const [hashDate, hashView] = location.hash.slice(1).split("/");
  state.date = dates.includes(hashDate) ? hashDate : dates[0] || today;
  if (hashView === "films" || hashView === "all") state.view = hashView;

  $("#updated").textContent =
    "Listings refreshed " +
    new Date(state.data.generated_at).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

  buildTicker();

  console.log(
    "%cBAYFILM",
    "font: 800 22px 'Big Shoulders', sans-serif; color: #DB4B1F;",
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
      syncHash();
      render();
      if (v === "all") $("#filmSearch").focus();
    });
  }

  $("#filmSearch").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderAll();
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
    });
  }, { passive: true });

  render();
}

init();
