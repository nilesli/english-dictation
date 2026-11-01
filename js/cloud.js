/**
 * 英文默書温習 — Firebase cloud（默書場次＋錯字）
 * Classic script (not type=module) so file:// / preview never blocks app boot.
 * Firebase ESM loaded lazily via dynamic import() from CDN.
 * Path: artifacts/english-dictation-default/public/data/english_dictation/sessions/entries/{id}
 * d12 · ?v=20261101d12
 */
(function (global) {
  "use strict";

  const APP_ID = "english-dictation-default";
  const LS_PENDING = "eng-dictation-pending-sessions";
  const FIREBASE_APP_NAME = "english-dictation";
  const FB_APP = "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
  const FB_AUTH = "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
  const FB_FS = "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

  let app = null;
  let auth = null;
  let db = null;
  let ready = false;
  let initPromise = null;
  let fbMods = null;

  function getFirebaseConfig() {
    if (
      typeof global.DICTATION_FIREBASE_CONFIG === "object" &&
      global.DICTATION_FIREBASE_CONFIG &&
      global.DICTATION_FIREBASE_CONFIG.apiKey
    ) {
      return global.DICTATION_FIREBASE_CONFIG;
    }
    return null;
  }

  function isConfigured() {
    const c = getFirebaseConfig();
    return !!(c && c.apiKey && c.projectId && c.apiKey !== "demo");
  }

  function readJsonArray(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeJsonArray(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr.slice(-200)));
    } catch (e) {
      /* quota / blocked */
    }
  }

  function appendPending(record) {
    const all = readJsonArray(LS_PENDING);
    all.push(record);
    writeJsonArray(LS_PENDING, all);
  }

  function formatHkTime(isoOrDate) {
    try {
      const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || Date.now());
      if (Number.isNaN(d.getTime())) return String(isoOrDate || "");
      return new Intl.DateTimeFormat("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d);
    } catch (e) {
      return String(isoOrDate || "");
    }
  }

  function normalizeSession(partial) {
    partial = partial || {};
    const whenHk =
      partial.when ||
      (global.DictationStorage && global.DictationStorage.hkNowString
        ? global.DictationStorage.hkNowString()
        : formatHkTime(new Date()));
    const nickname =
      partial.nickname != null
        ? String(partial.nickname).slice(0, 40)
        : global.DictationStorage && global.DictationStorage.getNickname
          ? global.DictationStorage.getNickname()
          : "細妹";
    const deviceId =
      partial.deviceId ||
      (global.DictationStorage && global.DictationStorage.getDeviceId
        ? global.DictationStorage.getDeviceId()
        : "");
    const parts = Array.isArray(partial.parts)
      ? partial.parts.map(function (p) { return String(p).slice(0, 8); }).filter(Boolean).slice(0, 8)
      : [];
    const wrongs = Array.isArray(partial.wrongs)
      ? partial.wrongs
          .map(function (w) {
            return {
              expected: String((w && (w.expected != null ? w.expected : w.expect)) || "").slice(0, 200),
              got: String((w && w.got != null ? w.got : "") || "").slice(0, 200),
              partId: String((w && (w.partId != null ? w.partId : w.part)) || "").slice(0, 8),
              id: String((w && w.id) || "").slice(0, 40),
            };
          })
          .slice(0, 120)
      : [];
    return {
      when: whenHk,
      whenIso: partial.whenIso || new Date().toISOString(),
      nickname: nickname,
      deviceId: String(deviceId || "").slice(0, 64),
      unit: String(partial.unit || "").slice(0, 120),
      parts: parts,
      score: Number(partial.score != null ? partial.score : partial.correct) || 0,
      total: Number(partial.total) || 0,
      wrongs: wrongs,
      createdAtClient: new Date().toISOString(),
    };
  }

  function loadFirebaseMods() {
    if (fbMods) return fbMods;
    fbMods = Promise.all([
      import(FB_APP),
      import(FB_AUTH),
      import(FB_FS),
    ]).then(function (mods) {
      return {
        app: mods[0],
        auth: mods[1],
        fs: mods[2],
      };
    }).catch(function (err) {
      console.warn("[DictationCloud] firebase import failed", err);
      fbMods = null;
      throw err;
    });
    return fbMods;
  }

  function sessionsPath(fs) {
    return fs.collection(
      db,
      "artifacts",
      APP_ID,
      "public",
      "data",
      "english_dictation",
      "sessions",
      "entries"
    );
  }

  function ensureInit() {
    if (ready && db) return Promise.resolve(true);
    if (initPromise) return initPromise;
    initPromise = (async function () {
      const cfg = getFirebaseConfig();
      if (!cfg || !cfg.apiKey || !cfg.projectId || cfg.apiKey === "demo") {
        ready = false;
        return false;
      }
      try {
        const mods = await loadFirebaseMods();
        const initializeApp = mods.app.initializeApp;
        const getApp = mods.app.getApp;
        const getApps = mods.app.getApps;
        const getAuth = mods.auth.getAuth;
        const signInAnonymously = mods.auth.signInAnonymously;
        const getFirestore = mods.fs.getFirestore;

        if (getApps().some(function (a) { return a.name === FIREBASE_APP_NAME; })) {
          app = getApp(FIREBASE_APP_NAME);
        } else {
          app = initializeApp(cfg, FIREBASE_APP_NAME);
        }
        auth = getAuth(app);
        db = getFirestore(app);
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        ready = !!(auth.currentUser && db);
        return ready;
      } catch (err) {
        console.warn("[DictationCloud] init failed", err);
        ready = false;
        db = null;
        return false;
      }
    })();
    return initPromise.then(function (ok) {
      if (!ok) initPromise = null;
      return ok;
    });
  }

  /**
   * Upload one dictation session. Fail soft → pending localStorage.
   * @returns {Promise<'cloud'|'local'|'error'|'skipped'>}
   */
  function saveSession(partial) {
    const record = normalizeSession(partial || {});
    return ensureInit().then(function (ok) {
      if (!ok) {
        appendPending(record);
        return "local";
      }
      return loadFirebaseMods().then(function (mods) {
        const payload = Object.assign({}, record, {
          createdAt: mods.fs.serverTimestamp(),
        });
        return mods.fs.addDoc(sessionsPath(mods.fs), payload).then(function () {
          return "cloud";
        });
      }).catch(function (err) {
        console.warn("[DictationCloud] upload failed", err);
        appendPending(record);
        return "error";
      });
    });
  }

  function flushPending() {
    const pending = readJsonArray(LS_PENDING);
    if (!pending.length) return Promise.resolve({ flushed: 0, left: 0 });
    return ensureInit().then(function (ok) {
      if (!ok) return { flushed: 0, left: pending.length };
      return loadFirebaseMods().then(function (mods) {
        const left = [];
        let flushed = 0;
        let chain = Promise.resolve();
        pending.forEach(function (rec) {
          chain = chain.then(function () {
            const payload = Object.assign({}, rec, {
              createdAt: mods.fs.serverTimestamp(),
            });
            return mods.fs
              .addDoc(sessionsPath(mods.fs), payload)
              .then(function () {
                flushed += 1;
              })
              .catch(function () {
                left.push(rec);
              });
          });
        });
        return chain.then(function () {
          writeJsonArray(LS_PENDING, left);
          return { flushed: flushed, left: left.length };
        });
      });
    });
  }

  function loadSessions(max) {
    max = max || 50;
    return ensureInit().then(function (ok) {
      if (!ok) return { source: "none", sessions: [], error: "not configured / offline" };
      return loadFirebaseMods().then(function (mods) {
        const q = mods.fs.query(
          sessionsPath(mods.fs),
          mods.fs.orderBy("whenIso", "desc"),
          mods.fs.limit(max)
        );
        return mods.fs
          .getDocs(q)
          .then(function (snap) {
            const sessions = [];
            snap.forEach(function (d) {
              sessions.push(Object.assign({ id: d.id }, d.data()));
            });
            return { source: "cloud", sessions: sessions };
          })
          .catch(function (err) {
            console.warn("[DictationCloud] load orderBy failed", err);
            return mods.fs
              .getDocs(mods.fs.query(sessionsPath(mods.fs), mods.fs.limit(max)))
              .then(function (snap) {
                const sessions = [];
                snap.forEach(function (d) {
                  sessions.push(Object.assign({ id: d.id }, d.data()));
                });
                sessions.sort(function (a, b) {
                  return String(b.whenIso || "").localeCompare(String(a.whenIso || ""));
                });
                return { source: "cloud", sessions: sessions.slice(0, max) };
              })
              .catch(function (err2) {
                console.warn("[DictationCloud] load failed", err2);
                return {
                  source: "none",
                  sessions: [],
                  error: String(err2 && err2.message),
                };
              });
          });
      });
    });
  }

  function drainBootQueue() {
    const q = global.__dictationPendingSessions;
    if (!Array.isArray(q) || !q.length) return;
    global.__dictationPendingSessions = [];
    q.forEach(function (rec) {
      saveSession(rec).catch(function () {});
    });
  }

  const api = {
    APP_ID: APP_ID,
    SESSIONS_COLLECTION: "english_dictation/sessions/entries",
    PATH_PREFIX:
      "artifacts/" + APP_ID + "/public/data/english_dictation/sessions/entries",
    isConfigured: isConfigured,
    ensureInit: ensureInit,
    saveSession: saveSession,
    flushPending: flushPending,
    loadSessions: loadSessions,
    fetchSessions: loadSessions,
    formatHkTime: formatHkTime,
  };

  global.DictationCloud = api;
  try {
    global.dispatchEvent(new Event("dictationcloud-ready"));
  } catch (e) { /* old browsers */ }
  drainBootQueue();

  // Lazy warm-up — never blocks UI
  try {
    ensureInit().then(function (ok) {
      if (ok) flushPending();
    });
  } catch (e) {
    console.warn("[DictationCloud] boot warm-up skipped", e);
  }
})(typeof window !== "undefined" ? window : globalThis);
