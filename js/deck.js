/* VIBEDECK — главная. Прокрут — это серия мгновенных срезов, посадка —
   короткий красный тик на линейке и шторка значения. */

const DATA_URL = "data/vibedeck.json";
const STORE_KEY = "vibedeck:last";
const STOPS = [520, 700, 880, 1060];

const NOTES = {
  mood: "Настроение",
  name: "Имя бренда",
};

const els = {
  slots: document.getElementById("slots"),
  foot: document.getElementById("foot"),
  spin: document.getElementById("spin"),
  spinLabel: document.getElementById("spin-label"),
  toast: document.getElementById("toast"),
  live: document.getElementById("live"),
  error: document.getElementById("error"),
  retry: document.getElementById("retry"),
};

const state = { data: null, picks: [], views: [], busy: false };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Данные ---------- */

function randomPicks(data) {
  return data.slots.map((slot) => Math.floor(Math.random() * slot.items.length));
}

function pickOther(slot, current) {
  const total = slot.items.length;
  if (total < 2) return 0;
  let next = Math.floor(Math.random() * (total - 1));
  if (next >= current) next += 1;
  return next;
}

function nextPicks(data, picks) {
  return data.slots.map((slot, i) => pickOther(slot, picks[i]));
}

function readPicks(data) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
    if (!saved || saved.version !== data.version) return null;
    if (!Array.isArray(saved.picks) || saved.picks.length !== data.slots.length) return null;
    const valid = data.slots.every((slot, i) => {
      const pick = saved.picks[i];
      return Number.isInteger(pick) && pick >= 0 && pick < slot.items.length;
    });
    return valid ? saved.picks : null;
  } catch {
    return null;
  }
}

function savePicks(data, picks) {
  try {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ version: data.version, picks }),
    );
  } catch {
    /* приватный режим — комбинация просто не восстановится */
  }
}

async function loadData() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.slots) || !data.slots.length) throw new Error("Пустые данные");
  const picks = readPicks(data) || randomPicks(data);
  savePicks(data, picks);
  return { data, picks };
}

/* ---------- Копирование ---------- */

async function copy(color) {
  try {
    await navigator.clipboard.writeText(color.hex);
  } catch {
    const field = document.createElement("textarea");
    field.value = color.hex;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:-40px;left:0;opacity:0";
    document.body.append(field);
    field.select();
    try {
      document.execCommand("copy");
    } catch {
      /* копирование недоступно — тост всё равно покажет значение */
    }
    field.remove();
  }
  window.dispatchEvent(new CustomEvent("vibedeck:copy", { detail: color }));
}

/* ---------- Разметка ---------- */

function swatchNode(color) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "swatch";
  item.style.setProperty("--sw", color.hex);
  item.title = `${color.name} · ${color.hex}`;
  item.setAttribute("aria-label", `Скопировать ${color.name}, ${color.hex}`);
  item.addEventListener("click", () => copy(color));

  const chip = document.createElement("span");
  chip.className = "swatch__chip";

  const legend = document.createElement("span");
  legend.className = "swatch__legend";

  const name = document.createElement("span");
  name.textContent = color.name;

  const hex = document.createElement("span");
  hex.className = "swatch__hex";
  hex.textContent = color.hex;

  legend.append(name, hex);
  item.append(chip, legend);
  return item;
}

function valueNode(slot, index) {
  if (slot.type === "palette") {
    const palette = slot.items[index];
    const strip = document.createElement("div");
    strip.className = "strip";
    palette.colors.forEach((color) => strip.append(swatchNode(color)));
    return strip;
  }

  const value = document.createElement("p");
  value.textContent = slot.items[index].title;
  return value;
}

function noteFor(slot, item) {
  if (!item) return "";
  if (slot.type === "palette") return item.title;
  return item.meta || NOTES[slot.id] || "";
}

function paint(view, index) {
  view.value.replaceChildren(valueNode(view.slot, index));
  view.note.textContent = noteFor(view.slot, view.slot.items[index]);
}

function build() {
  const fragment = document.createDocumentFragment();

  state.views = state.data.slots.map((slot, index) => {
    const row = document.createElement("article");
    row.className = "row";

    const meta = document.createElement("div");
    meta.className = "row__meta";

    const num = document.createElement("span");
    num.className = "row__num";
    num.textContent = String(index + 1).padStart(2, "0");

    const label = document.createElement("span");
    label.className = "row__label";
    label.textContent = slot.label;

    const value = document.createElement("div");
    value.className = "row__value";

    const note = document.createElement("p");
    note.className = "row__note";

    meta.append(num, label);
    row.append(meta, value, note);
    fragment.append(row);

    return { slot, row, value, note };
  });

  els.slots.replaceChildren(fragment);
  state.views.forEach((view, i) => paint(view, state.picks[i]));
}

/* ---------- Прокрут ---------- */

function setBusy(busy) {
  state.busy = busy;
  els.spin.disabled = busy;
  els.spinLabel.textContent = busy ? "Крутим…" : "Крутить";
  els.slots.setAttribute("aria-busy", busy ? "true" : "false");
}

function churn(view, target, duration) {
  if (reduceMotion.matches) {
    paint(view, target);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const total = view.slot.items.length;
    let current = state.picks[state.views.indexOf(view)];

    const timer = window.setInterval(() => {
      current = (current + 1 + Math.floor(Math.random() * (total - 1))) % total;
      paint(view, current);
    }, 65);

    window.setTimeout(() => {
      window.clearInterval(timer);
      paint(view, target);
      view.row.classList.add("is-landed");
      window.setTimeout(() => view.row.classList.remove("is-landed"), 640);
      resolve();
    }, duration);
  });
}

function announce() {
  const parts = state.data.slots.map(
    (slot, i) => `${slot.label} — ${slot.items[state.picks[i]].title}`,
  );
  els.live.textContent = `Новая комбинация. ${parts.join(". ")}.`;
}

async function spin() {
  if (state.busy || !state.data) return;
  setBusy(true);

  const target = nextPicks(state.data, state.picks);
  await Promise.all(
    state.views.map((view, i) =>
      churn(view, target[i], reduceMotion.matches ? 0 : STOPS[i % STOPS.length]),
    ),
  );

  state.picks = target;
  savePicks(state.data, target);
  setBusy(false);
  announce();
}

/* ---------- Тост ---------- */

let toastTimer = 0;

function showToast(text) {
  els.toast.textContent = text;
  els.toast.dataset.show = "true";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.dataset.show = "false";
  }, 1900);
}

window.addEventListener("vibedeck:copy", (event) => {
  const { hex, name } = event.detail;
  showToast(`${hex} скопирован · ${name}`);
});

/* ---------- Запуск ---------- */

function showError() {
  els.slots.hidden = true;
  els.foot.hidden = true;
  els.error.hidden = false;
  els.slots.setAttribute("aria-busy", "false");
}

async function boot() {
  els.error.hidden = true;
  els.slots.hidden = false;

  try {
    const { data, picks } = await loadData();
    state.data = data;
    state.picks = picks;
    build();
    els.foot.hidden = false;
    els.slots.setAttribute("aria-busy", "false");
  } catch {
    showError();
  }
}

els.spin.addEventListener("click", spin);
els.retry.addEventListener("click", boot);
boot();
