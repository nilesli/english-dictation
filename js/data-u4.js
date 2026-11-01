/* 4A U4 – Eating out · Salesian Yip Hon Millennium Primary School · preloaded sample */
(function (global) {
  "use strict";

  const PART_B_PARAGRAPH = {
    id: "b-para",
    kind: "passage",
    label: "段落",
    // full text with underline markers as {u}...{/u}
    html:
      "Ella and Sam {u}ordered{/u} macaroni with mushrooms and beef curry for dinner. " +
      "The mushrooms {u}were{/u} bland. The curry {u}was{/u} too salty. " +
      "It was the worst curry in Sam’s life.",
    plain:
      "Ella and Sam ordered macaroni with mushrooms and beef curry for dinner. " +
      "The mushrooms were bland. The curry was too salty. " +
      "It was the worst curry in Sam’s life.",
    sentences: [
      {
        id: "b-s1a",
        text: "Ella and Sam ordered macaroni with mushrooms",
        focus: "ordered",
      },
      {
        id: "b-s1b",
        text: "and beef curry for dinner.",
        focus: null,
      },
      {
        id: "b-s2",
        text: "The mushrooms were bland.",
        focus: "were",
      },
      {
        id: "b-s3",
        text: "The curry was too salty.",
        focus: "was",
      },
      {
        id: "b-s4",
        text: "It was the worst curry in Sam’s life.",
        focus: null,
      },
    ],
    focusPhrases: ["ordered", "were", "was"],
  };

  const PART_B_DIALOGUE = {
    id: "b-dlg",
    kind: "dialogue",
    label: "對話",
    html:
      "{u}What would you like?{/u} {u}I’d like{/u} soup noodles. " +
      "Which {u}would you like{/u}, dumplings or pork chop? {u}I’d like{/u} dumplings, please.",
    plain:
      "What would you like? I’d like soup noodles. " +
      "Which would you like, dumplings or pork chop? I’d like dumplings, please.",
    sentences: [
      {
        id: "b-d1",
        text: "What would you like?",
        focus: "What would you like?",
      },
      {
        id: "b-d2",
        text: "I’d like soup noodles.",
        focus: "I’d like",
      },
      {
        id: "b-d3",
        text: "Which would you like, dumplings or pork chop?",
        focus: "would you like",
      },
      {
        id: "b-d4",
        text: "I’d like dumplings, please.",
        focus: "I’d like",
      },
    ],
    focusPhrases: [
      "What would you like?",
      "I’d like",
      "would you like",
      "I’d like",
    ],
  };

  const UNIT_U4 = {
    id: "4a-u4-eating-out",
    title: "4A U4 – Eating out",
    school: "慈幼葉漢千禧小學 Salesian Yip Hon Millennium Primary School",
    level: "P.4",
    version: "20261101d2",
    parts: {
      A: {
        id: "A",
        name: "Part A 詞語",
        weight: "20%",
        items: [
          { id: "a1", en: "prawn salad", zh: "蝦沙律" },
          { id: "a2", en: "meat sauce", zh: "肉醬" },
          { id: "a3", en: "spaghetti", zh: "意粉" },
          { id: "a4", en: "sour", zh: "酸" },
          { id: "a5", en: "bitter", zh: "苦" },
        ],
      },
      B: {
        id: "B",
        name: "Part B 朗誦",
        weight: "60%",
        passages: [PART_B_PARAGRAPH, PART_B_DIALOGUE],
      },
      C: {
        id: "C",
        name: "Part C 動詞三式",
        weight: "20%",
        items: [
          {
            id: "c1",
            base: "have",
            past: "had",
            ing: "having",
            speakSet: "have, had, having",
          },
          {
            id: "c2",
            base: "take",
            past: "took",
            ing: "taking",
            speakSet: "take, took, taking",
          },
          {
            id: "c3",
            base: "taste",
            past: "tasted",
            ing: "tasting",
            speakSet: "taste, tasted, tasting",
          },
          {
            id: "c4",
            base: "work",
            past: "worked",
            ing: "working",
            speakSet: "work, worked, working",
          },
        ],
      },
      D: {
        id: "D",
        name: "Part D 食物／形容詞",
        weight: "@10%",
        note: "Book p.83-84",
        items: [
          { id: "d1", en: "pumpkin soup", zh: "南瓜湯" },
          { id: "d2", en: "baked lobster", zh: "焗龍蝦" },
          { id: "d3", en: "barbecue pork", zh: "叉燒" },
          { id: "d4", en: "steamed fish", zh: "蒸魚" },
          { id: "d5", en: "fruit tart", zh: "水果撻" },
          { id: "d6", en: "roast suckling pig", zh: "燒乳豬" },
          { id: "d7", en: "fish balls", zh: "魚蛋" },
          { id: "d8", en: "cream puff", zh: "奶油泡芙" },
          { id: "d9", en: "deep-fried wontons", zh: "炸雲吞" },
          { id: "d10", en: "savory", zh: "鹹香／可口" },
          { id: "d11", en: "juicy", zh: "多汁" },
          { id: "d12", en: "overcooked", zh: "煮得過熟" },
        ],
      },
    },
  };

  /** Flatten unit into dictation quiz items */
  function buildQuizItems(unit, opts) {
    opts = opts || {};
    const parts = opts.parts || ["A", "B", "C", "D"];
    const bMode = opts.bMode || "sentence"; // "sentence" | "focus"
    const cMode = opts.cMode || "set"; // "set" | "forms"
    const out = [];

    if (parts.includes("A")) {
      unit.parts.A.items.forEach(function (it) {
        out.push({
          id: it.id,
          part: "A",
          type: "word",
          promptSpeak: it.en,
          answer: it.en,
          zh: it.zh || "",
          label: it.en,
        });
      });
    }

    if (parts.includes("B")) {
      unit.parts.B.passages.forEach(function (pass) {
        if (bMode === "focus") {
          pass.focusPhrases.forEach(function (fp, i) {
            out.push({
              id: pass.id + "-f" + i,
              part: "B",
              type: "phrase",
              promptSpeak: fp,
              answer: fp,
              zh: "",
              label: fp,
              hint: pass.label + " · 重點",
              chunkIndex: i + 1,
              chunkTotal: pass.focusPhrases.length,
              passageId: pass.id,
            });
          });
        } else {
          pass.sentences.forEach(function (s, si) {
            out.push({
              id: s.id,
              part: "B",
              type: "sentence",
              promptSpeak: s.text,
              answer: s.text,
              zh: "",
              label: s.text,
              hint: pass.label,
              focus: s.focus,
              chunkIndex: si + 1,
              chunkTotal: pass.sentences.length,
              passageId: pass.id,
            });
          });
        }
      });
    }

    if (parts.includes("C")) {
      unit.parts.C.items.forEach(function (it) {
        if (cMode === "forms") {
          ["base", "past", "ing"].forEach(function (k) {
            const form = it[k];
            out.push({
              id: it.id + "-" + k,
              part: "C",
              type: "verb-form",
              promptSpeak: form,
              answer: form,
              zh: "",
              label: form,
              hint: it.base + " · " + k,
            });
          });
        } else {
          out.push({
            id: it.id,
            part: "C",
            type: "verb-set",
            promptSpeak: it.speakSet,
            answer: it.speakSet,
            // also accept "base past ing" without commas
            answers: [
              it.speakSet,
              it.base + " " + it.past + " " + it.ing,
              it.base + ", " + it.past + ", " + it.ing,
            ],
            zh: "",
            label: it.speakSet,
            hint: "Base / Past / -ing",
          });
        }
      });
    }

    if (parts.includes("D")) {
      unit.parts.D.items.forEach(function (it) {
        out.push({
          id: it.id,
          part: "D",
          type: "word",
          promptSpeak: it.en,
          answer: it.en,
          zh: it.zh || "",
          label: it.en,
        });
      });
    }

    return out;
  }

  /** Study cards for 温習 */
  function buildStudyCards(unit, parts) {
    parts = parts || ["A", "B", "C", "D"];
    const cards = [];

    if (parts.includes("A")) {
      unit.parts.A.items.forEach(function (it) {
        cards.push({
          id: it.id,
          part: "A",
          kind: "word",
          en: it.en,
          zh: it.zh || "",
          speak: it.en,
        });
      });
    }

    if (parts.includes("B")) {
      unit.parts.B.passages.forEach(function (pass) {
        cards.push({
          id: pass.id,
          part: "B",
          kind: "passage",
          label: pass.label,
          html: pass.html,
          plain: pass.plain,
          speak: pass.plain,
          sentences: pass.sentences,
        });
        pass.sentences.forEach(function (s) {
          cards.push({
            id: s.id + "-study",
            part: "B",
            kind: "sentence",
            en: s.text,
            zh: s.focus ? "重點：" + s.focus : "",
            speak: s.text,
            focus: s.focus,
          });
        });
      });
    }

    if (parts.includes("C")) {
      unit.parts.C.items.forEach(function (it) {
        cards.push({
          id: it.id,
          part: "C",
          kind: "verb",
          en: it.speakSet,
          zh: "原形／過去式／-ing",
          speak: it.speakSet,
          base: it.base,
          past: it.past,
          ing: it.ing,
        });
      });
    }

    if (parts.includes("D")) {
      unit.parts.D.items.forEach(function (it) {
        cards.push({
          id: it.id,
          part: "D",
          kind: "word",
          en: it.en,
          zh: it.zh || "",
          speak: it.en,
        });
      });
    }

    return cards;
  }

  function htmlWithUnderline(marked) {
    return String(marked || "")
      .replace(/\{u\}/g, '<u class="focus-u">')
      .replace(/\{\/u\}/g, "</u>");
  }

  /** Convert unit to editable paste lines for 管理範圍 */
  function unitToPasteLines(unit) {
    const lines = [];
    lines.push("# " + unit.title);
    lines.push("## Part A");
    unit.parts.A.items.forEach(function (it) {
      lines.push(it.en + (it.zh ? " | " + it.zh : ""));
    });
    lines.push("## Part B");
    unit.parts.B.passages.forEach(function (p) {
      lines.push(p.plain);
    });
    lines.push("## Part C");
    unit.parts.C.items.forEach(function (it) {
      lines.push(it.speakSet);
    });
    lines.push("## Part D");
    unit.parts.D.items.forEach(function (it) {
      lines.push(it.en + (it.zh ? " | " + it.zh : ""));
    });
    return lines.join("\n");
  }

  global.DictationData = {
    UNIT_U4: UNIT_U4,
    buildQuizItems: buildQuizItems,
    buildStudyCards: buildStudyCards,
    htmlWithUnderline: htmlWithUnderline,
    unitToPasteLines: unitToPasteLines,
  };
})(typeof window !== "undefined" ? window : globalThis);
