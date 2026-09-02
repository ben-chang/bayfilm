/* BayFilm — renders site/data/showtimes.json */

const $ = (sel) => document.querySelector(sel);

const state = {
  data: null,
  date: null,            // "YYYY-MM-DD"
  off: new Set(),        // disabled theater ids
  view: "board",
};

const LANE_H = 40;
const STUB_EST_PX = 190;  // rough rendered stub width, for lane collision

function isoToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
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

function screeningsOn(date) {
  return state.data.screenings.filter(
    (s) => s.date === date && !state.off.has(s.theater)
  );
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
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const iso of dates) {
    const d = parseISO(iso);
    const btn = document.createElement("button");
    btn.className = "day" +
      (iso === state.date ? " is-selected" : "") +
      (iso === today ? " is-today" : "");
    btn.innerHTML =
      `<span class="day__dow">${iso === today ? "Today" : dows[d.getDay()]}</span>` +
      `<span class="day__num">${months[d.getMonth()]} ${d.getDate()}</span>` +
      `<span class="day__count">${counts[iso]} shows</span>`;
    btn.addEventListener("click", () => {
      state.date = iso;
      syncHash();
      render();
    });
    strip.appendChild(btn);
  }
}

/* ---------- theater chips ---------- */

function renderChips() {
  const wrap = $("#theaterChips");
  wrap.innerHTML = "";
  for (const [id, t] of Object.entries(state.data.theaters)) {
    const btn = document.createElement("button");
    btn.className = "chip" + (state.off.has(id) ? " is-off" : "");
    btn.setAttribute("aria-pressed", String(!state.off.has(id)));
    btn.innerHTML = `${t.name}<small>${t.city}</small>`;
    btn.addEventListener("click", () => {
      state.off.has(id) ? state.off.delete(id) : state.off.add(id);
      render();
    });
    wrap.appendChild(btn);
  }
}

/* ---------- board view ---------- */

function renderBoard() {
  const board = $("#board");
  board.innerHTML = "";
  const shows = screeningsOn(state.date);
  $("#empty").hidden = shows.length > 0;
  if (!shows.length) return;

  const timed = shows.filter((s) => s.time);
  let startH = 12, endH = 24;
  if (timed.length) {
    startH = Math.min(12, Math.floor(minutes(timed[0].time) / 60));
    endH = Math.max(
      startH + 8,
      Math.ceil(Math.max(...timed.map((s) => minutes(s.time))) / 60) + 1
    );
  }
  const span = (endH - startH) * 60;
  const desktop = window.matchMedia("(min-width: 761px)").matches;

  // axis
  const axis = document.createElement("div");
  axis.className = "axis";
  const step = endH - startH > 10 ? 2 : 1;
  for (let h = startH; h <= endH; h += step) {
    const tick = document.createElement("span");
    tick.className = "axis__tick";
    tick.style.left = (((h - startH) * 60) / span) * 100 + "%";
    tick.textContent = fmtHour(h);
    axis.appendChild(tick);
  }
  board.appendChild(axis);

  for (const [id, t] of Object.entries(state.data.theaters)) {
    if (state.off.has(id)) continue;
    const mine = shows
      .filter((s) => s.theater === id)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    if (!mine.length) continue;

    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML =
      `<div class="trow__label"><div class="trow__name">${t.name}</div>` +
      `<div class="trow__city">${t.city}</div></div>`;
    const lanes = document.createElement("div");
    lanes.className = "trow__lanes";
    lanes.style.setProperty("--hours", endH - startH);
    row.appendChild(lanes);
    board.appendChild(row);

    // lane assignment needs the rendered width to estimate stub overlap
    const width = lanes.clientWidth || 900;
    const gapMin = (STUB_EST_PX / width) * span;
    const laneEnds = [];

    for (const s of mine) {
      const a = document.createElement("a");
      a.className = "stub-link";
      a.href = s.url || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML =
        `<span class="stub"><span class="stub__time">${fmtTime(s.time)}</span>` +
        `<span class="stub__title">${escapeHtml(s.title)}</span></span>`;
      a.title = `${s.title} — ${fmtTime(s.time)} at ${t.name}`;
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

/* ---------- by-film view ---------- */

function renderFilms() {
  const wrap = $("#films");
  wrap.innerHTML = "";
  const shows = screeningsOn(state.date);
  $("#empty").hidden = shows.length > 0;

  const byFilm = new Map();
  for (const s of shows) {
    const key = s.title.toLowerCase();
    if (!byFilm.has(key)) byFilm.set(key, { title: s.title, venues: new Map() });
    const f = byFilm.get(key);
    if (!f.venues.has(s.theater)) f.venues.set(s.theater, []);
    f.venues.get(s.theater).push(s);
  }

  const films = [...byFilm.values()].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  for (const f of films) {
    const div = document.createElement("div");
    div.className = "film";
    const venues = [...f.venues.entries()]
      .map(([id, list]) => {
        const t = state.data.theaters[id];
        const pills = list
          .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
          .map(
            (s) =>
              `<a class="timepill" href="${s.url || "#"}" target="_blank" rel="noopener">${fmtTime(s.time)}</a>`
          )
          .join("");
        return `<div class="film__venue"><span class="film__venuename">${t.name}` +
               `<small>${t.city}</small></span>${pills}</div>`;
      })
      .join("");
    div.innerHTML =
      `<h2 class="film__title">${escapeHtml(f.title)}</h2>` +
      `<div class="film__where">${venues}</div>`;
    wrap.appendChild(div);
  }
}

/* ---------- shell ---------- */

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function syncHash() {
  history.replaceState(null, "", "#" + state.date +
    (state.view === "films" ? "/films" : ""));
}

function render() {
  renderDaystrip();
  renderChips();
  $("#board").hidden = state.view !== "board";
  $("#films").hidden = state.view !== "films";
  $("#viewBoard").classList.toggle("is-active", state.view === "board");
  $("#viewFilms").classList.toggle("is-active", state.view === "films");
  $("#viewBoard").setAttribute("aria-pressed", String(state.view === "board"));
  $("#viewFilms").setAttribute("aria-pressed", String(state.view === "films"));
  state.view === "board" ? renderBoard() : renderFilms();
}

async function init() {
  try {
    const resp = await fetch("data/showtimes.json");
    if (!resp.ok) throw new Error(resp.status);
    state.data = await resp.json();
  } catch (e) {
    $("#loaderror").hidden = false;
    return;
  }

  const today = isoToday();
  const dates = [...new Set(state.data.screenings.map((s) => s.date))]
    .sort()
    .filter((d) => d >= today);
  const [hashDate, hashView] = location.hash.slice(1).split("/");
  state.date = dates.includes(hashDate) ? hashDate : dates[0] || today;
  if (hashView === "films") state.view = "films";

  $("#updated").textContent =
    "Listings refreshed " +
    new Date(state.data.generated_at).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

  $("#sources").innerHTML =
    "Sources: " +
    Object.values(state.data.theaters)
      .map((t) => `<a href="${t.url}" target="_blank" rel="noopener">${t.name}</a>`)
      .join(" · ");

  $("#viewBoard").addEventListener("click", () => { state.view = "board"; syncHash(); render(); });
  $("#viewFilms").addEventListener("click", () => { state.view = "films"; syncHash(); render(); });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.view === "board") renderBoard();
    }, 150);
  });

  render();
}

init();
