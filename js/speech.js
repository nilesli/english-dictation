/* Web Speech API · slow default · en-GB preferred · d9
 * Replay-safe: speakToken cancels in-flight speakRepeats chains.
 * iOS/Safari: resume hack for speechSynthesis pause bug.
 */
(function (global) {
  "use strict";

  const state = {
    rate: 0.75,
    lang: "en-GB",
    voiceURI: "",
    speaking: false,
  };

  let speakToken = 0;
  let resumeTimer = null;

  function supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  function setRate(r) {
    const n = Number(r);
    if (!isNaN(n)) state.rate = Math.min(1, Math.max(0.5, n));
  }

  function setLang(lang) {
    state.lang = lang === "en-US" ? "en-US" : "en-GB";
    state.voiceURI = "";
  }

  function getRate() {
    return state.rate;
  }

  function getLang() {
    return state.lang;
  }

  function pickVoice() {
    if (!supported()) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    if (state.voiceURI) {
      const byUri = voices.find(function (v) {
        return v.voiceURI === state.voiceURI;
      });
      if (byUri) return byUri;
    }
    const prefer = state.lang;
    let v =
      voices.find(function (x) {
        return x.lang === prefer;
      }) ||
      voices.find(function (x) {
        return (
          (x.lang || "").toLowerCase().indexOf(prefer.toLowerCase().slice(0, 2)) === 0 &&
          (x.lang || "").toLowerCase().indexOf("gb") >= 0
        );
      }) ||
      voices.find(function (x) {
        return (x.lang || "").toLowerCase().indexOf("en-gb") === 0;
      }) ||
      voices.find(function (x) {
        return (x.lang || "").toLowerCase().indexOf("en") === 0;
      });
    return v || voices[0];
  }

  function clearResumeHack() {
    if (resumeTimer) {
      clearInterval(resumeTimer);
      resumeTimer = null;
    }
  }

  function startResumeHack() {
    clearResumeHack();
    if (!supported()) return;
    // Safari/iOS often pauses TTS after ~15s; nudge resume while we intend to speak
    resumeTimer = setInterval(function () {
      try {
        if (window.speechSynthesis && window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {}
    }, 2500);
  }

  function cancelAudio() {
    clearResumeHack();
    if (!supported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
    state.speaking = false;
  }

  /** Stop audio and invalidate any pending speak / speakRepeats chain. */
  function stop() {
    speakToken += 1;
    cancelAudio();
  }

  /**
   * Speak text once. Returns a Promise that resolves when done.
   * opts.continueChain — do not bump token / cancel (used by speakRepeats).
   */
  function speak(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (!supported()) {
        reject(new Error("呢部裝置唔支援朗讀（Web Speech API）"));
        return;
      }
      const t = String(text || "").trim();
      if (!t) {
        resolve();
        return;
      }
      if (!opts.continueChain) {
        speakToken += 1;
        cancelAudio();
      }
      const token = speakToken;
      // iOS needs a beat after cancel before the next utterance sticks
      setTimeout(function () {
        if (token !== speakToken) {
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(t);
        u.rate = opts.rate != null ? opts.rate : state.rate;
        u.lang = opts.lang || state.lang;
        u.pitch = opts.pitch != null ? opts.pitch : 1;
        const voice = pickVoice();
        if (voice) u.voice = voice;
        u.onend = function () {
          if (token === speakToken) {
            state.speaking = false;
            clearResumeHack();
          }
          resolve();
        };
        u.onerror = function (ev) {
          if (token === speakToken) {
            state.speaking = false;
            clearResumeHack();
          }
          // interrupted / canceled is normal when Replay
          if (
            !ev ||
            ev.error === "interrupted" ||
            ev.error === "canceled" ||
            token !== speakToken
          ) {
            resolve();
            return;
          }
          reject(ev || new Error("speech error"));
        };
        state.speaking = true;
        startResumeHack();
        try {
          window.speechSynthesis.speak(u);
          // some WebKit builds start paused
          try {
            window.speechSynthesis.resume();
          } catch (e2) {}
        } catch (err) {
          state.speaking = false;
          clearResumeHack();
          reject(err);
        }
      }, 120);
    });
  }

  /**
   * Speak text `times` times with `gapSec` pause between.
   * A new speak / stop / speakRepeats invalidates this chain.
   */
  function speakRepeats(text, times, gapSec) {
    times = Math.max(1, Math.min(5, Number(times) || 1));
    gapSec = Math.max(0, Number(gapSec) || 0);
    speakToken += 1;
    cancelAudio();
    const token = speakToken;
    let chain = Promise.resolve();
    for (let i = 0; i < times; i++) {
      chain = chain.then(function () {
        if (token !== speakToken) return;
        return speak(text, { continueChain: true });
      });
      if (i < times - 1 && gapSec > 0) {
        chain = chain.then(function () {
          return new Promise(function (r) {
            setTimeout(function () {
              r();
            }, gapSec * 1000);
          });
        });
      }
    }
    return chain;
  }

  /** Replay helper: always one clear play of current text (unlimited taps). */
  function speakOnce(text) {
    return speak(text, {});
  }

  /**
   * Split text into ~maxWords (default 4) English-word chunks.
   * Punctuation stays attached to its word via whitespace split.
   */
  function chunkWords(text, maxWords) {
    maxWords = Math.max(3, Math.min(4, Number(maxWords) || 4));
    const words = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (let i = 0; i < words.length; i += maxWords) {
      out.push(words.slice(i, i + maxWords).join(" "));
    }
    // Avoid a lonely 1-word tail when previous chunk has room
    if (out.length >= 2) {
      const lastWords = out[out.length - 1].split(/\s+/);
      const prevWords = out[out.length - 2].split(/\s+/);
      if (lastWords.length === 1 && prevWords.length < maxWords) {
        out[out.length - 2] = prevWords.concat(lastWords).join(" ");
        out.pop();
      }
    }
    return out;
  }

  function delayMs(ms, token) {
    return new Promise(function (r) {
      setTimeout(function () {
        r();
      }, ms);
    });
  }

  /**
   * Part B paced speech: ~4–5 words per chunk; pause between words; longer between chunks.
   * opts.wordGapSec default 0.4; opts.chunkGapSec default 0.9; opts.maxWords default 4
   * opts.onlyChunkIndex — replay one chunk only
   * opts.onChunk(index, chunkText) — fired when a chunk starts
   */
  function speakPartB(text, opts) {
    opts = opts || {};
    const maxWords = opts.maxWords != null ? opts.maxWords : 4;
    const wordGap = opts.wordGapSec != null ? Number(opts.wordGapSec) : 0.4;
    const chunkGap = opts.chunkGapSec != null ? Number(opts.chunkGapSec) : 0.9;
    let chunks = chunkWords(text, maxWords);
    if (!chunks.length) return Promise.resolve();
    if (opts.onlyChunkIndex != null) {
      const idx = Number(opts.onlyChunkIndex);
      if (idx >= 0 && idx < chunks.length) chunks = [chunks[idx]];
      else return Promise.resolve();
    }
    speakToken += 1;
    cancelAudio();
    const token = speakToken;
    let chain = Promise.resolve();
    chunks.forEach(function (chunk, ci) {
      const words = chunk.split(/\s+/).filter(Boolean);
      words.forEach(function (w, wi) {
        chain = chain.then(function () {
          if (token !== speakToken) return;
          if (wi === 0 && typeof opts.onChunk === "function") {
            try {
              opts.onChunk(ci, chunk);
            } catch (e) {}
          }
          return speak(w, { continueChain: true });
        });
        if (wi < words.length - 1 && wordGap > 0) {
          chain = chain.then(function () {
            if (token !== speakToken) return;
            return delayMs(wordGap * 1000, token);
          });
        }
      });
      if (ci < chunks.length - 1 && chunkGap > 0) {
        chain = chain.then(function () {
          if (token !== speakToken) return;
          return delayMs(chunkGap * 1000, token);
        });
      }
    });
    return chain;
  }

  // Chrome loads voices async
  if (supported()) {
    window.speechSynthesis.getVoices();
    if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = function () {
        pickVoice();
      };
    }
  }

  global.DictationSpeech = {
    supported: supported,
    setRate: setRate,
    setLang: setLang,
    getRate: getRate,
    getLang: getLang,
    speak: speak,
    speakOnce: speakOnce,
    speakRepeats: speakRepeats,
    speakPartB: speakPartB,
    chunkWords: chunkWords,
    stop: stop,
    pickVoice: pickVoice,
  };
})(typeof window !== "undefined" ? window : globalThis);
