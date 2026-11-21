const DATA_URL = "data/vibedeck.json";

const TYPE_LABELS = {
  list: "Список",
  palette: "Палитры",
};

const ICONS = {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

const refs = {
  slots: document.getElementById("slots"),
  railMeta: document.getElementById("rail-meta"),
  pane: document.getElementById("pane"),
  state: document.getElementById("state"),
  stateText: document.getElementById("state-text"),
  toast: document.getElementById("toast"),
  save: document.getElementById("save"),
  download: document.getElementById("download"),
  validate: document.getElementById("validate"),
  addSlot: document.getElementById("add-slot"),
};

const state = {
  data: null,
  activeId: null,
  baseline: "",
  handle: null,
  openPalettes: new Set(),
  focusSelector: null,
  jsonTimer: 0,
  toastTimer: 0,
  issuesTimer: 0,
  issuesVisible: false,
};

/* ---------- DOM helpers ---------- */

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "value" || key === "checked" || key === "open" || key === "disabled") {
      node[key] = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  svg.innerHTML = ICONS[name] ?? "";
  return svg;
}

function iconButton(name, label, onClick, disabled = false) {
  return h(
    "button",
    { class: "btn btn--icon", type: "button", "aria-label": label, title: label, onclick: onClick, disabled },
    icon(name),
  );
}

/* ---------- Data helpers ---------- */

const serialize = () => JSON.stringify(state.data, null, 2) + "\n";

function normalizeHex(raw) {
  if (typeof raw !== "string") return "";
  const value = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(value)) return "#" + value.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return "#" + value.split("").map((c) => c + c).join("").toUpperCase();
  }
  return "";
}

const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value ?? "");

const cssHex = (value) => (isHex(value) ? value : "transparent");

function normalizeItem(item, type) {
  const base = item && typeof item === "object" ? item : {};
  const title = typeof base.title === "string" ? base.title : "";

  if (type === "palette") {
    const colors = (Array.isArray(base.colors) ? base.colors : [])
      .filter((color) => color && typeof color === "object")
      .map((color) => ({
        ...color,
        hex: normalizeHex(color.hex) || "#1C1B18",
        name: typeof color.name === "string" ? color.name : "",
      }));
    return { ...base, title, colors };
  }

  const result = { ...base, title };
  if (typeof base.meta === "string" && base.meta.trim()) result.meta = base.meta;
  else delete result.meta;
  return result;
}

function normalize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.slots)) return null;

  const used = new Set();
  const slots = raw.slots
    .filter((slot) => slot && typeof slot === "object")
    .map((slot, index) => {
      const type = slot.type === "palette" ? "palette" : "list";
      let id = typeof slot.id === "string" && slot.id.trim() ? slot.id.trim() : `slot-${index + 1}`;
      if (used.has(id)) {
        let n = 2;
        while (used.has(`${id}-${n}`)) n += 1;
        id = `${id}-${n}`;
      }
      used.add(id);

      return {
        ...slot,
        id,
        type,
        label: typeof slot.label === "string" ? slot.label : `Слот ${index + 1}`,
        items: (Array.isArray(slot.items) ? slot.items : []).map((item) => normalizeItem(item, type)),
      };
    });

  return { ...raw, version: Number(raw.version) || 1, slots };
}

const activeSlot = () => state.data?.slots.find((slot) => slot.id === state.activeId) ?? null;

const itemCount = (slot) => slot.items.length;

const plural = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

/* ---------- Status ---------- */

function setState(text, tone) {
  refs.stateText.textContent = text;
  refs.state.dataset.tone = tone;
}

function renderStatus() {
  if (!state.data) {
    setState("Файл не загружен", "error");
    return;
  }
  const issues = collectIssues();
  const errors = issues.filter((issue) => issue.level === "error").length;
  if (errors) {
    setState(`${errors} ${plural(errors, "ошибка", "ошибки", "ошибок")} в данных`, "error");
    scheduleIssues();
  } else {
    if (serialize() !== state.baseline) {
      setState("Изменения не сохранены", "dirty");
    } else {
      setState("Совпадает с файлом", "ok");
    }
    const panel = document.getElementById("issues");
    if (panel && !panel.hidden) paintIssues();
  }
}

/* ---------- Rail ---------- */

function renderRail() {
  const slots = state.data?.slots ?? [];
  refs.slots.replaceChildren(
    ...slots.map((slot) =>
      h(
        "button",
        {
          class: "slot",
          type: "button",
          "aria-current": slot.id === state.activeId ? "true" : "false",
          onclick: () => {
            state.activeId = slot.id;
            renderRail();
            renderPane();
          },
        },
        h("span", { class: "slot__label", text: slot.label || "Без названия" }),
        h("span", { class: "slot__count", text: String(itemCount(slot)) }),
      ),
    ),
  );

  refs.railMeta.textContent = slots.length
    ? `${slots.length} ${plural(slots.length, "слот", "слота", "слотов")} · ${slots.reduce(
        (sum, slot) => sum + slot.items.length,
        0,
      )} ${plural(slots.reduce((sum, slot) => sum + slot.items.length, 0), "элемент", "элемента", "элементов")}`
    : "Слотов нет";
}

/* ---------- Pane ---------- */

function renderPane() {
  if (!state.data) return;

  const slots = state.data.slots;
  if (!slots.length) {
    refs.pane.replaceChildren(
      h(
        "div",
        { class: "fallback" },
        h("h2", { text: "Слотов пока нет" }),
        h("p", { text: "Добавьте первый слот — список значений или набор палитр." }),
        h(
          "div",
          { class: "fallback__actions" },
          h("button", { class: "btn btn--primary", type: "button", onclick: addSlot }, icon("plus"), "Добавить слот"),
        ),
      ),
    );
    return;
  }

  if (!activeSlot()) state.activeId = slots[0].id;
  const slot = activeSlot();
  const index = slots.indexOf(slot);

  const labelInput = h("input", {
    class: "input",
    id: "slot-label",
    value: slot.label,
    placeholder: "Название слота",
    autocomplete: "off",
    oninput: (event) => {
      slot.label = event.target.value;
      renderRail();
      renderStatus();
      queueJson();
    },
  });

  const typeSelect = h(
    "select",
    {
      class: "select",
      id: "slot-type",
      onchange: (event) => {
        const next = event.target.value;
        if (next === slot.type) return;
        changeType(slot, next);
      },
    },
    ...Object.entries(TYPE_LABELS).map(([value, label]) =>
      h("option", { value, selected: value === slot.type }, label),
    ),
  );

  const itemsHead = h(
    "div",
    { class: "items-head" },
    h(
      "p",
      { class: "items-head__title" },
      slot.type === "palette" ? "Палитры" : "Элементы",
      h("span", { class: "items-head__meta", id: "items-count", text: String(slot.items.length) }),
    ),
    h(
      "div",
      { class: "items-head__actions" },
      h("span", { class: "idchip" }, "id ", h("b", { text: slot.id })),
      h(
        "button",
        {
          class: "btn",
          type: "button",
          onclick: () => addItem(slot),
        },
        icon("plus"),
        slot.type === "palette" ? "Палитра" : "Элемент",
      ),
    ),
  );

  const issues = h("section", { class: "issues", id: "issues", hidden: true });
  const json = buildJsonBlock();

  refs.pane.replaceChildren(
    h(
      "div",
      { class: "pane__head" },
      h("div", { class: "field" }, h("label", { for: "slot-label", text: "Название слота" }), labelInput),
      h("div", { class: "field" }, h("label", { for: "slot-type", text: "Тип данных" }), typeSelect),
      h(
        "div",
        { class: "pane__head-actions" },
        h(
          "button",
          {
            class: "btn btn--danger",
            type: "button",
            disabled: slots.length <= 1,
            title: slots.length <= 1 ? "В файле должен остаться хотя бы один слот" : "Удалить слот",
            onclick: () => removeSlot(slot),
          },
          icon("trash"),
          "Удалить слот",
        ),
      ),
    ),
    h("p", { class: "pane__lead", text: `Слот ${index + 1} из ${slots.length} · ${TYPE_LABELS[slot.type]}` }),
    itemsHead,
    slot.type === "palette" ? renderPalettes(slot) : renderList(slot),
    issues,
    json,
  );

  paintIssues();
  updateJson();

  if (state.focusSelector) {
    const node = refs.pane.querySelector(state.focusSelector);
    state.focusSelector = null;
    if (node) {
      node.focus();
      if (typeof node.select === "function" && node.tagName === "INPUT") node.select();
    }
  }
}

function renderList(slot) {
  if (!slot.items.length) {
    return h("div", { class: "rows rows--empty", text: "Элементов нет. Добавьте первый — он появится в прокруте." });
  }

  return h(
    "div",
    { class: "rows" },
    ...slot.items.map((item, index) =>
      h(
        "div",
        { class: "row" },
        h("span", { class: "row__num", text: String(index + 1).padStart(2, "0") }),
        h("input", {
          class: "input",
          value: item.title,
          placeholder: "Значение",
          autocomplete: "off",
          dataset: { field: "title", index: String(index) },
          oninput: (event) => {
            item.title = event.target.value;
            renderStatus();
            queueJson();
          },
        }),
        h("input", {
          class: "input input--meta",
          value: item.meta ?? "",
          placeholder: "Категория (необязательно)",
          autocomplete: "off",
          oninput: (event) => {
            const value = event.target.value;
            if (value.trim()) item.meta = value;
            else delete item.meta;
            renderStatus();
            queueJson();
          },
        }),
        h(
          "div",
          { class: "row__actions" },
          iconButton("up", "Выше", () => moveItem(slot, index, -1), index === 0),
          iconButton("down", "Ниже", () => moveItem(slot, index, 1), index === slot.items.length - 1),
          iconButton("trash", "Удалить", () => removeItem(slot, index)),
        ),
      ),
    ),
  );
}

function renderPalettes(slot) {
  if (!slot.items.length) {
    return h("div", {
      class: "rows rows--empty",
      text: "Палитр нет. Добавьте первую — 2–6 цветов с HEX и названием.",
    });
  }

  return h(
    "div",
    { class: "palettes" },
    ...slot.items.map((palette, index) => renderPalette(slot, palette, index)),
  );
}

function renderPalette(slot, palette, index) {
  const swatches = h(
    "span",
    { class: "swatches" },
    ...palette.colors.slice(0, 6).map((color) => h("span", { style: `background:${cssHex(color.hex)}` })),
  );

  const swatchRow = () => {
    swatches.replaceChildren(
      ...palette.colors
        .slice(0, 6)
        .map((color) => h("span", { style: `background:${cssHex(color.hex)}` })),
    );
  };

  const nameNode = h("span", { class: "palette__name", text: palette.title || "Без названия" });
  const countNode = h("span", { class: "palette__count", text: String(palette.colors.length) });

  const details = h(
    "details",
    { class: "palette", dataset: { palette: String(index) } },
    h(
      "summary",
      {},
      swatches,
      nameNode,
      countNode,
      icon("chevron", "chevron"),
    ),
    h(
      "div",
      { class: "palette__body" },
      h(
        "div",
        { class: "field palette__title" },
        h("label", { text: "Название палитры" }),
        h("input", {
          class: "input",
          value: palette.title,
          placeholder: "Terracotta & Cobalt",
          autocomplete: "off",
          oninput: (event) => {
            palette.title = event.target.value;
            nameNode.textContent = palette.title || "Без названия";
            renderStatus();
            queueJson();
          },
        }),
      ),
      h(
        "div",
        { class: "colors" },
        ...palette.colors.map((color, colorIndex) => renderColorRow(palette, color, colorIndex, swatchRow)),
      ),
      h(
        "div",
        { class: "palette__foot" },
        h(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            disabled: palette.colors.length >= 6,
            title: palette.colors.length >= 6 ? "Максимум 6 цветов" : "Добавить цвет",
            onclick: () => {
              if (palette.colors.length >= 6) return;
              palette.colors.push({ hex: "#D9D2C4", name: "" });
              state.openPalettes.add(palette);
              state.focusSelector = `[data-palette="${index}"] .color-row:last-child .input--hex`;
              commitStructure();
            },
          },
          icon("plus"),
          "Цвет",
        ),
        h(
          "button",
          {
            class: "btn btn--danger",
            type: "button",
            disabled: palette.colors.length <= 2,
            title: palette.colors.length <= 2 ? "Минимум 2 цвета" : "Удалить цвет",
            onclick: () => {
              if (palette.colors.length <= 2) return;
              palette.colors.pop();
              state.openPalettes.add(palette);
              commitStructure();
            },
          },
          "Убрать последний цвет",
        ),
        h("span", { style: "flex:1" }),
        iconButton("trash", "Удалить палитру", () => removeItem(slot, index)),
      ),
    ),
  );

  details.addEventListener("toggle", () => {
    if (details.open) state.openPalettes.add(palette);
    else state.openPalettes.delete(palette);
  });

  if (state.openPalettes.has(palette)) details.open = true;
  return details;
}

function renderColorRow(palette, color, colorIndex, syncSwatches) {
  const picker = h("input", {
    type: "color",
    value: cssHex(color.hex),
    "aria-label": `Цвет ${colorIndex + 1}`,
    oninput: (event) => {
      color.hex = event.target.value.toUpperCase();
      hexInput.value = color.hex;
      hexInput.classList.remove("input--invalid");
      syncSwatches();
      renderStatus();
      queueJson();
    },
  });

  const hexInput = h("input", {
    class: "input input--mono input--hex",
    value: color.hex,
    placeholder: "#RRGGBB",
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": `HEX цвета ${colorIndex + 1}`,
    oninput: (event) => {
      color.hex = event.target.value.toUpperCase();
      const valid = isHex(color.hex);
      hexInput.classList.toggle("input--invalid", !valid && color.hex.length >= 4);
      if (valid) {
        picker.value = color.hex;
        syncSwatches();
      }
      renderStatus();
      queueJson();
    },
    onblur: () => {
      const normalized = normalizeHex(color.hex);
      if (normalized) {
        color.hex = normalized;
        hexInput.value = normalized;
        picker.value = normalized;
        hexInput.classList.remove("input--invalid");
        syncSwatches();
        queueJson();
      }
    },
  });

  return h(
    "div",
    { class: "color-row" },
    picker,
    hexInput,
    h("input", {
      class: "input input--name",
      value: color.name,
      placeholder: "Название цвета",
      autocomplete: "off",
      "aria-label": `Название цвета ${colorIndex + 1}`,
      oninput: (event) => {
        color.name = event.target.value;
        renderStatus();
        queueJson();
      },
    }),
    iconButton("trash", "Удалить цвет", () => {
      if (palette.colors.length <= 2) return;
      palette.colors.splice(colorIndex, 1);
      state.openPalettes.add(palette);
      commitStructure();
    }, palette.colors.length <= 2),
  );
}

function buildJsonBlock() {
  const size = new Blob([serialize()]).size;
  const pre = h("pre", { id: "json-preview", text: serialize() });

  return h(
    "details",
    { class: "json" },
    h(
      "summary",
      {},
      "JSON файла",
      h("span", { class: "json__meta", id: "json-meta", text: `${(size / 1024).toFixed(1)} КБ` }),
    ),
    h(
      "div",
      { class: "json__body" },
      h(
        "div",
        { class: "json__tools" },
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(serialize());
                toast("JSON скопирован");
              } catch {
                toast("Не удалось скопировать", "error");
              }
            },
          },
          icon("copy"),
          "Копировать",
        ),
      ),
      pre,
    ),
  );
}

/* ---------- Mutations ---------- */

function commitStructure() {
  renderRail();
  renderPane();
  renderStatus();
}

function addSlot() {
  if (!state.data) return;
  const base = "slot-" + (state.data.slots.length + 1);
  let id = base;
  let n = 2;
  while (state.data.slots.some((slot) => slot.id === id)) id = `${base}-${n++}`;

  state.data.slots.push({ id, label: "Новый слот", type: "list", items: [] });
  state.activeId = id;
  state.focusSelector = "#slot-label";
  commitStructure();
}

function removeSlot(slot) {
  if (state.data.slots.length <= 1) return;
  if (!confirm(`Удалить слот «${slot.label || slot.id}» со всеми элементами?`)) return;

  const index = state.data.slots.indexOf(slot);
  state.data.slots.splice(index, 1);
  state.activeId = state.data.slots[Math.max(0, index - 1)].id;
  commitStructure();
}

function changeType(slot, next) {
  if (slot.items.length) {
    const message =
      next === "palette"
        ? "Сменить тип на «Палитры»? Каждый элемент станет палитрой с двумя цветами по умолчанию."
        : "Сменить тип на «Список»? Цвета палитр будут удалены, останутся только названия.";
    if (!confirm(message)) {
      renderPane();
      return;
    }
  }

  slot.type = next;
  slot.items = slot.items.map((item) =>
    next === "palette"
      ? {
          title: item.title,
          colors: [
            { hex: "#E7E2D6", name: "" },
            { hex: "#1C1B18", name: "" },
          ],
        }
      : { title: item.title },
  );
  state.openPalettes.clear();
  commitStructure();
}

function addItem(slot) {
  if (slot.type === "palette") {
    slot.items.push({
      title: "Новая палитра",
      colors: [
        { hex: "#E7E2D6", name: "" },
        { hex: "#1C1B18", name: "" },
      ],
    });
    state.openPalettes.add(slot.items[slot.items.length - 1]);
    state.focusSelector = `.palette[data-palette="${slot.items.length - 1}"] .palette__title .input`;
  } else {
    slot.items.push({ title: "" });
    state.focusSelector = `.row:nth-child(${slot.items.length}) .input`;
  }
  commitStructure();
}

function removeItem(slot, index) {
  const item = slot.items[index];
  const name = item?.title?.trim() || "без названия";
  if (!confirm(`Удалить «${name}»?`)) return;
  slot.items.splice(index, 1);
  state.openPalettes.delete(item);
  commitStructure();
}

function moveItem(slot, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= slot.items.length) return;
  const [item] = slot.items.splice(index, 1);
  slot.items.splice(target, 0, item);
  state.focusSelector = `.row:nth-child(${target + 1}) .input`;
  commitStructure();
}

/* ---------- Validation ---------- */

function collectIssues() {
  const issues = [];
  const data = state.data;
  if (!data) return issues;

  const slotIds = new Set();

  data.slots.forEach((slot, slotIndex) => {
    const slotName = slot.label?.trim() || slot.id || `Слот ${slotIndex + 1}`;

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slot.id)) {
      issues.push({ level: "error", slot, message: `«${slotName}»: id — только латиница, цифры и дефис` });
    }
    if (slotIds.has(slot.id.toLowerCase())) {
      issues.push({ level: "error", slot, message: `«${slotName}»: id «${slot.id}» уже занят` });
    }
    slotIds.add(slot.id.toLowerCase());

    if (!slot.label?.trim()) {
      issues.push({ level: "error", slot, message: `Слот ${slotIndex + 1}: нет названия` });
    }

    if (slot.items.length < 2) {
      issues.push({
        level: "error",
        slot,
        message: `«${slotName}»: нужно минимум 2 ${slot.type === "palette" ? "палитры" : "элемента"}`,
      });
    }

    if (slot.type === "palette") {
      const names = new Set();
      slot.items.forEach((palette, paletteIndex) => {
        const name = palette.title?.trim();
        const label = name || `палитра ${paletteIndex + 1}`;

        if (!name) {
          issues.push({ level: "error", slot, message: `«${slotName}»: палитра ${paletteIndex + 1} без названия` });
        } else {
          const key = name.toLowerCase();
          if (names.has(key)) {
            issues.push({ level: "error", slot, message: `«${slotName}»: палитра «${name}» повторяется` });
          }
          names.add(key);
        }

        if (palette.colors.length < 2 || palette.colors.length > 6) {
          issues.push({
            level: "error",
            slot,
            message: `«${label}»: ${palette.colors.length} ${plural(palette.colors.length, "цвет", "цвета", "цветов")}, нужно от 2 до 6`,
          });
        }

        palette.colors.forEach((color, colorIndex) => {
          if (!isHex(color.hex)) {
            issues.push({
              level: "error",
              slot,
              message: `«${label}»: цвет ${colorIndex + 1} — HEX вида #RRGGBB`,
            });
          }
          if (!color.name?.trim()) {
            issues.push({
              level: "error",
              slot,
              message: `«${label}»: цвет ${colorIndex + 1} без названия`,
            });
          }
        });
      });
      return;
    }

    const titles = new Set();
    slot.items.forEach((item, itemIndex) => {
      const title = item.title?.trim();
      if (!title) {
        issues.push({ level: "error", slot, message: `«${slotName}»: элемент ${itemIndex + 1} без значения` });
        return;
      }
      const key = title.toLowerCase();
      if (titles.has(key)) {
        issues.push({ level: "error", slot, message: `«${slotName}»: «${title}» повторяется` });
      }
      titles.add(key);
    });
  });

  return issues;
}

function scheduleIssues() {
  clearTimeout(state.issuesTimer);
  state.issuesTimer = setTimeout(paintIssues, 260);
}

function paintIssues() {
  const node = document.getElementById("issues");
  if (!node) return;
  const issues = collectIssues();
  state.issuesVisible = issues.length > 0;
  if (!issues.length) {
    node.hidden = true;
    node.replaceChildren();
    return;
  }

  node.hidden = false;
  node.replaceChildren(
    h(
      "p",
      { class: "issues__head" },
      "Что поправить",
      h("span", { text: `${issues.length} ${plural(issues.length, "замечание", "замечания", "замечаний")}` }),
    ),
    h(
      "ul",
      {},
      ...issues.map((issue) =>
        h(
          "li",
          { dataset: { level: issue.level } },
          h(
            "button",
            {
              type: "button",
              onclick: () => {
                if (!issue.slot) return;
                state.activeId = issue.slot.id;
                renderRail();
                renderPane();
                refs.pane.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            },
            h("span", { class: "issues__level", text: issue.level === "error" ? "ошибка" : "совет" }),
            h("span", { text: issue.message }),
          ),
        ),
      ),
    ),
  );
}

/* ---------- JSON preview ---------- */

function updateJson() {
  const pre = document.getElementById("json-preview");
  const meta = document.getElementById("json-meta");
  if (!pre) return;
  const text = serialize();
  pre.textContent = text;
  if (meta) meta.textContent = `${(new Blob([text]).size / 1024).toFixed(1)} КБ`;
}

function queueJson() {
  clearTimeout(state.jsonTimer);
  state.jsonTimer = setTimeout(updateJson, 150);
}

/* ---------- Files ---------- */

async function loadFromUrl() {
  setState("Загрузка…", "idle");
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    adopt(await response.json());
  } catch (error) {
    showFallback(error);
  }
}

function adopt(raw) {
  const data = normalize(raw);
  if (!data || !data.slots.length) {
    showFallback(new Error("В файле нет корректного массива slots"));
    return;
  }
  state.data = data;
  state.baseline = serialize();
  state.activeId = data.slots[0].id;
  state.openPalettes.clear();
  renderRail();
  renderPane();
  renderStatus();
}

function showFallback(error) {
  refs.slots.replaceChildren();
  refs.railMeta.textContent = "";
  setState("Файл не загружен", "error");

  const fileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    onchange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        adopt(JSON.parse(await file.text()));
        toast(`Загружен ${file.name}`);
      } catch (parseError) {
        toast("Это не JSON: " + parseError.message, "error");
      }
    },
  });

  refs.pane.replaceChildren(
    h(
      "div",
      { class: "fallback" },
      h("h2", { text: "Не удалось прочитать data/vibedeck.json" }),
      h("p", { text: "Браузер не даёт странице читать файлы с диска напрямую. Откройте проект через локальный сервер:" }),
      h("p", {}, h("code", { text: "python -m http.server 5173" }), " — и зайдите на ", h("code", { text: "localhost:5173/editor.html" })),
      h("p", { text: `Или выберите файл вручную. Причина: ${error?.message ?? "неизвестна"}` }),
      h(
        "div",
        { class: "fallback__actions" },
        h(
          "button",
          { class: "btn btn--primary", type: "button", onclick: () => fileInput.click() },
          "Выбрать JSON",
        ),
        h("button", { class: "btn", type: "button", onclick: loadFromUrl }, "Повторить"),
      ),
      fileInput,
    ),
  );
}

function downloadJson() {
  if (!state.data) return;
  const issues = collectIssues().filter((issue) => issue.level === "error");
  if (issues.length) {
    paintIssues();
    renderStatus();
    toast("Сначала исправьте ошибки в данных", "error");
    return;
  }

  const blob = new Blob([serialize()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: "vibedeck.json" });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("vibedeck.json скачан");
}

async function saveJson() {
  if (!state.data) return;
  const content = serialize();
  const issues = collectIssues().filter((issue) => issue.level === "error");
  if (issues.length) {
    paintIssues();
    renderStatus();
    toast("Сначала исправьте ошибки в данных", "error");
    return;
  }

  if (!("showSaveFilePicker" in window)) {
    downloadJson();
    return;
  }

  try {
    if (!state.handle) {
      state.handle = await window.showSaveFilePicker({
        suggestedName: "vibedeck.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
    }
    const writable = await state.handle.createWritable();
    await writable.write(content);
    await writable.close();
    state.baseline = content;
    renderStatus();
    toast(`Сохранено в ${state.handle.name}`);
  } catch (error) {
    if (error?.name === "AbortError") return;
    toast("Не удалось сохранить: " + (error?.message ?? "ошибка"), "error");
  }
}

/* ---------- Toast ---------- */

function toast(message, tone = "ok") {
  refs.toast.textContent = message;
  refs.toast.dataset.show = "true";
  refs.toast.dataset.tone = tone;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    refs.toast.dataset.show = "false";
  }, 2600);
}

/* ---------- Boot ---------- */

refs.save.addEventListener("click", saveJson);
refs.download.addEventListener("click", downloadJson);
refs.validate.addEventListener("click", () => {
  if (!state.data) return;
  paintIssues();
  renderStatus();
  const issues = collectIssues();
  if (!issues.length) toast("Ошибок нет");
});
refs.addSlot.addEventListener("click", addSlot);

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveJson();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.data) return;
  if (serialize() === state.baseline) return;
  event.preventDefault();
  event.returnValue = "";
});

if ("showSaveFilePicker" in window) {
  refs.save.title = "Записать в файл на диске";
} else {
  refs.save.disabled = true;
  refs.save.title = "Браузер не умеет писать в файл напрямую — используйте «Скачать JSON»";
}

loadFromUrl();
