/* 02 — МАКЕТ: прокрут — это серия мгновенных срезов, посадка — короткий
   красный тик на линейке и шторка значения. */

const { load, nextPicks, savePicks, copy, noteFor, announce } = window.Vibedeck;

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
const STOPS = [520, 700, 880, 1060];

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
  els.live.textContent = announce(state.data, target);
}

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
    const { data, picks } = await load();
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
