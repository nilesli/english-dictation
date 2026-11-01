/* Client-side OCR via tesseract.js CDN */
(function (global) {
  "use strict";

  const CDN =
    "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

  let loading = null;

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
          new Error(
            "無法載入 OCR 程式庫（需要上網）。可改用貼上文字。"
          )
        );
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  /**
   * Recognize English text from image File/Blob/URL.
   * @param {File|Blob|string} image
   * @param {function(string):void} [onProgress]
   * @returns {Promise<string>}
   */
  async function recognize(image, onProgress) {
    const Tesseract = await loadScript();
    const result = await Tesseract.recognize(image, "eng", {
      logger: function (m) {
        if (!onProgress) return;
        if (m.status === "recognizing text" && m.progress != null) {
          onProgress("辨識中…" + Math.round(m.progress * 100) + "%");
        } else if (m.status) {
          onProgress(String(m.status));
        }
      },
    });
    return (result && result.data && result.data.text) || "";
  }

  async function recognizeHandwriting(image, onProgress) {
    const Tesseract = await loadScript();
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: function (m) {
        if (!onProgress) return;
        if (m.status === "recognizing text" && m.progress != null) {
          onProgress("辨識中…" + Math.round(m.progress * 100) + "%");
        } else if (m.status) {
          onProgress(String(m.status));
        }
      },
    });
    try {
      // 7 = treat as single text line
      await worker.setParameters({
        tessedit_pageseg_mode: "7",
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'’\-.,!?;: ",
      });
      const result = await worker.recognize(image);
      return (result && result.data && result.data.text) || "";
    } finally {
      try {
        await worker.terminate();
      } catch (e) {}
    }
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
        // keep lines with some latin letters
        return /[A-Za-z]/.test(l);
      })
      .join("\n");
  }

  global.DictationOCR = {
    loadScript: loadScript,
    recognize: recognize,
    recognizeHandwriting: recognizeHandwriting,
    cleanOcrText: cleanOcrText,
  };
})(typeof window !== "undefined" ? window : globalThis);
