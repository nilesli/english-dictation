/**
 * 英文默書温習 — Gemini handwriting OCR via Firebase AI Logic
 * Classic script; Firebase ESM via dynamic import() (same CDN as cloud.js).
 * Never receives expected answer. Fail soft → null.
 * d14 · ?v=20261101d14
 */
(function (global) {
  "use strict";

  const FIREBASE_APP_NAME = "english-dictation";
  const FB_APP = "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
  const FB_AI = "https://www.gstatic.com/firebasejs/11.10.0/firebase-ai.js";
  const MODEL_ID = "gemini-flash-latest";
  const PROMPT =
    "You are a handwriting OCR for primary school English. " +
    "Read ONLY the handwritten English letters/words/punctuation in the image. " +
    "Output the transcript alone — no quotes, no explanation, no markdown. " +
    "Carefully distinguish a/o, e/c, u/v, i/l, n/m, r/n. " +
    "Do NOT invent words not written. If the image is blank, output nothing.";

  let modsPromise = null;
  let modelPromise = null;

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

  function loadMods() {
    if (modsPromise) return modsPromise;
    modsPromise = Promise.all([import(FB_APP), import(FB_AI)])
      .then(function (mods) {
        return { app: mods[0], ai: mods[1] };
      })
      .catch(function (err) {
        console.warn("[DictationGeminiOCR] firebase import failed", err);
        modsPromise = null;
        throw err;
      });
    return modsPromise;
  }

  function blobToInlineData(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onloadend = function () {
        try {
          const dataUrl = String(reader.result || "");
          const comma = dataUrl.indexOf(",");
          if (comma < 0) {
            reject(new Error("bad data URL"));
            return;
          }
          resolve({
            inlineData: {
              data: dataUrl.slice(comma + 1),
              mimeType: blob.type || "image/png",
            },
          });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = function () {
        reject(reader.error || new Error("FileReader failed"));
      };
      reader.readAsDataURL(blob);
    });
  }

  function ensureModel() {
    if (modelPromise) return modelPromise;
    modelPromise = (async function () {
      const cfg = getFirebaseConfig();
      if (!cfg || !isConfigured()) return null;
      const mods = await loadMods();
      const initializeApp = mods.app.initializeApp;
      const getApp = mods.app.getApp;
      const getApps = mods.app.getApps;
      const getAI = mods.ai.getAI;
      const getGenerativeModel = mods.ai.getGenerativeModel;
      const GoogleAIBackend = mods.ai.GoogleAIBackend;

      var app;
      if (getApps().some(function (a) {
        return a.name === FIREBASE_APP_NAME;
      })) {
        app = getApp(FIREBASE_APP_NAME);
      } else {
        app = initializeApp(cfg, FIREBASE_APP_NAME);
      }

      const ai = getAI(app, { backend: new GoogleAIBackend() });
      return getGenerativeModel(ai, {
        model: MODEL_ID,
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 128,
          candidateCount: 1,
        },
      });
    })().catch(function (err) {
      console.warn("[DictationGeminiOCR] model init failed", err);
      modelPromise = null;
      return null;
    });
    return modelPromise;
  }

  function stripModelNoise(raw) {
    let t = String(raw || "")
      .replace(/\r/g, "")
      .replace(/^```[\w]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    // Model sometimes replies with empty / blank / none
    var probe = t.replace(/[.!?]+$/g, "").trim();
    if (/^(empty|blank|none|n\/a|null|-)$/i.test(probe)) return "";
    return t;
  }

  function cleanViaHandwriting(raw) {
    const stripped = stripModelNoise(raw);
    if (
      global.DictationHandwriting &&
      typeof global.DictationHandwriting.cleanHandText === "function"
    ) {
      return global.DictationHandwriting.cleanHandText(stripped);
    }
    return stripped
      .replace(/\n+/g, " ")
      .replace(/[|]/g, "I")
      .replace(/[^A-Za-z' \-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {Blob} blob PNG (or image) of handwriting
   * @param {function(string)=} onProgress
   * @returns {Promise<{text:string,method:string,confidence:number,raw:string}|null>}
   */
  async function recognizeBlob(blob, onProgress) {
    if (!blob || !isConfigured()) return null;
    try {
      if (onProgress) onProgress("Gemini 認字中…");
      const model = await ensureModel();
      if (!model) return null;
      const imagePart = await blobToInlineData(blob);
      const result = await model.generateContent([PROMPT, imagePart]);
      const response = result && result.response;
      let raw = "";
      if (response) {
        if (typeof response.text === "function") raw = response.text();
        else if (typeof response.text === "string") raw = response.text;
      }
      const text = cleanViaHandwriting(raw);
      if (!text) return null;
      return {
        text: text,
        method: "gemini",
        confidence: 90,
        raw: String(raw || ""),
      };
    } catch (err) {
      console.warn("[DictationGeminiOCR] recognize failed", err);
      return null;
    }
  }

  /**
   * Convenience: pad.toOcrBlob() then Gemini.
   */
  async function recognizePad(pad, onProgress) {
    if (!pad || pad.isEmpty()) return null;
    try {
      const blob =
        typeof pad.toOcrBlob === "function"
          ? await pad.toOcrBlob()
          : await pad.toBlob();
      if (!blob) return null;
      return await recognizeBlob(blob, onProgress);
    } catch (err) {
      console.warn("[DictationGeminiOCR] pad export failed", err);
      return null;
    }
  }

  global.DictationGeminiOCR = {
    isConfigured: isConfigured,
    recognizeBlob: recognizeBlob,
    recognizePad: recognizePad,
    MODEL_ID: MODEL_ID,
  };
})(typeof window !== "undefined" ? window : globalThis);
