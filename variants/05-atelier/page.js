/* 05 — АТЕЛЬЕ: медленный перебор, почти без мельтешения, и проявление
   нового сезона мягким фокусом. */

const { load, nextPicks, savePicks, copy, noteFor, announce, tieCount } = window.Vibedeck;

const els = {
  slots: document.getElementById("slots"),
  foot: document.getElementById("foot"),
  spin: document.getElementById("spin"),
  spinLabel: document.getElementById("spin-label"),
  count: document.getElementById("count"),
  toast: document.getElementById("toast"),
  live: document.getElementById("live"),
  error: document.getElementById("error"),
  retry: document.getElementById("retry"),
};

const state = { data: null, picks: [], views: [], busy: false };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const STOPS = [900, 1050, 1200, 1350];

function swatchNode(color, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.setProperty("--sw", color.hex);
  button.title = `${color.name} · ${color.hex}`;
  button.setAttribute("aria-label", `Скопировать ${color.name}, ${color.hex}`);
  button.addEventListener("click", () => copy(color));

  const chip = document.createElement("span");
  chip.className = "swatch__chip";

  const legend = document.createElement("span");
  legend.className = "swatch__legend";

  const name = document.createElement("span");
  name.className = "swatch__name";
  name.textContent = color.name;

  const hex = document.createElement("span");
  hex.className = "swatch__hex";
  hex.textContent = color.hex;

  legend.append(name, hex);
  button.append(chip, legend);
  return button;
}

function valueNode(slot, index) {
  if (slot.type === "palette") {
    const palette = slot.items[index];
    const row = document.createElement("div");
    row.className = "swatches";
    palette.colors.forEach((color, i) => row.append(swatchNode(color, i)));
    return row;
  }

  const value = document.createElement("p");
  value.className = "slot__word";
  value.textContent = slot.items[index].title;
  return value;
}

function paint(view, index) {
  view.value.replaceChildren(valueNode(view.slot, index));
  view.note.textContent = noteFor(view.slot, view.slot.items[index]);
  if (view.slot.id === "name") {
    const title = view.slot.items[index].title;
    view.el.classList.toggle("is-long", title.length > 8);
  }
}

function build() {
  const fragment = document.createDocumentFragment();

  state.views = state.data.slots.map((slot, index) => {
    const el = document.createElement("article");
    el.className = `slot slot--${slot.id}`;

    const head = document.createElement("header");
    head.className = "slot__head";

    const label = document.createElement("span");
    label.className = "slot__label";
    label.textContent = slot.label;

    const num = document.createElement("span");
    num.className = "slot__num";
    num.textContent = String(index + 1).padStart(2, "0");

    const value = document.createElement("div");
    value.className = "slot__value";

    const note = document.createElement("p");
    note.className = "slot__note";

    head.append(label, num);
    el.append(head, value, note);
    fragment.append(el);

    return { slot, el, value, note };
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
    view.el.classList.add("is-churning");

    const timer = window.setInterval(() => {
      current = (current + 1 + Math.floor(Math.random() * (total - 1))) % total;
      paint(view, current);
    }, 200);

    window.setTimeout(() => {
      window.clearInterval(timer);
      paint(view, target);
      view.el.classList.remove("is-churning");
      view.el.classList.add("is-landed");
      window.setTimeout(() => view.el.classList.remove("is-landed"), 820);
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
  }, 2000);
}

window.addEventListener("vibedeck:copy", (event) => {
  const { hex, name } = event.detail;
  showToast(`Скопировано ${hex} · ${name}`);
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
    els.count.textContent = tieCount(data).toLocaleString("ru-RU");
    els.foot.hidden = false;
    els.slots.setAttribute("aria-busy", "false");
  } catch {
    showError();
  }
}

els.spin.addEventListener("click", spin);
els.retry.addEventListener("click", boot);
boot();
