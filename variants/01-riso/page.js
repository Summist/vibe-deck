/* 01 — РИЗОГРАФ: прокрут как перепечатка — частые смены значений,
   остановки вразнобой, при посадке — микро-неприводка. */

const { load, nextPicks, savePicks, inkFor, copy, noteFor, announce, tieCount } = window.Vibedeck;

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
const STOPS = [900, 1150, 1420, 1680];

function plateNode(color, index) {
  const plate = document.createElement("button");
  plate.type = "button";
  plate.className = "plate";
  plate.style.setProperty("--sw", color.hex);
  plate.style.setProperty("--sw-ink", inkFor(color.hex));
  plate.title = `${color.name} · ${color.hex}`;
  plate.setAttribute("aria-label", `Скопировать ${color.name}, ${color.hex}`);
  plate.addEventListener("click", () => copy(color));

  const hex = document.createElement("span");
  hex.className = "plate__hex";
  hex.textContent = color.hex;

  const no = document.createElement("span");
  no.className = "plate__no";
  no.textContent = String(index + 1).padStart(2, "0");

  plate.append(hex, no);
  return plate;
}

function valueNode(slot, index) {
  if (slot.type === "palette") {
    const item = slot.items[index];
    const total = item.colors.length;
    const grid = document.createElement("div");
    grid.className = "plates";
    if (total === 3) grid.classList.add("plates--odd");
    if (total > 4) grid.classList.add("plates--many");
    item.colors.forEach((color, i) => grid.append(plateNode(color, i)));
    return grid;
  }

  const item = slot.items[index];
  const word = document.createElement("p");
  word.className = "slot__word";
  if (item.title.length > 24) word.classList.add("slot__word--long");
  word.textContent = item.title;
  return word;
}

function paint(view, index) {
  view.value.replaceChildren(valueNode(view.slot, index));
  view.note.textContent = noteFor(view.slot, view.slot.items[index]);
}

function build() {
  const fragment = document.createDocumentFragment();
  state.views = state.data.slots.map((slot, index) => {
    const el = document.createElement("article");
    el.className = "slot";

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
  els.spinLabel.textContent = busy ? "Печатаем…" : "Крутить";
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
    }, 85);

    window.setTimeout(() => {
      window.clearInterval(timer);
      paint(view, target);
      view.el.classList.remove("is-churning");
      view.el.classList.add("is-landed");
      window.setTimeout(() => view.el.classList.remove("is-landed"), 400);
      resolve();
    }, duration);
  });
}

async function spin() {
  if (state.busy || !state.data) return;
  setBusy(true);

  const target = nextPicks(state.data, state.picks);
  const runs = state.views.map((view, i) =>
    churn(view, target[i], reduceMotion.matches ? 0 : STOPS[i % STOPS.length]),
  );

  await Promise.all(runs);

  state.picks = target;
  savePicks(state.data, target);
  setBusy(false);
  els.live.textContent = announce(state.data, target);
}

/* Тосты */

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
  els.slots.innerHTML = '<p class="slot__note">Печатаем тираж…</p>';

  try {
    const { data, picks } = await load();
    state.data = data;
    state.picks = picks;
    build();
    els.count.textContent = `${tieCount(data).toLocaleString("ru-RU")} комбинаций`;
    els.foot.hidden = false;
    els.slots.setAttribute("aria-busy", "false");
  } catch {
    showError();
  }
}

els.spin.addEventListener("click", spin);
els.retry.addEventListener("click", boot);
boot();
