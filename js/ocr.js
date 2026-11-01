/* Client-side OCR via tesseract.js CDN · d8
 * Handwriting path: high-contrast line OCR, a–z whitelist, reusable worker.
 */
(function (global) {
  "use strict";

  const CDN =
    "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

  const WHITELIST =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' -";

  let loading = null;
  let hwWorker = null;
  let hwWorkerPromise = null;

  function loadScript() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = CDN;
      s.async = true;
      s.onload = function () {
        if (global.Tesseract) resolve(global.Tesseract);
        else reject(new Error("Tesseract 載入失敗"));
      };
      s.onerror = function () {
        loading = null;
        reject(
          new Error("無法載入 OCR 程式庫（需要上網）。可改用貼上文字。")
        );
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  function loggerFn(onProgress) {
    return function (m) {
      if (!onProgress) return;
      if (m.status === "recognizing text" && m.progress != null) {
        onProgress("辨識中…" + Math.round(m.progress * 100) + "%");
      } else if (m.status) {
        onProgress(String(m.status));
      }
    };
  }

  /**
   * Recognize English text from image File/Blob/URL (photo / paste OCR).
   */
  async function recognize(image, onProgress) {
    const Tesseract = await loadScript();
    const result = await Tesseract.recognize(image, "eng", {
      logger: loggerFn(onProgress),
    });
    return (result && result.data && result.data.text) || "";
  }

  async function getHwWorker(onProgress) {
    if (hwWorker) return hwWorker;
    if (hwWorkerPromise) return hwWorkerPromise;
    hwWorkerPromise = (async function () {
      const Tesseract = await loadScript();
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: loggerFn(onProgress),
      });
      await worker.setParameters({
        // 7 = single text line (best for pad phrases)
        tessedit_pageseg_mode: "7",
        tessedit_char_whitelist: WHITELIST,
        // treat as uniform text block / avoid sparse layout guesses
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      hwWorker = worker;
      return worker;
    })();
    try {
      return await hwWorkerPromise;
    } catch (e) {
      hwWorkerPromise = null;
      throw e;
    }
  }

  function scoreCandidate(text, confidence) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return -1;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const junk = (t.match(/[^A-Za-z' \-]/g) || []).length;
    const conf = typeof confidence === "number" ? confidence : 0;
    return letters * 2 - junk * 3 + conf * 0.05 + (t.indexOf(" ") >= 0 ? 2 : 0);
  }

  /**
   * Handwriting OCR: image should already be white-bg black ink, upscaled.
   * Tries PSM 7 then PSM 8; picks higher-scoring latin line (not answer-biased).
   */
  async function recognizeHandwriting(image, onProgress) {
    const worker = await getHwWorker(onProgress);
    const modes = ["7", "8"]; // single line, single word — phrase often still lands on 7
    let best = { text: "", score: -1, confidence: 0, psm: "" };

    for (let i = 0; i < modes.length; i++) {
      const psm = modes[i];
      if (onProgress) onProgress("辨識手寫（模式 " + psm + "）…");
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          tessedit_char_whitelist: WHITELIST,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });
        const result = await worker.recognize(image);
        const text = (result && result.data && result.data.text) || "";
        const confidence =
          result && result.data && typeof result.data.confidence === "number"
            ? result.data.confidence
            : 0;
        const score = scoreCandidate(text, confidence);
        if (score > best.score) {
          best = { text: text, score: score, confidence: confidence, psm: psm };
        }
      } catch (e) {
        console.warn("[DictationOCR] PSM " + psm + " failed", e);
      }
    }

    // Return rich result when caller expects object; string still OK via String()
    return {
      text: best.text || "",
      confidence: best.confidence || 0,
      psm: best.psm || "",
      toString: function () {
        return this.text || "";
      },
    };
  }

  /** Heuristic clean: drop very short noise lines, keep letter-ish lines */
  function cleanOcrText(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map(function (l) {
        return l.replace(/\s+/g, " ").trim();
      })
      .filter(function (l) {
        if (l.length < 2) return false;
        return /[A-Za-z]/.test(l);
      })
      .join("\n");
  }

  global.DictationOCR = {
    loadScript: loadScript,
    recognize: recognize,
    recognizeHandwriting: recognizeHandwriting,
    cleanOcrText: cleanOcrText,
    WHITELIST: WHITELIST,
  };
})(typeof window !== "undefined" ? window : globalThis);
