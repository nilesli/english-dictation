/* 英文默書温習 · app shell · d14 */
(function () {
  "use strict";

  const $ = function (sel) {
    return document.querySelector(sel);
  };
  const $$ = function (sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  };

  function on(sel, evt, fn) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) {
      console.warn("[dictation] missing node for", sel, evt);
      return null;
    }
    el.addEventListener(evt, fn);
    return el;
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

  let settings;
  try {
    settings =
      window.DictationStorage && DictationStorage.loadSettings
        ? DictationStorage.loadSettings()
        : defaultSettings();
  } catch (e) {
    console.error("[dictation] loadSettings failed", e);
    settings = defaultSettings();
  }

  let currentUnit = null;
  let studyCards = [];
  let studyIdx = 0;
  let studyHideSpell = false;
  let studyPart = "A";

  let quizItems = [];
  let quizIdx = 0;
  let quizPartsSelected = ["A"]; // multi-select for mock dictation
  let quizChecked = false;
  let quizCorrect = 0;
  let quizWrongs = [];
  let quizRewriteTotal = 0;
  let quizItemRewrites = {}; // quizIdx -> rewrite press count this session
  let hwPad = null;
  let hwRecognizing = false;
  let studySpeakChain = 0;
  let studyPartBChunks = [];
  let studyPartBChunk = 0;
  let studyPartBText = "";
  let quizPartBChunk = 0;
  let pendingRecognizeText = "";
  let pendingRecognizeMeta = "";

  function toast(msg) {
    const el = $("#toast");
    if (!el) {
      try {
        console.log("[dictation toast]", msg);
      } catch (e) {}
      return;
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.hidden = true;
    }, 2200);
  }

  function applySpeechSettings() {
    if (!window.DictationSpeech) return;
    try {
      DictationSpeech.setRate(settings.rate);
      DictationSpeech.setLang(settings.lang);
    } catch (e) {
      console.warn("[dictation] applySpeechSettings", e);
    }
  }

  function persistSettings() {
    try {
      if (window.DictationStorage) DictationStorage.saveSettings(settings);
    } catch (e) {
      console.warn("[dictation] saveSettings", e);
    }
    applySpeechSettings();
  }

  function resolveUnit() {
    try {
      const custom =
        window.DictationStorage && DictationStorage.loadCustomUnit
          ? DictationStorage.loadCustomUnit()
          : null;
      if (custom && custom.parts) return custom;
    } catch (e) {
      console.warn("[dictation] loadCustomUnit", e);
    }
    return window.DictationData && DictationData.UNIT_U4
      ? DictationData.UNIT_U4
      : { title: "（未載入範圍）", parts: { A: { items: [] }, B: { passages: [] }, C: { items: [] }, D: { items: [] } } };
  }

  function refreshUnitBadge() {
    currentUnit = resolveUnit();
    const badge = $("#unit-badge");
    const customTag = currentUnit.custom ? "（自訂）" : "（範例）";
    if (badge) badge.textContent = (currentUnit.title || "英文默書") + " " + customTag;
    const titleInput = $("#unit-title-input");
    if (titleInput) titleInput.value = currentUnit.title || "";
    const paste = $("#paste-area");
    if (paste && !currentUnit.custom && window.DictationData && DictationData.unitToPasteLines) {
      paste.value = DictationData.unitToPasteLines(currentUnit);
    }
  }

  function showView(id) {
    $$(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === id);
    });
    const home = id === "view-home";
    const btnHome = $("#btn-home");
    if (btnHome) btnHome.hidden = home;
    studySpeakChain += 1;
    if (window.DictationSpeech && DictationSpeech.stop) DictationSpeech.stop();
    try {
      window.scrollTo(0, 0);
    } catch (e) {}
  }

  /* ---------- Home settings UI ---------- */
  function syncHomeControls() {
    const slider = $("#rate-slider");
    const label = $("#rate-label");
    if (slider) slider.value = String(settings.rate);
    if (label)
      label.textContent = Number(settings.rate).toFixed(2).replace(/0$/, "");
    $$("[data-lang]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === settings.lang);
    });
    const support = $("#speech-support");
    if (support) {
      const ok = window.DictationSpeech && DictationSpeech.supported && DictationSpeech.supported();
      support.textContent = ok
        ? "朗讀可用（Web Speech）。iPad／Chrome／Safari 一般得。"
        : "呢個瀏覽器可能唔支援朗讀。";
    }
  }

  /* ---------- Study ---------- */
  function selectedPartsStudy(current) {
    if (current === "ALL") return ["A", "B", "C", "D"];
    return [current];
  }

  function setSegActive(container, part) {
    $$(container + " button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-part") === part);
    });
  }

  function normalizePartList(parts) {
    const order = ["A", "B", "C", "D"];
    const set = {};
    (parts || []).forEach(function (p) {
      const s = String(p || "").toUpperCase();
      if (order.indexOf(s) >= 0) set[s] = true;
    });
    const out = order.filter(function (p) {
      return set[p];
    });
    return out.length ? out : ["A"];
  }

  function syncQuizPartsUi() {
    const selected = normalizePartList(quizPartsSelected);
    quizPartsSelected = selected;
    const allOn = selected.length === 4;
    $$("#quiz-parts button").forEach(function (b) {
      const p = b.getAttribute("data-part");
      const on = p === "ALL" ? allOn : selected.indexOf(p) >= 0;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const label = $("#quiz-parts-label");
    if (label) {
      label.textContent = allOn
        ? "已選：全部 Part A–D"
        : "已選：Part " + selected.join("、");
    }
  }

  function toggleQuizPart(part) {
    const p = String(part || "").toUpperCase();
    if (p === "ALL") {
      quizPartsSelected = ["A", "B", "C", "D"];
    } else if (["A", "B", "C", "D"].indexOf(p) >= 0) {
      const cur = normalizePartList(quizPartsSelected);
      const idx = cur.indexOf(p);
      if (idx >= 0) {
        if (cur.length === 1) {
          // keep at least one
        } else {
          cur.splice(idx, 1);
        }
        quizPartsSelected = cur;
      } else {
        cur.push(p);
        quizPartsSelected = normalizePartList(cur);
      }
    }
    settings.quizParts = quizPartsSelected.slice();
    persistSettings();
    syncQuizPartsUi();
  }

  function loadStudy() {
    currentUnit = resolveUnit();
    const parts = selectedPartsStudy(studyPart);
    // For custom units with only A items, still show them
    studyCards = DictationData.buildStudyCards(currentUnit, parts);
    if (!studyCards.length) {
      // fallback: if custom empty B/C/D, use A only
      studyCards = DictationData.buildStudyCards(currentUnit, ["A"]);
    }
    studyIdx = 0;
    studyPartBText = "";
    studyPartBChunks = [];
    studyPartBChunk = 0;
    renderStudy();
  }

  function renderStudy() {
    const meta = $("#study-meta");
    const body = $("#study-body");
    renderStudyChunkList();
    var srh = $("#study-replay-hint");
    if (srh) {
      srh.textContent =
        studyPart === "B"
          ? "Part B：上面清單自由揀截（約 3–4 字）；背默截唔自動播，撳「再聽一次」"
          : "撳「再聽一次」聽而家呢張";
    }
    var nav = $("#study-nav-row");
    if (nav) nav.hidden = studyPart === "B";
    if (!studyCards.length) {
      meta.textContent = "呢個 Part 暫時冇內容";
      body.innerHTML = "<p>請去「管理範圍」載入 4A U4 或貼上詞語。</p>";
      return;
    }
    const card = studyCards[studyIdx];
    meta.textContent =
      "Part " +
      card.part +
      " · " +
      (studyIdx + 1) +
      " / " +
      studyCards.length +
      (card.label ? " · " + card.label : "");

    if (card.kind === "passage") {
      const html = DictationData.htmlWithUnderline(card.html);
      body.innerHTML =
        '<div class="study-passage">' +
        html +
        "</div>" +
        (studyHideSpell
          ? '<p class="study-zh">（拼寫已隱藏 · 撳朗讀聽）</p>'
          : "");
      if (studyHideSpell) {
        body.querySelector(".study-passage").style.filter = "blur(8px)";
        body.querySelector(".study-passage").style.userSelect = "none";
      }
    } else if (card.kind === "verb") {
      if (studyHideSpell) {
        body.innerHTML =
          '<p class="study-en">???</p><p class="study-zh">' +
          (card.zh || "") +
          "</p>";
      } else {
        body.innerHTML =
          '<p class="study-en">' +
          escapeHtml(card.en) +
          "</p>" +
          '<div class="verb-grid">' +
          '<div class="verb-cell"><small>Base</small>' +
          escapeHtml(card.base) +
          "</div>" +
          '<div class="verb-cell"><small>Past</small>' +
          escapeHtml(card.past) +
          "</div>" +
          '<div class="verb-cell"><small>-ing</small>' +
          escapeHtml(card.ing) +
          "</div></div>" +
          '<p class="study-zh">' +
          escapeHtml(card.zh || "") +
          "</p>";
      }
    } else {
      const en = studyHideSpell ? "???" : escapeHtml(card.en);
      const zh =
        settings.showZh && card.zh
          ? '<p class="study-zh">' + escapeHtml(card.zh) + "</p>"
          : "";
      const focus =
        card.focus && !studyHideSpell
          ? '<p class="study-zh">重點：<u class="focus-u">' +
            escapeHtml(card.focus) +
            "</u></p>"
          : "";
      body.innerHTML = '<p class="study-en">' + en + "</p>" + zh + focus;
    }
  }

  function partBGaps() {
    // d9: shorter word gaps; chunks still a bit longer than words
    return {
      wordGapSec: 0.4,
      chunkGapSec: 0.85,
      maxWords: 4,
    };
  }

  function isBeimoItem(item) {
    if (!item) return false;
    if (item.beimo) return true;
    // Fallback detect: dialogue passage / What would you like
    var id = String(item.passageId || item.id || "");
    if (id.indexOf("b-dlg") === 0 || id.indexOf("b-d") === 0) return true;
    var tip = String(item.hint || item.zh || item.label || "");
    if (tip.indexOf("背默") >= 0) return true;
    var speak = String(item.promptSpeak || item.speak || item.en || "").toLowerCase();
    if (speak.indexOf("what would you like") === 0) return true;
    return false;
  }

  function isStudyPartBMode() {
    return studyPart === "B" || (studyPart === "ALL" && studyCards[studyIdx] && studyCards[studyIdx].part === "B");
  }

  function renderStudyChunkList() {
    var wrap = $("#study-pick-wrap");
    var list = $("#study-chunk-list");
    if (!wrap || !list) return;
    var show = studyPart === "B";
    wrap.hidden = !show;
    if (!show) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = "";
    studyCards.forEach(function (card, idx) {
      if (card.part !== "B") return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "study-chunk-item" + (idx === studyIdx ? " active" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", idx === studyIdx ? "true" : "false");
      btn.textContent =
        (card.zh ? card.zh.replace(/^.*?· /, "") + " · " : "") + (card.en || card.speak || "");
      // Prefer shorter label: sentence/chunk meta + text
      btn.textContent = (idx + 1) + ". " + (card.en || card.speak || "");
      btn.title = card.zh || "";
      btn.addEventListener("click", function () {
        studyIdx = idx;
        renderStudy();
        // 背默：揀截後唔自動播，等「再聽一次」
        if (!isBeimoItem(card)) speakStudy();
      });
      list.appendChild(btn);
    });
  }

  /** @param {boolean} [replayOnly] unused — always speak current card chunk with Part B pacing when B */
  function speakStudy() {
    const card = studyCards[studyIdx];
    if (!card) {
      toast("未有温習內容");
      return;
    }
    if (!window.DictationSpeech) {
      toast("朗讀未就緒");
      return;
    }
    studySpeakChain += 1;
    var chainId = studySpeakChain;
    var say = card.speak || card.en || card.plain || "";

    if (
      (card.part === "B" || card.kind === "word-chunk") &&
      DictationSpeech.speakPartB
    ) {
      var gaps = partBGaps();
      DictationSpeech.speakPartB(say, {
        maxWords: gaps.maxWords,
        wordGapSec: gaps.wordGapSec,
        chunkGapSec: gaps.chunkGapSec,
        onChunk: function (i) {
          if (chainId !== studySpeakChain) return;
          studyPartBChunk = i;
        },
      }).catch(function (e) {
        if (chainId !== studySpeakChain) return;
        toast("朗讀失敗：" + (e && e.message ? e.message : "請再試"));
      });
      return;
    }

    var play = DictationSpeech.speakOnce
      ? DictationSpeech.speakOnce(say)
      : DictationSpeech.speak(say);
    play.catch(function (e) {
      toast("朗讀失敗：" + (e && e.message ? e.message : "請再試"));
    });
  }

  /* ---------- Quiz ---------- */
  function loadQuizItems() {
    currentUnit = resolveUnit();
    const parts = normalizePartList(quizPartsSelected);
    quizPartsSelected = parts;
    const bMode = $("#quiz-bmode").value;
    const cMode = $("#quiz-cmode").value;
    settings.bMode = bMode;
    settings.cMode = cMode;
    settings.repeats = Number($("#quiz-repeats").value) || 2;
    settings.gapSec = Number($("#quiz-gap").value) || 1.5;
    persistSettings();

    quizItems = DictationData.buildQuizItems(currentUnit, {
      parts: parts,
      bMode: bMode,
      cMode: cMode,
    });
    // custom unit may only have A
    if (!quizItems.length) {
      quizItems = DictationData.buildQuizItems(currentUnit, {
        parts: ["A"],
        bMode: bMode,
        cMode: cMode,
      });
    }
  }

  function startQuiz() {
    loadQuizItems();
    if (!quizItems.length) {
      toast("冇題目——請先載入範圍");
      return;
    }
    quizIdx = 0;
    quizCorrect = 0;
    quizWrongs = [];
    quizRewriteTotal = 0;
    quizItemRewrites = {};
    quizChecked = false;
    $("#quiz-setup").hidden = true;
    $("#quiz-result").hidden = true;
    $("#quiz-run").hidden = false;
    // create pad after quiz-run visible so width is correct
    setTimeout(function () {
      ensureHwPad();
      showQuizItem(true);
    }, 30);
  }

  function normalizeAnswer(s) {
    return String(s || "")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .replace(/[.,!?;:]+$/g, "")
      .trim()
      .toLowerCase();
  }

  function answersMatch(item, user) {
    const u = normalizeAnswer(user);
    const candidates = (item.answers || [item.answer]).map(normalizeAnswer);
    return candidates.some(function (c) {
      return c === u;
    });
  }


  function setHwTool(tool) {
    ensureHwPad();
    if (hwPad && hwPad.setTool) hwPad.setTool(tool);
    var penBtn = $("#btn-hw-pen");
    var erBtn = $("#btn-hw-eraser");
    var penOn = tool !== "erase";
    if (penBtn) {
      penBtn.classList.toggle("active", penOn);
      penBtn.setAttribute("aria-pressed", penOn ? "true" : "false");
    }
    if (erBtn) {
      erBtn.classList.toggle("active", !penOn);
      erBtn.setAttribute("aria-pressed", !penOn ? "true" : "false");
    }
  }

  function ensureHwPad() {
    const canvas = $("#hw-canvas");
    if (!canvas) return null;
    if (!hwPad) {
      hwPad = DictationHandwriting.createPad(canvas, {
        penWidth: Number($("#hw-pen").value) || 5,
        showGrid: $("#hw-grid").checked,
        height: 220,
      });
    } else {
      hwPad.resize();
    }
    return hwPad;
  }

  function resetHwPad() {
    const pad = ensureHwPad();
    if (pad) pad.clear();
    const st = $("#hw-status");
    if (st) st.textContent = "";
  }

  function showQuizItem(autoSpeak) {
    const item = quizItems[quizIdx];
    quizChecked = false;
    hwRecognizing = false;
    quizPartBChunk = 0;
    pendingRecognizeText = "";
    pendingRecognizeMeta = "";
    $("#quiz-feedback").hidden = true;
    $("#quiz-after").hidden = true;
    var prev = $("#quiz-preview");
    if (prev) prev.hidden = true;
    $("#btn-quiz-check").disabled = false;
    $("#btn-quiz-check").textContent = "辨識手寫";
    $("#btn-quiz-check").hidden = false;
    var meta =
      "Part " +
      item.part +
      " · " +
      (quizIdx + 1) +
      " / " +
      quizItems.length;
    if (item.hint) meta += " · " + item.hint;
    if (item.part === "B" && item.chunkTotal) {
      meta += " · 第 " + item.chunkIndex + "／" + item.chunkTotal + " 段";
    }
    $("#quiz-meta").textContent = meta;
    const pct = Math.round((quizIdx / quizItems.length) * 100);
    $("#quiz-progress").style.width = pct + "%";
    var beimo = isBeimoItem(item);
    $("#quiz-prompt").textContent = beimo
      ? "📝 呢截係背默——唔會自動朗讀；寫完先。需要可撳「再聽一次」"
      : item.part === "B"
        ? "🔊 每次約 3–4 個字；聽完用手寫"
        : "🔊 聽朗讀，然後用手寫";
    var replay = $("#btn-quiz-replay");
    if (replay) {
      replay.hidden = false;
      replay.disabled = false;
      replay.textContent = "🔊 再聽一次";
    }
    var hint = $("#quiz-replay-hint");
    if (hint) {
      hint.textContent = beimo
        ? "背默段：開題唔播音；自願先撳「再聽一次」（約 3–4 字）"
        : item.part === "B"
          ? "聽唔清就撳「再聽一次」重播而家呢截（約 3–4 字）"
          : "聽唔清就撳「再聽一次」（唔限次數）";
    }
    resetHwPad();
    setHwTool("pen");
    // 背默：開題唔自動朗讀
    if (autoSpeak && !beimo) speakQuizItem(false);
  }

  /** @param {boolean} [onceOnly] true = 再聽一次；false = 開題自動讀 */
  function speakQuizItem(onceOnly) {
    const item = quizItems[quizIdx];
    if (!item) return;
    if (!window.DictationSpeech) {
      toast("朗讀未就緒");
      return;
    }
    const text = item.promptSpeak;
    if (item.part === "B" && DictationSpeech.speakPartB) {
      var gaps = partBGaps();
      var baseOpts = {
        maxWords: gaps.maxWords,
        wordGapSec: gaps.wordGapSec,
        chunkGapSec: gaps.chunkGapSec,
        onChunk: function (i) {
          quizPartBChunk = i;
        },
      };
      if (onceOnly) {
        DictationSpeech.speakPartB(
          text,
          Object.assign({}, baseOpts, {
            onlyChunkIndex: quizPartBChunk || 0,
          })
        ).catch(function (e) {
          toast("朗讀失敗：" + (e && e.message ? e.message : "請再試"));
        });
        return;
      }
      quizPartBChunk = 0;
      var times = Math.max(1, Math.min(3, Number(settings.repeats) || 1));
      var chain = DictationSpeech.speakPartB(text, baseOpts);
      var r;
      for (r = 1; r < times; r++) {
        chain = chain
          .then(function () {
            return new Promise(function (res) {
              setTimeout(res, gaps.chunkGapSec * 1000);
            });
          })
          .then(function () {
            return DictationSpeech.speakPartB(text, baseOpts);
          });
      }
      chain.catch(function (e) {
        toast("朗讀失敗：" + (e && e.message ? e.message : "請再試"));
      });
      return;
    }
    if (onceOnly) {
      var play = DictationSpeech.speakOnce
        ? DictationSpeech.speakOnce(text)
        : DictationSpeech.speak(text);
      play.catch(function (e) {
        toast("朗讀失敗：" + (e && e.message ? e.message : "請再試"));
      });
      return;
    }
    var timesA = settings.repeats || 2;
    var gapA = settings.gapSec || 1.5;
    DictationSpeech.speakRepeats(text, timesA, gapA).catch(function (e) {
      toast("朗讀失敗：" + (e && e.message ? e.message : "請再試"));
    });
  }

  function replayQuizOnce() {
    speakQuizItem(true);
  }

  function hideQuizPreview() {
    var prev = $("#quiz-preview");
    if (prev) prev.hidden = true;
    pendingRecognizeText = "";
    pendingRecognizeMeta = "";
  }

  function showQuizPreview(user, res) {
    pendingRecognizeText = user;
    var method = (res && res.method) || "";
    var conf = res && res.confidence != null ? Math.round(Number(res.confidence)) : null;
    pendingRecognizeMeta =
      (method === "handwriting-recognition-api"
        ? "系統手寫引擎"
        : method === "tesseract"
          ? "Tesseract OCR"
          : method || "辨識") +
      (conf != null ? " · 信心 " + conf : "");
    var box = $("#quiz-preview");
    var textEl = $("#quiz-preview-text");
    var methodEl = $("#quiz-preview-method");
    if (textEl) textEl.textContent = user;
    if (methodEl) methodEl.textContent = pendingRecognizeMeta + " · 未計分，請確認";
    if (box) box.hidden = false;
    $("#quiz-feedback").hidden = true;
    $("#quiz-after").hidden = true;
    var chk = $("#btn-quiz-check");
    if (chk) {
      chk.disabled = false;
      chk.textContent = "重新辨識";
      chk.hidden = false;
    }
  }

  /** Step 1: recognize only — no grade yet */
  function checkQuiz() {
    if (quizChecked || hwRecognizing) return;
    const pad = ensureHwPad();
    if (!pad || pad.isEmpty()) {
      toast("請先喺畫板手寫答案");
      return;
    }
    hwRecognizing = true;
    $("#btn-quiz-check").disabled = true;
    $("#btn-quiz-check").textContent = "辨識中…";
    const st = $("#hw-status");
    if (st) {
      st.textContent = DictationHandwriting.browserInkSupported && DictationHandwriting.browserInkSupported()
        ? "辨識手寫中（系統引擎＋OCR）…"
        : "辨識手寫中（OCR；需要短暫上網）…";
    }
    hideQuizPreview();

    DictationHandwriting.recognize(pad, function (m) {
      if (st) st.textContent = m;
    })
      .then(function (res) {
        hwRecognizing = false;
        const user = (res && res.text) || "";
        if (st) st.textContent = user ? "已辨識，請確認" : "認唔到字跡";
        if (!user) {
          quizChecked = false;
          $("#btn-quiz-check").disabled = false;
          $("#btn-quiz-check").textContent = "辨識手寫";
          const fb = $("#quiz-feedback");
          fb.hidden = false;
          fb.className = "feedback bad";
          fb.textContent = "認唔到，請寫清楚啲（可撳清除／再寫一次）";
          $("#quiz-after").hidden = false;
          var ra = $("#btn-quiz-rewrite-after");
          // show rewrite via after row without next? keep after with rewrite only feel — still show next hidden? 
          // Use preview rewrite path: show after with rewrite
          return;
        }
        showQuizPreview(user, res);
      })
      .catch(function (e) {
        hwRecognizing = false;
        $("#btn-quiz-check").disabled = false;
        $("#btn-quiz-check").textContent = "辨識手寫";
        const msg = e && e.message ? e.message : "辨識失敗";
        if (st) st.textContent = msg;
        toast(msg);
      });
  }

  /** Step 2: strict === grade after user confirms preview */
  function confirmQuizGrade() {
    if (quizChecked || hwRecognizing) return;
    const item = quizItems[quizIdx];
    const user = pendingRecognizeText;
    if (!user) {
      toast("未有辨識結果，請先撳「辨識手寫」");
      return;
    }
    quizChecked = true;
    hideQuizPreview();
    const ok = answersMatch(item, user); // strict normalize ===
    const fb = $("#quiz-feedback");
    fb.hidden = false;
    if (ok) {
      quizCorrect += 1;
      fb.className = "feedback ok";
      fb.textContent = "✅ 正確！辨識：「" + user + "」";
    } else {
      quizWrongs.push({
        id: item.id,
        expect: item.answer,
        got: user,
        part: item.part,
        rewriteCount: Number(quizItemRewrites[quizIdx]) || 0,
      });
      fb.className = "feedback bad";
      fb.textContent =
        "❌ 唔啱。辨識：「" + user + "」· 正確：「" + item.answer + "」";
    }
    $("#quiz-after").hidden = false;
    var chk = $("#btn-quiz-check");
    if (chk) {
      chk.textContent = "已核對";
      chk.disabled = true;
    }
    var st = $("#hw-status");
    if (st) st.textContent = "辨識：「" + user + "」";
  }

  function rewriteQuiz() {
    quizRewriteTotal += 1;
    quizItemRewrites[quizIdx] = (Number(quizItemRewrites[quizIdx]) || 0) + 1;
    const fb = $("#quiz-feedback");
    const wasOk = fb && !fb.hidden && fb.classList.contains("ok");
    const wasBad = fb && !fb.hidden && fb.classList.contains("bad");
    if (quizChecked && wasOk) {
      quizCorrect = Math.max(0, quizCorrect - 1);
    }
    if (quizChecked && wasBad) {
      if (
        quizWrongs.length &&
        quizWrongs[quizWrongs.length - 1].id === quizItems[quizIdx].id
      ) {
        quizWrongs.pop();
      }
    }
    quizChecked = false;
    hwRecognizing = false;
    if (fb) fb.hidden = true;
    $("#quiz-after").hidden = true;
    hideQuizPreview();
    $("#btn-quiz-check").disabled = false;
    $("#btn-quiz-check").textContent = "辨識手寫";
    $("#btn-quiz-check").hidden = false;
    resetHwPad();
    setHwTool("pen");
  }

  function nextQuiz() {
    if (quizIdx + 1 >= quizItems.length) {
      finishQuiz();
      return;
    }
    quizIdx += 1;
    showQuizItem(true);
  }

  function skipQuiz() {
    const item = quizItems[quizIdx];
    quizWrongs.push({
      id: item.id,
      expect: item.answer,
      got: "(跳過)",
      part: item.part,
      rewriteCount: Number(quizItemRewrites[quizIdx]) || 0,
    });
    nextQuiz();
  }

  function formatGot(got) {
    const s = String(got == null ? "" : got).trim();
    if (!s) return "（留空）";
    if (s === "(跳過)" || s === "（跳過）") return "（跳過）";
    return s;
  }

  function finishQuiz() {
    DictationSpeech.stop();
    $("#quiz-run").hidden = true;
    $("#quiz-result").hidden = false;
    const total = quizItems.length;
    const parts = normalizePartList(quizPartsSelected);
    $("#quiz-score").textContent = quizCorrect + "/" + total;
    const pct = total ? Math.round((quizCorrect / total) * 100) : 0;
    const partsLabel = parts.length === 4 ? "全部" : parts.join("、");
    $("#quiz-score-pct").textContent =
      "正確率 " + pct + "% · 範圍 Part " + partsLabel;
    var rwEl = $("#quiz-rewrite-count");
    if (rwEl) {
      rwEl.hidden = false;
      rwEl.textContent = "再寫 " + quizRewriteTotal + " 次";
    }
    const ul = $("#quiz-wrongs");
    ul.innerHTML = "";
    const wrongsNorm = quizWrongs.map(function (w) {
      return {
        id: w.id || "",
        expected: w.expect != null ? w.expect : w.expected || "",
        got: w.got == null ? "" : w.got,
        partId: w.part || w.partId || "",
        part: w.part || w.partId || "",
        expect: w.expect != null ? w.expect : w.expected || "",
        rewriteCount: Math.min(9999, Math.max(0, Number(w.rewriteCount) || 0)),
      };
    });
    if (!wrongsNorm.length) {
      ul.innerHTML =
        "<li style='background:var(--ok-bg);color:var(--ok)'>全部正確！好叻！</li>";
    } else {
      wrongsNorm.forEach(function (w) {
        const li = document.createElement("li");
        li.innerHTML =
          "<strong>Part " +
          escapeHtml(w.partId || "?") +
          "</strong> · 正確：<code>" +
          escapeHtml(w.expected) +
          "</code><br/>辨識／你寫：<code>" +
          escapeHtml(formatGot(w.got)) +
          "</code>";
        ul.appendChild(li);
      });
    }
    $("#quiz-progress").style.width = "100%";

    const whenIso = new Date().toISOString();
    const whenHk = DictationStorage.hkNowString
      ? DictationStorage.hkNowString()
      : whenIso;
    const nickname = DictationStorage.getNickname
      ? DictationStorage.getNickname()
      : "細妹";
    const deviceId = DictationStorage.getDeviceId
      ? DictationStorage.getDeviceId()
      : "";
    const historyEntry = {
      at: whenIso,
      when: whenHk,
      unit: (currentUnit && currentUnit.title) || "",
      parts: parts.slice(),
      score: quizCorrect,
      correct: quizCorrect,
      total: total,
      wrongs: wrongsNorm.map(function (w) {
        return {
          expected: w.expected,
          got: w.got,
          partId: w.partId,
          id: w.id,
          rewriteCount: w.rewriteCount || 0,
        };
      }),
      rewriteTotal: quizRewriteTotal,
      nickname: nickname,
      deviceId: deviceId,
    };
    DictationStorage.pushHistory(historyEntry);

    const cloudPayload = {
      when: whenHk,
      whenIso: whenIso,
      nickname: nickname,
      deviceId: deviceId,
      unit: historyEntry.unit,
      parts: parts.slice(),
      score: quizCorrect,
      total: total,
      wrongs: historyEntry.wrongs,
      rewriteTotal: quizRewriteTotal,
    };
    const uploadEl = $("#quiz-upload-status");
    if (uploadEl) {
      uploadEl.textContent = "正在上傳成績同錯字…";
      uploadEl.hidden = false;
    }
    function setUploadStatus(msg) {
      if (uploadEl) {
        uploadEl.hidden = false;
        uploadEl.textContent = msg;
      }
    }
    function doUpload() {
      if (!window.DictationCloud || typeof window.DictationCloud.saveSession !== "function") {
        window.__dictationPendingSessions = window.__dictationPendingSessions || [];
        window.__dictationPendingSessions.push(cloudPayload);
        setUploadStatus("雲端未就緒——已暫存，稍後會再試上傳（本機已記低）");
        return;
      }
      window.DictationCloud.saveSession(cloudPayload)
        .then(function (status) {
          if (status === "cloud") setUploadStatus("已上傳雲端（分數＋錯字）");
          else if (status === "local")
            setUploadStatus("暫時上唔到雲端——已留本機，稍後會再試");
          else setUploadStatus("上傳失敗——已留本機／待傳佇列（練習唔受影響）");
        })
        .catch(function () {
          setUploadStatus("上傳失敗——已留本機（練習唔受影響）");
        });
    }
    doUpload();
  }

  /* ---------- Manage / OCR ---------- */
  function loadU4Sample() {
    DictationStorage.clearCustomUnit();
    refreshUnitBadge();
    $("#paste-area").value = DictationData.unitToPasteLines(DictationData.UNIT_U4);
    $("#unit-title-input").value = DictationData.UNIT_U4.title;
    toast("已載入 4A U4 範例");
  }

  function savePaste() {
    const title = $("#unit-title-input").value.trim() || "自訂範圍";
    const text = $("#paste-area").value;
    const unit = DictationStorage.parsePasteToUnit(text, title);
    if (!unit.parts.A.items.length) {
      toast("請至少貼一行詞語");
      return;
    }
    DictationStorage.saveCustomUnit(unit);
    refreshUnitBadge();
    toast("已儲存 " + unit.parts.A.items.length + " 項（本機）");
  }

  let ocrFile = null;

  function onOcrFile(file) {
    ocrFile = file || null;
    const img = $("#ocr-preview");
    if (!ocrFile) {
      img.hidden = true;
      img.removeAttribute("src");
      return;
    }
    const url = URL.createObjectURL(ocrFile);
    img.src = url;
    img.hidden = false;
  }

  async function runOcr() {
    if (!ocrFile) {
      toast("請先揀相片");
      return;
    }
    const st = $("#ocr-status");
    st.textContent = "載入 OCR…";
    try {
      const raw = await DictationOCR.recognize(ocrFile, function (m) {
        st.textContent = m;
      });
      const cleaned = DictationOCR.cleanOcrText(raw);
      $("#paste-area").value = cleaned;
      st.textContent = "完成——請檢查下面文字再撳「儲存」";
      toast("OCR 完成，請校對");
    } catch (e) {
      st.textContent = e && e.message ? e.message : "OCR 失敗";
      toast("OCR 失敗");
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Teacher cloud sessions ---------- */
  function getQuery() {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch (e) {
      return { get: function () { return null; } };
    }
  }

  function isTeacherMode() {
    try {
      return getQuery().get("teacher") === "1";
    } catch (e) {
      return false;
    }
  }

  function cloudApi() {
    const c = window.DictationCloud;
    if (!c) return null;
    if (typeof c.fetchSessions === "function") return c;
    if (typeof c.loadSessions === "function") {
      c.fetchSessions = function (n) {
        return c.loadSessions(n);
      };
    }
    return c;
  }

  function formatSessionWrongs(s) {
    const wrongs = (s && s.wrongs) || [];
    if (!wrongs.length) return '<span class="ok-tag">全對</span>';
    return (
      '<ul class="teacher-wrong-ul">' +
      wrongs
        .slice(0, 40)
        .map(function (w) {
          const exp = escapeHtml(w.expected != null ? w.expected : w.expect || "");
          const got = escapeHtml(formatGot(w.got));
          const part = escapeHtml(w.partId || w.part || "?");
          return (
            "<li><strong>P" +
            part +
            "</strong> 正確 <code>" +
            exp +
            "</code> · 寫 <code>" +
            got +
            "</code></li>"
          );
        })
        .join("") +
      (wrongs.length > 40 ? "<li>…另有 " + (wrongs.length - 40) + " 項</li>" : "") +
      "</ul>"
    );
  }

  function aggregateDictationWrongs(sessions) {
    const map = {};
    (sessions || []).forEach(function (s) {
      ((s && s.wrongs) || []).forEach(function (w) {
        const key = String((w && (w.expected != null ? w.expected : w.expect)) || "").trim().toLowerCase();
        if (!key) return;
        if (!map[key]) {
          map[key] = {
            text: w.expected != null ? w.expected : w.expect,
            count: 0,
            partId: w.partId || w.part || "",
          };
        }
        map[key].count += 1;
      });
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });
  }

  function loadTeacherSessions(force) {
    const body = $("#teacher-body");
    const meta = $("#teacher-meta");
    if (!body) return;
    if (!force && body.getAttribute("data-loaded") === "1") return;
    body.innerHTML = '<p class="empty-note">載入雲端場次中…</p>';
    if (meta) meta.textContent = "讀取 Firestore…";

    function render(result) {
      const sessions = (result && result.sessions) || [];
      body.setAttribute("data-loaded", "1");
      if (meta) {
        meta.textContent =
          (result && result.source === "cloud"
            ? "雲端 · 最近 " + sessions.length + " 場"
            : "未能讀雲端") +
          (result && result.error ? "（" + result.error + "）" : "") +
          " · english_dictation/sessions/entries";
      }
      if (!sessions.length) {
        body.innerHTML =
          '<p class="empty-note">未有雲端場次。請確認 Firestore 規則已加 english-dictation 路徑；本機默書仍會暫存 pending。</p>';
        return;
      }
      const agg = aggregateDictationWrongs(sessions);
      let html = "";
      if (agg.length) {
        html += '<h3 class="teacher-h3">常錯合計（今批場次）</h3><ul class="top-wrongs-list">';
        agg.slice(0, 15).forEach(function (r) {
          html +=
            "<li><span class=\"tw-count\">×" +
            escapeHtml(String(r.count)) +
            '</span> <code>' +
            escapeHtml(r.text) +
            "</code>" +
            (r.partId ? ' <span class="tw-snip">Part ' + escapeHtml(String(r.partId)) + "</span>" : "") +
            "</li>";
        });
        html += "</ul>";
      }
      html += '<h3 class="teacher-h3">最近場次</h3>';
      html +=
        '<div class="hist-table-wrap"><table class="hist teacher-hist"><thead><tr>' +
        "<th>時間（香港）</th><th>暱稱</th><th>範圍</th><th>分數</th><th>再寫</th><th>錯字</th>" +
        "</tr></thead><tbody>";
      sessions.forEach(function (s) {
        const total = Number(s.total) || 0;
        const score = Number(s.score != null ? s.score : s.correct) || 0;
        const pct = total ? Math.round((score / total) * 100) : 0;
        const parts = Array.isArray(s.parts) ? s.parts.join("、") : "";
        var rwTotal = Math.min(9999, Math.max(0, Number(s.rewriteTotal) || 0));
        html +=
          "<tr><td>" +
          escapeHtml(s.when || s.whenIso || "") +
          "</td><td>" +
          escapeHtml(s.nickname || "") +
          "</td><td>" +
          escapeHtml((s.unit || "") + (parts ? " · Part " + parts : "")) +
          "</td><td>" +
          escapeHtml(String(score) + "/" + String(total) + "（" + pct + "%）") +
          "</td><td>" +
          escapeHtml(String(rwTotal)) +
          '</td><td class="hist-wrongs">' +
          formatSessionWrongs(s) +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
      body.innerHTML = html;
    }

    function run(api) {
      const fetchFn =
        typeof api.fetchSessions === "function"
          ? api.fetchSessions.bind(api)
          : api.loadSessions.bind(api);
      fetchFn(50)
        .then(render)
        .catch(function (err) {
          render({
            source: "none",
            sessions: [],
            error: String(err && err.message ? err.message : err),
          });
        });
    }

    const api = cloudApi();
    if (api && (api.fetchSessions || api.loadSessions)) {
      run(api);
    } else {
      const once = function () {
        window.removeEventListener("dictationcloud-ready", once);
        const a = cloudApi();
        if (a && (a.fetchSessions || a.loadSessions)) run(a);
        else
          render({
            source: "none",
            sessions: [],
            error: "cloud not loaded",
          });
      };
      window.addEventListener("dictationcloud-ready", once);
      setTimeout(function () {
        if (body.getAttribute("data-loaded") !== "1") {
          render({ source: "none", sessions: [], error: "timeout" });
        }
      }, 10000);
    }
  }

  function bindTeacherPanel() {
    const panel = $("#teacher-panel");
    if (!panel) return;
    if (isTeacherMode()) {
      try {
        panel.open = true;
      } catch (e) {}
      panel.hidden = false;
    }
    on("#btn-teacher-refresh", "click", function () {
      loadTeacherSessions(true);
    });
    if (!panel._dictBound) {
      panel.addEventListener("toggle", function () {
        if (panel.open) loadTeacherSessions(false);
      });
      panel._dictBound = true;
    }
    if (isTeacherMode() || panel.open) loadTeacherSessions(false);
  }

  /* ---------- Wire events ---------- */
  function init() {
    try {
      applySpeechSettings();
      refreshUnitBadge();
      syncHomeControls();

      on("#btn-home", "click", function () {
        showView("view-home");
        const setup = $("#quiz-setup");
        const run = $("#quiz-run");
        const result = $("#quiz-result");
        if (setup) setup.hidden = false;
        if (run) run.hidden = true;
        if (result) result.hidden = true;
      });
      on("#btn-goto-study", "click", function () {
        showView("view-study");
        loadStudy();
      });
      on("#btn-goto-quiz", "click", function () {
        showView("view-quiz");
        const setup = $("#quiz-setup");
        const run = $("#quiz-run");
        const result = $("#quiz-result");
        if (setup) setup.hidden = false;
        if (run) run.hidden = true;
        if (result) result.hidden = true;
        const repeats = $("#quiz-repeats");
        const gap = $("#quiz-gap");
        const bmode = $("#quiz-bmode");
        const cmode = $("#quiz-cmode");
        if (repeats) repeats.value = String(settings.repeats || 2);
        if (gap) gap.value = String(settings.gapSec || 1.5);
        if (bmode) bmode.value = settings.bMode || "sentence";
        if (cmode) cmode.value = settings.cMode || "set";
        quizPartsSelected = normalizePartList(settings.quizParts || quizPartsSelected);
        syncQuizPartsUi();
        const nick = $("#quiz-nickname");
        if (nick && DictationStorage.getNickname) nick.value = DictationStorage.getNickname();
      });
      on("#btn-goto-manage", "click", function () {
        showView("view-manage");
      });

      on("#rate-slider", "input", function () {
        settings.rate = Number(this.value);
        const label = $("#rate-label");
        if (label)
          label.textContent = settings.rate.toFixed(2).replace(/0$/, "");
        persistSettings();
      });
      $$("[data-lang]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          settings.lang = btn.getAttribute("data-lang");
          persistSettings();
          syncHomeControls();
        });
      });
      on("#btn-test-speak", "click", function () {
        if (!window.DictationSpeech) {
          toast("朗讀未就緒");
          return;
        }
        DictationSpeech.speak("spaghetti").catch(function (e) {
          toast(e.message || "朗讀失敗");
        });
      });

      // study parts
      $$("#study-parts button").forEach(function (b) {
        b.addEventListener("click", function () {
          studyPart = b.getAttribute("data-part");
          setSegActive("#study-parts", studyPart);
          loadStudy();
        });
      });
      on("#btn-toggle-spell", "click", function () {
        studyHideSpell = !studyHideSpell;
        this.textContent = studyHideSpell ? "顯示拼寫" : "隱藏拼寫";
        renderStudy();
      });
      on("#btn-study-speak", "click", speakStudy);
      on("#btn-study-chunk-prev", "click", function () {
        if (!studyCards.length) return;
        studyIdx = (studyIdx - 1 + studyCards.length) % studyCards.length;
        renderStudy();
      });
      on("#btn-study-chunk-next", "click", function () {
        if (!studyCards.length) return;
        studyIdx = (studyIdx + 1) % studyCards.length;
        renderStudy();
      });
      on("#btn-study-prev", "click", function () {
        if (!studyCards.length) return;
        studyIdx = (studyIdx - 1 + studyCards.length) % studyCards.length;
        renderStudy();
      });
      on("#btn-study-next", "click", function () {
        if (!studyCards.length) return;
        studyIdx = (studyIdx + 1) % studyCards.length;
        renderStudy();
      });

      // quiz — multi-select parts
      quizPartsSelected = normalizePartList(settings.quizParts || ["A"]);
      syncQuizPartsUi();
      $$("#quiz-parts button").forEach(function (b) {
        b.addEventListener("click", function () {
          toggleQuizPart(b.getAttribute("data-part"));
        });
      });
      const nickInput = $("#quiz-nickname");
      if (nickInput) {
        nickInput.value = DictationStorage.getNickname
          ? DictationStorage.getNickname()
          : "細妹";
        function saveNick() {
          if (!DictationStorage.setNickname) return;
          nickInput.value = DictationStorage.setNickname(nickInput.value);
        }
        nickInput.addEventListener("change", saveNick);
        nickInput.addEventListener("blur", saveNick);
      }
      const homeNick = $("#home-nickname");
      if (homeNick) {
        homeNick.value = DictationStorage.getNickname
          ? DictationStorage.getNickname()
          : "細妹";
        function saveHomeNick() {
          if (!DictationStorage.setNickname) return;
          const v = DictationStorage.setNickname(homeNick.value);
          homeNick.value = v;
          if (nickInput) nickInput.value = v;
        }
        homeNick.addEventListener("change", saveHomeNick);
        homeNick.addEventListener("blur", saveHomeNick);
      }
      on("#btn-quiz-start", "click", startQuiz);
      on("#btn-quiz-replay", "click", replayQuizOnce);
      on("#btn-quiz-check", "click", checkQuiz);
      on("#btn-quiz-confirm", "click", confirmQuizGrade);
      on("#btn-quiz-skip", "click", skipQuiz);
      on("#btn-quiz-next", "click", nextQuiz);
      on("#btn-quiz-again", "click", function () {
        const setup = $("#quiz-setup");
        const result = $("#quiz-result");
        if (setup) setup.hidden = false;
        if (result) result.hidden = true;
      });
      on("#btn-quiz-home", "click", function () {
        showView("view-home");
      });
      on("#btn-quiz-rewrite", "click", rewriteQuiz);
      on("#btn-quiz-rewrite-after", "click", rewriteQuiz);
      on("#btn-hw-clear", "click", function () {
        if (hwPad) hwPad.clear();
        const st = $("#hw-status");
        if (st) st.textContent = "";
      });
      on("#btn-hw-undo", "click", function () {
        if (hwPad) hwPad.undo();
      });
      on("#btn-hw-pen", "click", function () {
        setHwTool("pen");
      });
      on("#btn-hw-eraser", "click", function () {
        setHwTool("erase");
      });
      on("#hw-grid", "change", function () {
        ensureHwPad();
        if (hwPad) hwPad.setGrid(this.checked);
      });
      on("#hw-pen", "input", function () {
        ensureHwPad();
        if (hwPad) hwPad.setPenWidth(this.value);
      });
      setHwTool("pen");

      // manage
      on("#btn-load-u4", "click", loadU4Sample);
      on("#btn-clear-custom", "click", function () {
        DictationStorage.clearCustomUnit();
        refreshUnitBadge();
        toast("已還原範例單元");
      });
      on("#btn-save-paste", "click", savePaste);
      on("#ocr-file", "change", function () {
        onOcrFile(this.files && this.files[0]);
      });
      on("#btn-run-ocr", "click", function () {
        runOcr();
      });

      bindTeacherPanel();
    } catch (err) {
      console.error("[dictation] init failed", err);
      toast(
        "初始化失敗：" +
          (err && err.message ? err.message : String(err)) +
          "（請重新整理；若仍唔得話我）"
      );
    }
  }

  function boot() {
    try {
      init();
    } catch (err) {
      console.error("[dictation] boot failed", err);
      toast("啟動失敗：" + (err && err.message ? err.message : String(err)));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
