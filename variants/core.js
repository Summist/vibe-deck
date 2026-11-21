/* VIBEDECK — общее ядро для дизайн-вариантов.
   Данные, случайный выбор, восстановление последней комбинации и копирование HEX.
   Внешний вид и движение каждый вариант рисует сам. */

(function () {
  const DATA_URL = new URL("../../data/vibedeck.json", document.baseURI).href;
  const STORE_KEY = "vibedeck:last";
  const NOTES = {
    mood: "Настроение",
    name: "Имя бренда",
  };

  function randomIndex(slot) {
    return Math.floor(Math.random() * slot.items.length);
  }

  function randomPicks(data) {
    return data.slots.map(randomIndex);
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

  async function load() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.slots) || !data.slots.length) throw new Error("Пустые данные");
    const picks = readPicks(data) || randomPicks(data);
    savePicks(data, picks);
    return { data, picks };
  }

  /* Тёмная или светлая подпись поверх цвета — по воспринимаемой яркости. */
  function inkFor(hex) {
    const value = hex.replace("#", "");
    const channel = (i) => {
      const c = parseInt(value.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    return luminance > 0.2 ? "#14130F" : "#FFFEFB";
  }

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
        /* копирование недоступно — подпись всё равно покажет значение */
      }
      field.remove();
    }
    window.dispatchEvent(new CustomEvent("vibedeck:copy", { detail: color }));
  }

  function noteFor(slot, item) {
    if (!item) return "";
    if (slot.type === "palette") return item.title;
    return item.meta || NOTES[slot.id] || "";
  }

  function announce(data, picks) {
    const parts = data.slots.map((slot, i) => `${slot.label} — ${slot.items[picks[i]].title}`);
    return `Новая комбинация. ${parts.join(". ")}.`;
  }

  function tieCount(data) {
    return data.slots.reduce((total, slot) => total * slot.items.length, 1);
  }

  window.Vibedeck = {
    dataUrl: DATA_URL,
    load,
    picks: randomPicks,
    nextPicks,
    savePicks,
    inkFor,
    copy,
    noteFor,
    announce,
    tieCount,
  };
})();
