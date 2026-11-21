/* 03 — ТАБЛО: каждая буква — лепесток. Две волны перебора, вторая
   останавливается на значении; строки стартуют с отставанием. */

const { load, nextPicks, savePicks, inkFor, copy, noteFor, announce, tieCount } = window.Vibedeck;

const els = {
  slots: document.getElementById("slots"),
  foot: document.getElementById("foot"),
  spin: document.getElementById("spin"),
  spinLabel: document.getElementById("spin-label"),
  status: document.getElementById("status"),
  count: document.getElementById("count"),
  toast: document.getElementById("toast"),
  live: document.getElementById("live"),
  error: document.getElementById("error"),
  retry: document.getElementById("retry"),
};

const state = { data: null, picks: [], views: [], busy: false };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const GLYPHS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ0123456789";

const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

function tileSize(box, count) {
  const width = box.clientWidth;
  if (!width || !count) return 34;
  const raw = (width - 3 * (count - 1)) / count;
  return Math.max(11, Math.min(46, raw));
}

function applyTileSize(tiles, size) {
  const font = Math.max(9, Math.min(40, size * 0.7));
  for (const tile of tiles) {
    tile.style.width = `${size}px`;
    tile.style.fontSize = `${font}px`;
  }
}

function flip(tile, text, delay) {
  window.setTimeout(() => {
    tile.classList.add("is-flipping");
    window.setTimeout(() => {
      tile.textContent = text;
      tile.classList.remove("is-flipping");
    }, 105);
  }, delay);
}

function colorNode(color) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "color";
  button.style.setProperty("--sw", color.hex);
  button.style.setProperty("--sw-ink", inkFor(color.hex));
  button.title = `${color.name} · ${color.hex}`;
  button.setAttribute("aria-label", `Скопировать ${color.name}, ${color.hex}`);
  button.addEventListener("click", () => copy(color));

  const hex = document.createElement("span");
  hex.className = "color__hex";
  hex.textContent = color.hex;
  button.append(hex);
  return button;
}

function paintColors(view, index) {
  const palette = view.slot.items[index];
  view.flaps.replaceChildren(
    ...palette.colors.map((color) => colorNode(color)),
  );
  view.flaps.className = "row__colors";
}

function paintChars(view, index) {
  const title = view.slot.items[index].title;
  const chars = [...title.toUpperCase()];
  const box = view.flaps;
  box.className = "row__flaps";

  const tiles = chars.map((char) => {
    const tile = document.createElement("span");
    tile.className = "flap";
    tile.textContent = char === " " ? "\u00A0" : char;
    tile.setAttribute("aria-hidden", "true");
    return tile;
  });

  box.replaceChildren(...tiles);
  applyTileSize(tiles, tileSize(box, tiles.length));
  view.plain.textContent = title;
  view.chars = chars;
  view.tiles = tiles;
}

function animateList(view, target, start) {
  const oldTitle = view.slot.items[state.picks[state.views.indexOf(view)]].title;
  const title = view.slot.items[target].title;
  const chars = [...title.toUpperCase()];
  const oldChars = [...oldTitle.toUpperCase()];
  const box = view.flaps;
  box.className = "row__flaps";

  const tiles = chars.map((char, i) => {
    const tile = document.createElement("span");
    tile.className = "flap";
    const seed = oldChars[i] ?? randomGlyph();
    tile.textContent = seed === " " ? "\u00A0" : seed;
    tile.setAttribute("aria-hidden", "true");
    return tile;
  });

  box.replaceChildren(...tiles);
  applyTileSize(tiles, tileSize(box, tiles.length));
  view.tiles = tiles;
  view.plain.textContent = title;
  view.note.textContent = noteFor(view.slot, view.slot.items[target]);

  if (window.innerWidth <= 820) {
    view.plain.animate(
      [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 340, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
  }

  for (let i = 0; i < tiles.length; i += 1) {
    flip(tiles[i], randomGlyph(), start + i * 12);
  }
  for (let i = 0; i < tiles.length; i += 1) {
    flip(tiles[i], chars[i] === " " ? "\u00A0" : chars[i], start + 170 + i * 16);
  }
  return start + 170 + tiles.length * 16 + 260;
}

function paintPalette(view, index, animate) {
  paintColors(view, index);
  view.plain.textContent = "";
  view.note.textContent = noteFor(view.slot, view.slot.items[index]);
  if (animate) {
    view.flaps.animate(
      [{ opacity: 0.35, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }],
      { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
  }
}

function paintList(view, index) {
  paintChars(view, index);
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

    const flaps = document.createElement("div");
    flaps.className = "row__flaps";

    const plain = document.createElement("p");
    plain.className = "row__plain";

    const note = document.createElement("p");
    note.className = "row__note";

    meta.append(num, label);
    row.append(meta, flaps, plain, note);
    fragment.append(row);

    return { slot, row, flaps, plain, note, tiles: [], chars: [] };
  });

  els.slots.replaceChildren(fragment);
  state.views.forEach((view, i) => {
    if (view.slot.type === "palette") paintPalette(view, state.picks[i], false);
    else paintList(view, state.picks[i]);
  });
}

function setBusy(busy) {
  state.busy = busy;
  els.spin.disabled = busy;
  els.spinLabel.textContent = busy ? "Перебор" : "Крутить";
  els.status.textContent = busy ? "Барабаны крутятся" : "Табло готово";
  els.slots.setAttribute("aria-busy", busy ? "true" : "false");
}

async function spin() {
  if (state.busy || !state.data) return;
  setBusy(true);

  const target = nextPicks(state.data, state.picks);

  if (reduceMotion.matches) {
    state.views.forEach((view, i) => {
      if (view.slot.type === "palette") paintPalette(view, target[i], false);
      else paintList(view, target[i]);
    });
    state.picks = target;
    savePicks(state.data, target);
    setBusy(false);
    els.live.textContent = announce(state.data, target);
    return;
  }

  const ends = state.views.map((view, i) => {
    if (view.slot.type === "palette") {
      paintPalette(view, target[i], true);
      return i * 150 + 300;
    }
    return animateList(view, target[i], i * 140);
  });

  await new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(...ends) + 40);
  });

  state.picks = target;
  savePicks(state.data, target);
  setBusy(false);
  els.live.textContent = announce(state.data, target);
}

/* Пересчёт размеров лепестков при изменении ширины */

let resizeFrame = 0;
function relayout() {
  for (const view of state.views) {
    if (view.slot.type === "palette" || !view.tiles.length) continue;
    if (window.innerWidth <= 820) continue;
    applyTileSize(view.tiles, tileSize(view.flaps, view.tiles.length));
  }
}

window.addEventListener("resize", () => {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(relayout);
});

/* Тосты и состояния */

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
