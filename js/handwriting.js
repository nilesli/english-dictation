/* Handwriting pad + recognition · d13
 * OCR export: crop ink, upscale, thicken strokes, pure white bg / black ink.
 * Eraser: whole-stroke hit-test delete (not white-paint). Undo restores removed stroke.
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
      undoLog: [], // {op:'add'} | {op:'remove', stroke, index}
      penWidth: opts.penWidth || 5,
      eraserWidth: opts.eraserWidth || 14,
      tool: "pen", // "pen" | "erase" (erase = whole-stroke delete on hit)
      color: opts.color || "#0f172a",
      showGrid: opts.showGrid !== false,
      dpr: 1,
    };

    function resize() {
      const parent = canvas.parentElement || canvas;
      const cssW = Math.max(280, parent.clientWidth || 320);
      var landscape =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(orientation: landscape) and (min-width: 900px)").matches;
      var baseH = opts.height;
      if (!baseH) {
        if (landscape) {
          // Full-width pad in landscape: prefer viewport height so pad stays usable
          // with listen controls stacked below (not beside).
          var vh = window.innerHeight || 700;
          baseH = Math.round(Math.min(300, Math.max(210, Math.min(cssW * 0.22, vh * 0.34))));
        } else {
          baseH = Math.round(Math.min(280, Math.max(180, cssW * 0.42)));
        }
      }
      const cssH = baseH;
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

    function strokeWidth(stroke) {
      return stroke.width || state.penWidth || 5;
    }

    function isInkStroke(stroke) {
      return !!(stroke && stroke.points && stroke.points.length && stroke.mode !== "erase");
    }

    function paintStrokes(targetCtx, strokes, penScale, inkColor) {
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      targetCtx.globalCompositeOperation = "source-over";
      strokes.forEach(function (stroke) {
        if (!isInkStroke(stroke)) return; // skip legacy white-erase strokes
        targetCtx.strokeStyle = inkColor || state.color || "#000000";
        targetCtx.lineWidth = strokeWidth(stroke) * (penScale || 1);
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
      paintStrokes(ctx, state.strokes, 1, state.color);
      if (state.current && state.current.points.length) {
        paintStrokes(ctx, [state.current], 1, state.color);
      }
      drawGrid();
      canvas.style.cursor = state.tool === "erase" ? "cell" : "crosshair";
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

    /** Distance from point to segment AB */
    function distPointToSeg(px, py, ax, ay, bx, by) {
      var dx = bx - ax;
      var dy = by - ay;
      var len2 = dx * dx + dy * dy;
      if (len2 <= 1e-6) {
        var ex = px - ax;
        var ey = py - ay;
        return Math.sqrt(ex * ex + ey * ey);
      }
      var t = ((px - ax) * dx + (py - ay) * dy) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      var qx = ax + t * dx;
      var qy = ay + t * dy;
      var ex = px - qx;
      var ey = py - qy;
      return Math.sqrt(ex * ex + ey * ey);
    }

    function strokeHitDistance(stroke, p) {
      var pts = stroke.points || [];
      if (!pts.length) return Infinity;
      if (pts.length === 1) {
        var dx = p.x - pts[0].x;
        var dy = p.y - pts[0].y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      var best = Infinity;
      for (var i = 1; i < pts.length; i++) {
        var d = distPointToSeg(
          p.x,
          p.y,
          pts[i - 1].x,
          pts[i - 1].y,
          pts[i].x,
          pts[i].y
        );
        if (d < best) best = d;
      }
      return best;
    }

    function hitRadiusFor(stroke) {
      // Slider eraser size = hit tolerance; include half stroke width so thick ink is easy to grab
      var halfStroke = strokeWidth(stroke) / 2;
      var halfEraser = Math.max(4, (state.eraserWidth || 14) / 2);
      return halfStroke + halfEraser;
    }

    /** Topmost (last-drawn) ink stroke within hit radius, or -1 */
    function findHitStrokeIndex(p) {
      var bestIdx = -1;
      var bestDist = Infinity;
      for (var i = state.strokes.length - 1; i >= 0; i--) {
        var stroke = state.strokes[i];
        if (!isInkStroke(stroke)) continue;
        var d = strokeHitDistance(stroke, p);
        var r = hitRadiusFor(stroke);
        if (d <= r && d <= bestDist) {
          bestDist = d;
          bestIdx = i;
          // Prefer topmost: first match from end is enough when distances similar
          break;
        }
      }
      return bestIdx;
    }

    function eraseStrokeAt(p) {
      var idx = findHitStrokeIndex(p);
      if (idx < 0) return false;
      var removed = state.strokes.splice(idx, 1)[0];
      state.undoLog.push({ op: "remove", stroke: removed, index: idx });
      return true;
    }

    function start(ev) {
      ev.preventDefault();
      state.drawing = true;
      const p = pos(ev);
      p.t = Date.now();
      if (state.tool === "erase") {
        state.current = null;
        eraseStrokeAt(p);
        redraw();
        return;
      }
      state.current = { points: [p], width: state.penWidth, mode: "pen" };
      redraw();
    }

    function move(ev) {
      if (!state.drawing) return;
      ev.preventDefault();
      if (state.tool === "erase") {
        eraseStrokeAt(pos(ev));
        redraw();
        return;
      }
      if (!state.current) return;
      var pt = pos(ev);
      pt.t = Date.now();
      state.current.points.push(pt);
      redraw();
    }

    function end(ev) {
      if (!state.drawing) return;
      ev.preventDefault();
      state.drawing = false;
      if (state.tool === "erase") {
        state.current = null;
        redraw();
        return;
      }
      if (state.current && state.current.points.length) {
        state.strokes.push(state.current);
        state.undoLog.push({ op: "add" });
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
      state.undoLog = [];
      redraw();
    }

    function undo() {
      state.current = null;
      var act = state.undoLog.pop();
      if (!act) {
        // Fallback if log empty (legacy)
        state.strokes.pop();
        redraw();
        return;
      }
      if (act.op === "add") {
        state.strokes.pop();
      } else if (act.op === "remove" && act.stroke) {
        var i = typeof act.index === "number" ? act.index : state.strokes.length;
        if (i < 0) i = 0;
        if (i > state.strokes.length) i = state.strokes.length;
        state.strokes.splice(i, 0, act.stroke);
      }
      redraw();
    }

    function setGrid(on) {
      state.showGrid = !!on;
      redraw();
    }

    function setPenWidth(w) {
      state.penWidth = Math.max(2, Math.min(16, Number(w) || 5));
      // Same slider scales eraser hit tolerance (whole-stroke delete)
      state.eraserWidth = Math.max(8, Math.min(36, state.penWidth * 2.6));
    }

    function setEraserWidth(w) {
      state.eraserWidth = Math.max(8, Math.min(36, Number(w) || 14));
    }

    function setTool(tool) {
      state.tool = tool === "erase" ? "erase" : "pen";
      canvas.style.cursor = state.tool === "erase" ? "cell" : "crosshair";
    }

    function getTool() {
      return state.tool;
    }

    function hasEraseStrokes() {
      // Legacy white-paint erase strokes only; whole-stroke delete removes ink from the list
      return state.strokes.some(function (s) {
        return s && s.mode === "erase";
      });
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
        if (!isInkStroke(stroke)) return;
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
      octx.lineCap = "round";
      octx.lineJoin = "round";
      state.strokes.forEach(function (stroke) {
        if (!isInkStroke(stroke)) return;
        octx.strokeStyle = "#000000";
        var baseW = stroke.width || state.penWidth;
        octx.lineWidth = Math.max(2.5, baseW * thick);
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
    window.addEventListener("orientationchange", function () {
      setTimeout(resize, 200);
    });

    function getInkStrokes() {
      // HandwritingRecognition API: pen strokes only (if erased, caller should prefer OCR)
      return state.strokes.filter(function (stroke) {
        return stroke && stroke.mode !== "erase";
      }).map(function (stroke) {
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
      setEraserWidth: setEraserWidth,
      setTool: setTool,
      getTool: getTool,
      hasEraseStrokes: hasEraseStrokes,
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
    if (pad.hasEraseStrokes && pad.hasEraseStrokes()) {
      // Legacy white-paint erase strokes would desync Ink API stroke list
      return null;
    }
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
