/* localStorage for custom lists + settings + history · d4
 * Never throws — localStorage may be blocked (private / policy).
 */
(function (global) {
  "use strict";

  const KEY_UNIT = "eng-dictation-unit-v1";
  const KEY_SETTINGS = "eng-dictation-settings-v1";
  const KEY_HISTORY = "eng-dictation-history-v1";
  const KEY_NICK = "eng-dictation-nickname";
  const KEY_DEVICE = "eng-dictation-device-id";
  const DEFAULT_NICK = "細妹";

  const mem = Object.create(null);

  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      mem[key] = value;
      return false;
    }
  }

  function lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
    try {
      delete mem[key];
    } catch (e2) { /* ignore */ }
  }

  function safeParse(raw, fallback) {
    try {
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function defaultSettings() {
    return {
      rate: 0.75,
      lang: "en-GB",
      repeats: 2,
      gapSec: 1.5,
      bMode: "sentence",
      cMode: "set",
      showZh: true,
      quizParts: ["A"],
    };
  }

  function loadSettings() {
    const d = safeParse(lsGet(KEY_SETTINGS), {});
    const base = defaultSettings();
    return {
      rate: d.rate != null ? Number(d.rate) : base.rate,
      lang: d.lang === "en-US" ? "en-US" : "en-GB",
      repeats: d.repeats != null ? Number(d.repeats) : base.repeats,
      gapSec: d.gapSec != null ? Number(d.gapSec) : base.gapSec,
      bMode: d.bMode === "focus" ? "focus" : "sentence",
      cMode: d.cMode === "forms" ? "forms" : "set",
      showZh: d.showZh !== false,
      quizParts:
        Array.isArray(d.quizParts) && d.quizParts.length
          ? d.quizParts.map(String)
          : ["A"],
    };
  }

  function saveSettings(s) {
    lsSet(KEY_SETTINGS, JSON.stringify(s || defaultSettings()));
  }

  function loadCustomUnit() {
    return safeParse(lsGet(KEY_UNIT), null);
  }

  function saveCustomUnit(unit) {
    lsSet(KEY_UNIT, JSON.stringify(unit));
  }

  function clearCustomUnit() {
    lsRemove(KEY_UNIT);
  }

  function loadHistory() {
    const list = safeParse(lsGet(KEY_HISTORY), []);
    return Array.isArray(list) ? list : [];
  }

  function pushHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    while (list.length > 40) list.pop();
    lsSet(KEY_HISTORY, JSON.stringify(list));
  }

  function hkNowString() {
    try {
      return new Date().toLocaleString("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        hour12: false,
      });
    } catch (e) {
      return new Date().toISOString();
    }
  }

  function getNickname() {
    try {
      const v = lsGet(KEY_NICK);
      if (v != null && String(v).trim()) return String(v).trim().slice(0, 40);
    } catch (e) {}
    return DEFAULT_NICK;
  }

  function setNickname(raw) {
    const s = String(raw == null ? "" : raw).trim().slice(0, 40) || DEFAULT_NICK;
    lsSet(KEY_NICK, s);
    return s;
  }

  function uuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return global.crypto.randomUUID();
      }
    } catch (e) {}
    return "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function getDeviceId() {
    try {
      var id = lsGet(KEY_DEVICE);
      if (id && String(id).length >= 8) return String(id).slice(0, 64);
      id = uuid();
      lsSet(KEY_DEVICE, id);
      return id;
    } catch (e) {
      return uuid();
    }
  }

  /**
   * Parse paste textarea into a simple custom unit (Part A style words).
   */
  function parsePasteToUnit(text, title) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    const items = [];
    let unitTitle = title || "自訂範圍";
    let i = 0;
    lines.forEach(function (line) {
      if (line.indexOf("##") === 0) return;
      if (line.indexOf("#") === 0) {
        unitTitle = line.replace(/^#+\s*/, "") || unitTitle;
        return;
      }
      const parts = line.split("|");
      const en = (parts[0] || "").trim();
      const zh = (parts[1] || "").trim();
      if (!en) return;
      i += 1;
      items.push({ id: "custom-" + i, en: en, zh: zh });
    });
    return {
      id: "custom-" + Date.now(),
      title: unitTitle,
      school: "",
      level: "",
      version: "custom",
      custom: true,
      parts: {
        A: {
          id: "A",
          name: "詞語／句子",
          weight: "",
          items: items,
        },
        B: { id: "B", name: "Part B", weight: "", passages: [] },
        C: { id: "C", name: "Part C", weight: "", items: [] },
        D: { id: "D", name: "Part D", weight: "", items: [] },
      },
    };
  }

  global.DictationStorage = {
    KEY_UNIT: KEY_UNIT,
    KEY_HISTORY: KEY_HISTORY,
    KEY_NICK: KEY_NICK,
    KEY_DEVICE: KEY_DEVICE,
    DEFAULT_NICK: DEFAULT_NICK,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadCustomUnit: loadCustomUnit,
    saveCustomUnit: saveCustomUnit,
    clearCustomUnit: clearCustomUnit,
    loadHistory: loadHistory,
    pushHistory: pushHistory,
    parsePasteToUnit: parsePasteToUnit,
    hkNowString: hkNowString,
    getNickname: getNickname,
    setNickname: setNickname,
    getDeviceId: getDeviceId,
  };
})(typeof window !== "undefined" ? window : globalThis);
