/* Handwriting pad + recognition (Tesseract fallback; navigator.ink if present) */
(function (global) {
  "use strict";

  /**
   * Create a drawing pad on a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  function createPad(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const state = {
      drawing: false,
      strokes: [], // array of {points:[{x,y}], width}
      current: null,
      penWidth: opts.penWidth || 5,
      color: opts.color || "#0f172a",
      showGrid: opts.showGrid !== false,
      dpr: 1,
    };

    function resize() {
      const parent = canvas.parentElement || canvas;
      const cssW = Math.max(280, parent.clientWidth || 320);
      const cssH = opts.height || Math.round(Math.min(280, Math.max(180, cssW * 0.42)));
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
      // baseline
      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(8, h * 0.72);
      ctx.lineTo(w - 8, h * 0.72);
      ctx.stroke();
      ctx.restore();
    }

    function redraw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      drawGrid();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = state.color;
      state.strokes.forEach(function (stroke) {
        if (!stroke.points.length) return;
        ctx.lineWidth = stroke.width || state.penWidth;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      });
      if (state.current && state.current.points.length) {
        ctx.lineWidth = state.current.width;
        ctx.beginPath();
        ctx.moveTo(state.current.points[0].x, state.current.points[0].y);
        for (let i = 1; i < state.current.points.length; i++) {
          ctx.lineTo(state.current.points[i].x, state.current.points[i].y);
        }
        ctx.stroke();
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
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }

    function start(ev) {
      ev.preventDefault();
      state.drawing = true;
      const p = pos(ev);
      state.current = { points: [p], width: state.penWidth };
      redraw();
    }

    function move(ev) {
      if (!state.drawing || !state.current) return;
      ev.preventDefault();
      state.current.points.push(pos(ev));
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

    // Prefer Pointer Events (mouse / touch / Apple Pencil) to avoid double strokes
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

    /** Export as PNG blob (white bg) for OCR */
    function toBlob() {
      return new Promise(function (resolve) {
        // temporarily redraw without grid for cleaner OCR
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

    return {
      resize: resize,
      clear: clear,
      undo: undo,
      setGrid: setGrid,
      setPenWidth: setPenWidth,
      isEmpty: isEmpty,
      toBlob: toBlob,
      toDataURL: toDataURL,
      redraw: redraw,
    };
  }

  /**
   * Recognize handwritten English from canvas pad.
   * Priority: navigator.ink (if usable) → Tesseract OCR on PNG.
   * @param {ReturnType<createPad>} pad
   * @param {function(string):void} [onProgress]
   * @returns {Promise<{text:string, method:string, confidence?:number}>}
   */
  async function recognize(pad, onProgress) {
    if (pad.isEmpty()) {
      return { text: "", method: "empty" };
    }

    // Experimental: navigator.ink (rarely available; keep hook)
    if (global.navigator && navigator.ink && typeof navigator.ink.requestPresenter === "function") {
      // No standard handwriting-to-text API widely shipped; skip to OCR.
    }

    if (onProgress) onProgress("辨識手寫中…");
    if (!global.DictationOCR || !DictationOCR.recognize) {
      throw new Error("OCR 模組未載入");
    }
    const blob = await pad.toBlob();
    if (!blob) throw new Error("無法匯出畫板");

    // Prefer single-line style: Tesseract often works better with PSM 7/8 via worker params —
    // DictationOCR.recognize uses default; we pass image as-is.
    let raw;
    if (typeof DictationOCR.recognizeHandwriting === "function") {
      raw = await DictationOCR.recognizeHandwriting(blob, onProgress);
    } else {
      raw = await DictationOCR.recognize(blob, onProgress);
    }
    const text = cleanHandText(raw);
    return { text: text, method: "tesseract", raw: raw };
  }

  function cleanHandText(raw) {
    let t = String(raw || "")
      .replace(/\r/g, "")
      .replace(/\n+/g, " ")
      .replace(/[|]/g, "I")
      .replace(/\s+/g, " ")
      .trim();
    // drop leftover OCR junk symbols
    t = t.replace(/[^A-Za-z0-9'’\-.,!?;: ]/g, "");
    return t.replace(/\s+/g, " ").trim();
  }

  global.DictationHandwriting = {
    createPad: createPad,
    recognize: recognize,
    cleanHandText: cleanHandText,
  };
})(typeof window !== "undefined" ? window : globalThis);
