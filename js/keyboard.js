/* 英文默書温習 · on-screen keyboard (no system IME / no autocorrect) · d15 */
(function (global) {
  "use strict";

  var ROWS_LOWER = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ];
  var PUNCT = ["'", ",", ".", "?", "-"];

  function create(opts) {
    opts = opts || {};
    var board = opts.board;
    var display = opts.display;
    var onChange = typeof opts.onChange === "function" ? opts.onChange : null;
    if (!board) throw new Error("DictationKeyboard: board required");

    var value = "";
    var shift = false;

    function syncDisplay() {
      if (display) {
        if (value) {
          display.textContent = value;
          display.classList.remove("kb-answer-empty");
        } else {
          display.textContent = "（尚未輸入）";
          display.classList.add("kb-answer-empty");
        }
      }
      if (onChange) onChange(value);
    }

    function setValue(v) {
      value = String(v == null ? "" : v);
      syncDisplay();
    }

    function getValue() {
      return value;
    }

    function clear() {
      setValue("");
    }

    function appendChar(ch) {
      value += ch;
      if (shift) {
        shift = false;
        paintKeys();
      }
      syncDisplay();
    }

    function backspace() {
      if (!value) return;
      value = value.slice(0, -1);
      syncDisplay();
    }

    function toggleShift() {
      shift = !shift;
      paintKeys();
    }

    function makeBtn(label, className, handler) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "kb-key" + (className ? " " + className : "");
      b.textContent = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", function (e) {
        e.preventDefault();
        handler();
      });
      // Prevent iOS long-press / focus stealing into system keyboard
      b.addEventListener("mousedown", function (e) {
        e.preventDefault();
      });
      return b;
    }

    function letterLabel(ch) {
      return shift ? ch.toUpperCase() : ch;
    }

    function paintKeys() {
      board.innerHTML = "";
      ROWS_LOWER.forEach(function (row, ri) {
        var rowEl = document.createElement("div");
        rowEl.className = "kb-row";
        if (ri === 2) {
          var shiftBtn = makeBtn(shift ? "⇧ ON" : "⇧", "kb-key-wide kb-key-shift" + (shift ? " active" : ""), toggleShift);
          shiftBtn.setAttribute("aria-pressed", shift ? "true" : "false");
          rowEl.appendChild(shiftBtn);
        }
        row.forEach(function (ch) {
          rowEl.appendChild(
            makeBtn(letterLabel(ch), "", function () {
              appendChar(letterLabel(ch));
            })
          );
        });
        if (ri === 2) {
          rowEl.appendChild(
            makeBtn("⌫", "kb-key-wide kb-key-back", backspace)
          );
        }
        board.appendChild(rowEl);
      });

      var punctRow = document.createElement("div");
      punctRow.className = "kb-row kb-row-punct";
      PUNCT.forEach(function (ch) {
        punctRow.appendChild(
          makeBtn(ch, "kb-key-punct", function () {
            appendChar(ch);
          })
        );
      });
      punctRow.appendChild(
        makeBtn("空白", "kb-key-space", function () {
          appendChar(" ");
        })
      );
      punctRow.appendChild(
        makeBtn("清除", "kb-key-wide kb-key-clear", clear)
      );
      board.appendChild(punctRow);
    }

    paintKeys();
    syncDisplay();

    return {
      getValue: getValue,
      setValue: setValue,
      clear: clear,
      isEmpty: function () {
        return !String(value).trim();
      },
    };
  }

  global.DictationKeyboard = {
    create: create,
    PUNCT: PUNCT.slice(),
  };
})(typeof window !== "undefined" ? window : this);
