/* Handwriting pad + recognition · d8
 * OCR export: crop ink, upscale, thicken strokes, pure white bg / black ink.
 * Grading stays strict string match in app.js — no fuzzy tolerance.
 */
(function (global) {
  "use strict";

  function createPad(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const state = {
      drawing: false,
      strokes: [],
      current: null,
      penWidth: opts.penWidth || 5,
      color: opts.color || "#0f172a",
      showGrid: opts.showGrid !== false,
      dpr: 1,
    };

    function resize() {
      const parent = canvas.parentElement || canvas;
      const cssW = Math.max(280, parent.clientWidth || 320);
      const cssH =
        opts.height || Math.round(Math.min(280, Math.max(180, cssW * 0.42)));
      state.dpr = window.devicePixelRatio || 1;
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width = Math.round(cssW * state.dpr);
      canvas.height = Math.round(cssH * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      redraw();
    }

    function drawGrid() {
      if (!state.showGrid) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.save();
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      const step = 28;
      for (let x = step; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = step; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(8, h * 0.72);
      ctx.lineTo(w - 8, h * 0.72);
      ctx.stroke();
      ctx.restore();
    }

    function paintStrokes(targetCtx, strokes, penScale, color) {
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      targetCtx.strokeStyle = color || "#000000";
      strokes.forEach(function (stroke) {
        if (!stroke.points || !stroke.points.length) return;
        targetCtx.lineWidth = (stroke.width || state.penWidth) * (penScale || 1);
        targetCtx.beginPath();
        targetCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          targetCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        targetCtx.stroke();
      });
    }

    function redraw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      drawGrid();
      paintStrokes(ctx, state.strokes, 1, state.color);
      if (state.current && state.current.points.length) {
        paintStrokes(ctx, [state.current], 1, state.color);
      }
    }

    function pos(ev) {
      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;
      if (ev.touches && ev.touches.length) {
        clientX = ev.touches[0].clientX;
        clientY = ev.touches[0].clientY;
      } else if (ev.changedTouches && ev.changedTouches.length) {
        clientX = ev.changedTouches[0].clientX;
        clientY = ev.changedTouches[0].clientY;
      } else {
        clientX = ev.clientX;
        clientY = ev.clientY;
      }
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function start(ev) {
      ev.preventDefault();
      state.drawing = true;
      const p = pos(ev);
      p.t = Date.now();
      state.current = { points: [p], width: state.penWidth };
      redraw();
    }

    function move(ev) {
      if (!state.drawing || !state.current) return;
      ev.preventDefault();
      var pt = pos(ev);
      pt.t = Date.now();
      state.current.points.push(pt);
      redraw();
    }

    function end(ev) {
      if (!state.drawing) return;
      ev.preventDefault();
      state.drawing = false;
      if (state.current && state.current.points.length) {
        state.strokes.push(state.current);
      }
      state.current = null;
      redraw();
    }

    if (global.PointerEvent) {
      canvas.addEventListener("pointerdown", function (ev) {
        canvas.setPointerCapture(ev.pointerId);
        start(ev);
      });
      canvas.addEventListener("pointermove", function (ev) {
        if (state.drawing) move(ev);
      });
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
    } else {
      canvas.addEventListener("mousedown", start);
      canvas.addEventListener("mousemove", move);
      window.addEventListener("mouseup", end);
      canvas.addEventListener("touchstart", start, { passive: false });
      canvas.addEventListener("touchmove", move, { passive: false });
      canvas.addEventListener("touchend", end, { passive: false });
      canvas.addEventListener("touchcancel", end, { passive: false });
    }

    function clear() {
      state.strokes = [];
      state.current = null;
      redraw();
    }

    function undo() {
      state.strokes.pop();
      state.current = null;
      redraw();
    }

    function setGrid(on) {
      state.showGrid = !!on;
      redraw();
    }

    function setPenWidth(w) {
      state.penWidth = Math.max(2, Math.min(16, Number(w) || 5));
    }

    function isEmpty() {
      return state.strokes.length === 0;
    }

    function inkBounds() {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const all = state.strokes.slice();
      if (state.current) all.push(state.current);
      all.forEach(function (stroke) {
        const half = (stroke.width || state.penWidth) / 2 + 1;
        (stroke.points || []).forEach(function (p) {
          minX = Math.min(minX, p.x - half);
          minY = Math.min(minY, p.y - half);
          maxX = Math.max(maxX, p.x + half);
          maxY = Math.max(maxY, p.y + half);
        });
      });
      if (!isFinite(minX)) {
        return {
          x: 0,
          y: 0,
          w: canvas.clientWidth,
          h: canvas.clientHeight,
        };
      }
      const pad = 18;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(canvas.clientWidth, maxX + pad);
      maxY = Math.min(canvas.clientHeight, maxY + pad);
      return { x: minX, y: minY, w: Math.max(8, maxX - minX), h: Math.max(8, maxY - minY) };
    }

    /**
     * Build a clean OCR bitmap: cropped ink, ×3 scale, thickened black strokes, white bg.
     * Returns HTMLCanvasElement (caller turns into blob).
     */
    function buildOcrCanvas() {
      const b = inkBounds();
      const scale = 3;
      // Target line height ~96–128px helps Tesseract Latin
      const minOutH = 120;
      const hScale = Math.max(scale, minOutH / Math.max(b.h, 1));
      const s = Math.min(4, Math.max(scale, hScale));
      const outW = Math.max(32, Math.round(b.w * s));
      const outH = Math.max(32, Math.round(b.h * s));
      const off = document.createElement("canvas");
      off.width = outW;
      off.height = outH;
      const octx = off.getContext("2d");
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, outW, outH);
      octx.save();
      octx.scale(s, s);
      octx.translate(-b.x, -b.y);
      // Thicken slightly relative to screen pen for thin kid strokes
      const thick = 1.35;
      octx.lineCap = "round";
      octx.lineJoin = "round";
      octx.strokeStyle = "#000000";
      state.strokes.forEach(function (stroke) {
        if (!stroke.points || !stroke.points.length) return;
        octx.lineWidth = Math.max(2.5, (stroke.width || state.penWidth) * thick);
        octx.beginPath();
        octx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          octx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        octx.stroke();
      });
      octx.restore();
      // Optional second pass: slight threshold via getImageData for grey antialias → black
      try {
        const img = octx.getImageData(0, 0, outW, outH);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          // luminance; darken ink, keep bg white
          const y = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          const v = y < 200 ? 0 : 255;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
      } catch (e) {
        /* cross-origin unlikely on local canvas */
      }
      return off;
    }

    function toBlob() {
      return new Promise(function (resolve) {
        const show = state.showGrid;
        state.showGrid = false;
        redraw();
        canvas.toBlob(
          function (blob) {
            state.showGrid = show;
            redraw();
            resolve(blob);
          },
          "image/png"
        );
      });
    }

    /** Preferred export for handwriting OCR */
    function toOcrBlob() {
      return new Promise(function (resolve, reject) {
        try {
          const off = buildOcrCanvas();
          if (off.toBlob) {
            off.toBlob(function (blob) {
              if (blob) resolve(blob);
              else reject(new Error("無法匯出 OCR 圖"));
            }, "image/png");
          } else {
            // rare fallback
            const url = off.toDataURL("image/png");
            fetch(url)
              .then(function (r) {
                return r.blob();
              })
              .then(resolve, reject);
          }
        } catch (e) {
          reject(e);
        }
      });
    }

    function toDataURL() {
      const show = state.showGrid;
      state.showGrid = false;
      redraw();
      const url = canvas.toDataURL("image/png");
      state.showGrid = show;
      redraw();
      return url;
    }

    resize();
    window.addEventListener("resize", resize);

    function getInkStrokes() {
      // HandwritingRecognition API stroke format: { points: [{x,y,t}] }
      return state.strokes.map(function (stroke) {
        var t0 = (stroke.points[0] && stroke.points[0].t) || Date.now();
        return {
          points: (stroke.points || []).map(function (p, i) {
            return {
              x: p.x,
              y: p.y,
              t: p.t != null ? p.t : t0 + i * 16,
            };
          }),
        };
      });
    }

    return {
      resize: resize,
      clear: clear,
      undo: undo,
      setGrid: setGrid,
      setPenWidth: setPenWidth,
      isEmpty: isEmpty,
      toBlob: toBlob,
      toOcrBlob: toOcrBlob,
      buildOcrCanvas: buildOcrCanvas,
      toDataURL: toDataURL,
      redraw: redraw,
      getInkStrokes: getInkStrokes,
    };
  }

  function cleanHandText(raw) {
    let t = String(raw || "")
      .replace(/\r/g, "")
      .replace(/\n+/g, " ")
      .replace(/[|]/g, "I")
      .replace(/\s+/g, " ")
      .trim();
    t = t.replace(/[^A-Za-z' \-]/g, "");
    return t.replace(/\s+/g, " ").trim();
  }

  function scoreLatinText(text, confidence) {
    const t = cleanHandText(text);
    if (!t) return -1;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const junk = (String(text || "").match(/[^A-Za-z' \-\s]/g) || []).length;
    const conf = typeof confidence === "number" ? confidence : 50;
    return letters * 3 - junk * 4 + conf * 0.15 + (/\s/.test(t) ? 1 : 0);
  }

  let hwRecognizerPromise = null;

  function browserInkSupported() {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.createHandwritingRecognizer === "function"
    );
  }

  async function getBrowserRecognizer() {
    if (!browserInkSupported()) return null;
    if (hwRecognizerPromise) return hwRecognizerPromise;
    hwRecognizerPromise = (async function () {
      try {
        if (typeof navigator.queryHandwritingRecognizer === "function") {
          var q = await navigator.queryHandwritingRecognizer({ languages: ["en"] });
          if (q === null) return null;
        }
        return await navigator.createHandwritingRecognizer({ languages: ["en"] });
      } catch (e) {
        console.warn("[DictationHandwriting] Ink API unavailable", e);
        return null;
      }
    })();
    return hwRecognizerPromise;
  }

  /**
   * Try OS Handwriting Recognition API (ChromeOS / supporting browsers).
   * Uses recorded ink strokes from the pad.
   */
  async function recognizeWithBrowserInk(pad, onProgress) {
    const recognizer = await getBrowserRecognizer();
    if (!recognizer || typeof pad.getInkStrokes !== "function") return null;
    if (onProgress) onProgress("系統手寫引擎辨識中…");
    try {
      const drawing = recognizer.startDrawing({
        recognitionType: "text",
        inputType: "touch",
        alternatives: 3,
      });
      const strokes = pad.getInkStrokes();
      strokes.forEach(function (stroke) {
        if (!stroke.points || !stroke.points.length) return;
        // API expects HandwritingStroke with addPoint
        if (typeof HandwritingStroke === "function") {
          var hs = new HandwritingStroke();
          stroke.points.forEach(function (pt) {
            hs.addPoint({ x: pt.x, y: pt.y, t: pt.t });
          });
          drawing.addStroke(hs);
        } else if (typeof drawing.addStroke === "function") {
          drawing.addStroke(stroke);
        }
      });
      const predictions = await drawing.getPrediction();
      if (typeof drawing.clear === "function") drawing.clear();
      const top = predictions && predictions[0];
      const text = top && (top.text != null ? top.text : top);
      const conf =
        top && typeof top.confidence === "number" ? top.confidence * 100 : 70;
      const cleaned = cleanHandText(text);
      if (!cleaned) return null;
      return {
        text: cleaned,
        method: "handwriting-recognition-api",
        confidence: conf,
        raw: text,
        alternatives: (predictions || []).slice(1, 4).map(function (p) {
          return cleanHandText(p && p.text != null ? p.text : p);
        }),
      };
    } catch (e) {
      console.warn("[DictationHandwriting] Ink recognize failed", e);
      return null;
    }
  }

  async function recognizeWithTesseract(pad, onProgress) {
    if (!global.DictationOCR || !DictationOCR.recognize) {
      throw new Error("OCR 模組未載入");
    }
    if (onProgress) onProgress("準備手寫圖（加粗／放大）…");
    const blob =
      typeof pad.toOcrBlob === "function" ? await pad.toOcrBlob() : await pad.toBlob();
    if (!blob) throw new Error("無法匯出畫板");
    if (onProgress) onProgress("Tesseract 辨識中…");
    let raw;
    let confidence = 55;
    if (typeof DictationOCR.recognizeHandwriting === "function") {
      // enhanced API may return string still
      raw = await DictationOCR.recognizeHandwriting(blob, onProgress);
      if (raw && typeof raw === "object" && raw.text != null) {
        confidence = raw.confidence != null ? raw.confidence : confidence;
        raw = raw.text;
      }
    } else {
      raw = await DictationOCR.recognize(blob, onProgress);
    }
    const text = cleanHandText(raw);
    return {
      text: text,
      method: "tesseract",
      confidence: confidence,
      raw: raw,
    };
  }

  /**
   * Prefer browser Ink API when present; also run Tesseract and pick higher latin score.
   * Never biases toward expected answer (strict grading stays in app.js).
   */
  async function recognize(pad, onProgress) {
    if (pad.isEmpty()) {
      return { text: "", method: "empty", confidence: 0 };
    }

    const jobs = [];
    if (browserInkSupported()) {
      jobs.push(
        recognizeWithBrowserInk(pad, onProgress).catch(function () {
          return null;
        })
      );
    }
    jobs.push(
      recognizeWithTesseract(pad, onProgress).catch(function (e) {
        console.warn("[DictationHandwriting] tesseract failed", e);
        return null;
      })
    );

    if (onProgress) onProgress("辨識手寫中…");
    const results = await Promise.all(jobs);
    let best = null;
    let bestScore = -1;
    results.forEach(function (r) {
      if (!r || !r.text) return;
      const sc = scoreLatinText(r.text, r.confidence);
      if (sc > bestScore) {
        bestScore = sc;
        best = r;
      }
    });
    if (!best) {
      return { text: "", method: "none", confidence: 0 };
    }
    best.score = bestScore;
    return best;
  }

  global.DictationHandwriting = {
    createPad: createPad,
    recognize: recognize,
    cleanHandText: cleanHandText,
    browserInkSupported: browserInkSupported,
    scoreLatinText: scoreLatinText,
  };
})(typeof window !== "undefined" ? window : globalThis);
