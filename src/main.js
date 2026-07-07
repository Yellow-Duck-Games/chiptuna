"use strict";

// ---------------------------------------------------------------------------
// Parameter definitions
// ---------------------------------------------------------------------------
const PARAMS = [
  // group, key,            label,            min, max, step, default, format
  ["amp",   "volume",       "volume",         0, 1,    0.01,  0.50, v => (v * 100).toFixed(0) + "%"],
  ["amp",   "ampAttack",    "attack",         0, 0.5,  0.001, 0.01, v => (v * 1000).toFixed(0) + "ms"],
  ["amp",   "ampHold",      "hold",           0, 1,    0.001, 0.10, v => (v * 1000).toFixed(0) + "ms"],
  ["amp",   "ampDecay",     "decay",          0.01, 2, 0.001, 0.30, v => (v * 1000).toFixed(0) + "ms"],
  ["amp",   "ampLfoRate",   "lfo rate",       0, 32,   0.1,   0,    v => v.toFixed(1) + "hz"],
  ["amp",   "ampLfoDepth",  "lfo depth",      0, 1,    0.01,  0,    v => (v * 100).toFixed(0) + "%"],

  ["pitch", "pitchStart",   "start",          0, 63,   0.5,   24,   v => v.toFixed(1)],
  ["pitch", "pitchEnd",     "end",            0, 63,   0.5,   24,   v => v.toFixed(1)],
  ["pitch", "pitchHold",    "hold",           0, 1,    0.001, 0.05, v => (v * 1000).toFixed(0) + "ms"],
  ["pitch", "pitchDecay",   "decay",          0.01, 2, 0.001, 0.20, v => (v * 1000).toFixed(0) + "ms"],
  ["pitch", "pitchLfoRate", "lfo rate",       0, 32,   0.1,   0,    v => v.toFixed(1) + "hz"],
  ["pitch", "pitchLfoDepth","lfo depth",      0, 12,   0.1,   0,    v => v.toFixed(1) + "st"],

  ["wave",  "waveStart",    "start",          0, 7,    0.05,  0,    v => WAVE_NAMES[Math.round(Math.min(7, Math.max(0, v)))] + " " + v.toFixed(1)],
  ["wave",  "waveEnd",      "end",            0, 7,    0.05,  0,    v => WAVE_NAMES[Math.round(Math.min(7, Math.max(0, v)))] + " " + v.toFixed(1)],
  ["wave",  "waveHold",     "hold",           0, 1,    0.001, 0.10, v => (v * 1000).toFixed(0) + "ms"],
  ["wave",  "waveDecay",    "decay",          0.01, 2, 0.001, 0.20, v => (v * 1000).toFixed(0) + "ms"],
  ["wave",  "waveLfoRate",  "lfo rate",       0, 32,   0.1,   0,    v => v.toFixed(1) + "hz"],
  ["wave",  "waveLfoDepth", "lfo depth",      0, 3.5,  0.05,  0,    v => v.toFixed(2)],

  // spatial: stereo reverb send. Kept last so older seeds (which lack it) stay
  // a valid prefix of the current layout and still decode.
  ["amp",   "reverb",       "reverb",         0, 1,    0.01,  0,    v => (v * 100).toFixed(0) + "%"],
];

const state = { noiseSeed: 1 };
const sliders = {};
const locked = {}; // key -> true when the value should survive Random

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function buildUI() {
  for (const [group, key, label, min, max, step, def, fmt] of PARAMS) {
    state[key] = def;

    const row = document.createElement("div");
    row.className = "param";

    const lab = document.createElement("label");
    lab.textContent = label;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = def;

    // editable value readout — type a number (in the units shown) to set it exactly
    const val = document.createElement("input");
    val.type = "text";
    val.className = "val";
    val.spellcheck = false;
    val.setAttribute("autocomplete", "off");
    val.title = "type a value (in the units shown) to set it exactly";
    val.value = fmt(def);

    // lock toggle — locked values are left untouched by Random
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "lock";
    lock.textContent = "🔓";
    lock.title = "lock this value when randomizing";
    lock.setAttribute("aria-pressed", "false");
    lock.addEventListener("click", () => {
      locked[key] = !locked[key];
      lock.textContent = locked[key] ? "🔒" : "🔓";
      lock.classList.toggle("on", locked[key]);
      lock.setAttribute("aria-pressed", String(!!locked[key]));
    });

    slider.addEventListener("input", () => {
      state[key] = parseFloat(slider.value);
      val.value = fmt(state[key]);
      updateSeedField();
    });

    // commit a typed value: pull the first number out of the field, convert it
    // from the displayed unit back to the raw range, then clamp + sync the slider.
    const commitVal = () => {
      const m = val.value.match(/-?\d*\.?\d+/);
      if (m) {
        let num = parseFloat(m[0]);
        const unit = fmt(0); // detect the formatter's display scaling
        if (unit.includes("ms")) num /= 1000;
        else if (unit.includes("%")) num /= 100;
        setParam(key, num); // clamps to min/max and updates slider, state + readout
        updateSeedField();
      }
      val.value = fmt(state[key]); // normalize the text (revert on bad input)
    };
    val.addEventListener("blur", commitVal);
    val.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); val.blur(); }
      else if (e.key === "Escape") { val.value = fmt(state[key]); val.blur(); }
    });
    val.addEventListener("focus", () => val.select());

    sliders[key] = { slider, val, fmt, min, max };

    row.appendChild(lock);
    row.appendChild(lab);
    row.appendChild(slider);
    row.appendChild(val);
    document.getElementById(group + "-params").appendChild(row);
  }
}

function setParam(key, value) {
  const s = sliders[key];
  const v = Math.min(s.max, Math.max(s.min, value));
  state[key] = v;
  s.slider.value = v;
  s.val.value = s.fmt(v);
}

// ---------------------------------------------------------------------------
// Seed — the full sound state as a shareable "chiptuna:" string.
// Payload bytes: version, each param in PARAMS order as a big-endian 16-bit
// value quantized across its min..max range, the 32-bit noise seed, and a
// checksum byte — base64url-encoded so truncated or mistyped seeds are
// rejected instead of loading garbage.
// ---------------------------------------------------------------------------
const SEED_VERSION = 2; // v1 had no reverb param; v2 seeds are one param longer
const SEED_PREFIX = "chiptuna:";
const SEED_BYTE_LEN = 1 + PARAMS.length * 2 + 4 + 1;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToB64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function b64ToBytes(str) {
  const bytes = [];
  let acc = 0, nbits = 0;
  for (const ch of str) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    nbits += 6;
    if (nbits >= 8) {
      nbits -= 8;
      bytes.push((acc >> nbits) & 255);
    }
  }
  return bytes;
}

function seedChecksum(bytes) {
  let s = 0;
  for (const b of bytes) s = (s * 31 + b) & 255;
  return s;
}

function encodeSeed() {
  const bytes = [SEED_VERSION];
  for (const [, key, , min, max] of PARAMS) {
    const q = Math.min(0xffff, Math.max(0,
      Math.round(((state[key] - min) / (max - min)) * 0xffff)));
    bytes.push(q >> 8, q & 255);
  }
  const ns = state.noiseSeed >>> 0;
  bytes.push((ns >>> 24) & 255, (ns >>> 16) & 255, (ns >>> 8) & 255, ns & 255);
  bytes.push(seedChecksum(bytes));
  return SEED_PREFIX + bytesToB64(bytes);
}

function decodeNativeSeed(text) {
  const bytes = b64ToBytes(text.slice(text.indexOf(":") + 1));
  if (!bytes || bytes.length < 8) return false;
  if (bytes[bytes.length - 1] !== seedChecksum(bytes.slice(0, -1))) return false;
  return applySeedBytes(bytes);
}

// Shared by the native and hex decoders. The number of encoded params is
// derived from the length (payload = version + 2*nParams + 4 noise + checksum),
// so older seeds with fewer params still load — any param they omit keeps its
// current default (e.g. reverb on a pre-v2 seed).
function applySeedBytes(bytes) {
  if (bytes[0] < 1 || bytes[0] > SEED_VERSION) return false;
  const nParams = (bytes.length - 6) / 2;
  if (!Number.isInteger(nParams) || nParams < 1 || nParams > PARAMS.length) return false;
  PARAMS.forEach(([, key, , min, max, , def], i) => {
    if (i < nParams) {
      const q = (bytes[1 + i * 2] << 8) | bytes[2 + i * 2];
      setParam(key, min + (q / 0xffff) * (max - min));
    } else {
      setParam(key, def);
    }
  });
  const o = 1 + nParams * 2;
  state.noiseSeed =
    ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return true;
}

function decodeSeed(text) {
  const t = text.trim();
  // "chirp8:" is this tool's pre-rename prefix; same payload either way
  if (/^(?:chiptuna|chirp8):/i.test(t)) return decodeNativeSeed(t);
  if (/^sfxg/i.test(t)) return decodeSfxg(t);
  const m = t.match(/^(?:\[sfx\])?([0-9a-fA-F]+)(?:\[\/sfx\])?$/);
  if (!m) return false;
  const h = m[1].toLowerCase();
  return decodeLegacySeed(h) || decodePico8Sfx(h);
}

// pre-rename seeds: the same payload as chiptuna: but hex in an [sfx] wrapper,
// and no checksum byte. Layout: version(2 hex) + 4 hex/param + noise(8 hex).
// Param count is derived from the length so seeds from any earlier version
// still load, with any newer param defaulting.
function decodeLegacySeed(h) {
  const nParams = (h.length - 10) / 4;
  if (!Number.isInteger(nParams) || nParams < 1 || nParams > PARAMS.length) return false;
  const ver = parseInt(h.slice(0, 2), 16);
  if (ver < 1 || ver > SEED_VERSION) return false;
  PARAMS.forEach(([, key, , min, max, , def], i) => {
    if (i < nParams) {
      const q = parseInt(h.slice(2 + i * 4, 6 + i * 4), 16);
      setParam(key, min + (q / 0xffff) * (max - min));
    } else {
      setParam(key, def);
    }
  });
  state.noiseSeed = parseInt(h.slice(2 + nParams * 4), 16) >>> 0;
  return true;
}

// ---------------------------------------------------------------------------
// PICO-8 clipboard import — a genuine [sfx] string copied from PICO-8:
// 3 header bytes, then 68 bytes per sfx (32 notes of 2 bytes little-endian —
// pitch in bits 0-5, waveform 6-8, volume 9-11 — followed by editor mode,
// speed, loop start, loop end). The first sfx is mapped approximately onto
// the synth's envelope parameters.
// ---------------------------------------------------------------------------

// start value, how long it stays there, and how long the values keep moving
function contour(vals, noteDur) {
  let holdEnd = 0;
  while (holdEnd + 1 < vals.length && vals[holdEnd + 1] === vals[0]) holdEnd++;
  let lastChange = holdEnd;
  for (let i = holdEnd + 1; i < vals.length; i++) {
    if (vals[i] !== vals[i - 1]) lastChange = i;
  }
  return {
    start: vals[0],
    end: vals[vals.length - 1],
    hold: holdEnd * noteDur,
    decay: Math.max(0.01, (lastChange - holdEnd) * noteDur),
  };
}

function decodePico8Sfx(h) {
  if (h.length < 142 || (h.length - 6) % 136 !== 0) return false;

  const notes = [];
  for (let i = 0; i < 32; i++) {
    const lo = parseInt(h.slice(6 + i * 4, 8 + i * 4), 16);
    const hi = parseInt(h.slice(8 + i * 4, 10 + i * 4), 16);
    const v = lo | (hi << 8);
    notes.push({ pitch: v & 63, wave: (v >> 6) & 7, vol: (v >> 9) & 7 });
  }
  const speed = Math.max(1, parseInt(h.slice(136, 138), 16));
  return importP8Notes(notes, speed);
}

function importP8Notes(notes, speed) {
  const noteDur = (speed * 183) / 22050; // pico-8 note length in seconds

  // audible span = first to last note with volume > 0
  let i0 = -1, i1 = -1;
  notes.forEach((n, i) => { if (n.vol > 0) { if (i0 < 0) i0 = i; i1 = i; } });
  if (i0 < 0) return false;
  const act = notes.slice(i0, i1 + 1);

  // amp: rise to peak volume = attack, stay near peak = hold, rest = decay
  const vols = act.map(n => n.vol);
  const peak = Math.max(...vols);
  const firstPeak = vols.indexOf(peak);
  let lastPeak = firstPeak;
  while (lastPeak + 1 < vols.length && vols[lastPeak + 1] >= peak - 1) lastPeak++;
  setParam("volume",    peak / 7);
  setParam("ampAttack", firstPeak * noteDur);
  setParam("ampHold",   (lastPeak - firstPeak + 1) * noteDur);
  setParam("ampDecay",  Math.max(0.01, (vols.length - 1 - lastPeak) * noteDur));

  const pc = contour(act.map(n => n.pitch), noteDur);
  setParam("pitchStart", pc.start);
  setParam("pitchEnd",   pc.end);
  setParam("pitchHold",  pc.hold);
  setParam("pitchDecay", pc.decay);

  const wc = contour(act.map(n => n.wave), noteDur);
  setParam("waveStart", wc.start);
  setParam("waveEnd",   wc.end);
  setParam("waveHold",  wc.hold);
  setParam("waveDecay", wc.decay);

  for (const key of ["ampLfoRate", "ampLfoDepth", "pitchLfoRate",
                     "pitchLfoDepth", "waveLfoRate", "waveLfoDepth"]) {
    setParam(key, 0);
  }
  return true;
}

// ---------------------------------------------------------------------------
// sfxp native format import — "sfxg" + 17 comma-separated PICO-8 fixed-point
// parameter values (0..1) + a speed (1-3). The original sfxp cart renders
// these into 32 pico-8 notes; the loop below is a port of that renderer, so
// the resulting notes are what sfxp itself would put in a cartridge. They
// then go through the same approximate import as a pasted [sfx] string.
// ---------------------------------------------------------------------------
function p8num(s) {
  const m = s.trim().match(/^0x([0-9a-f]{1,4})(?:\.([0-9a-f]{1,4}))?$/i);
  if (m) return parseInt(m[1], 16) + (m[2] ? parseInt(m[2].padEnd(4, "0"), 16) / 65536 : 0);
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function decodeSfxg(text) {
  const parts = text.trim().slice(4).split(",");
  if (parts.length !== 18) return false;
  const n = parts.map(p8num);
  if (n.some(v => v === null)) return false;
  const p = n.slice(0, 17); // amp a/h/d + lfo, pitch s/e/h/d + lfo, wave s/e/h/d + lfo
  const speed = Math.min(255, Math.max(1, Math.floor(n[17])));

  const p8sin = t => -Math.sin(2 * Math.PI * t); // pico-8's sin is inverted
  const clamp999 = v => Math.min(0.999, Math.max(0, v));
  const WAVE_MAP = [0, 7, 5, 1, 3, 2, 4, 6]; // sfxp slider order -> pico-8 waveform

  const notes = [];
  const attackEnd = Math.floor(p[0] * 31);
  let x = 0, v = 1, y = 1;
  for (let d = 0; d < 32; d++) {
    if (d <= attackEnd) x = (d + 5) / (attackEnd + 5);
    if (d > (p[0] + p[1] * (1 - p[0])) * 31) x *= 1 - p[2] * p[2];
    const g = clamp999(x * (1 - p8sin(d * Math.pow(p[3], 3) / 3) * Math.pow(p[4], 1.5)));
    if (d > p[7] * 31) v *= 1 - p[8] * p[8];
    const k = clamp999(v * (p[5] - p[6] + p8sin(d * Math.pow(p[9], 3) / 3) * Math.pow(p[10], 1.5)) + p[6]);
    if (d > p[13] * 31) y *= 1 - p[14] * p[14];
    const b = clamp999(y * (p[11] - p[12] + p8sin(d * Math.pow(p[15], 3) / 3) * Math.pow(p[16], 1.5)) + p[12]);
    notes.push({ pitch: Math.floor(k * 64), wave: WAVE_MAP[Math.floor(b * 8)], vol: Math.floor(g * 8) });
  }
  return importP8Notes(notes, speed);
}

function updateSeedField() {
  const input = document.getElementById("seed");
  input.value = encodeSeed();
  input.classList.remove("bad");
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
// pico-8 mixes at 22050 Hz — rendering at the same rate (and letting the
// browser resample on output) is a big part of the lo-fi character
const SFX_SAMPLE_RATE = 22050;

let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Channel count is a user choice (see the "ch" selector): "auto" keeps the
// natural behavior — mono while dry, stereo once reverb widens the image —
// "mono" downmixes a wide render, "stereo" always yields two channels.
// It's an output setting, persisted on its own, not part of the seed.
let channelMode = "auto";

function renderChannels() {
  let { left, right } = renderStereo(state, SFX_SAMPLE_RATE);
  if (channelMode === "mono" && left !== right) {
    const m = new Float32Array(left.length);
    for (let i = 0; i < m.length; i++) m[i] = (left[i] + right[i]) * 0.5;
    left = right = m;
  }
  const mono = left === right && channelMode !== "stereo";
  return { left, right, channels: mono ? [left] : [left, right] };
}

function makeSource(ctx) {
  const { left, right } = renderChannels();
  const buf = ctx.createBuffer(2, left.length, SFX_SAMPLE_RATE);
  buf.getChannelData(0).set(left);
  buf.getChannelData(1).set(right);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return { src, data: left }; // scope draws the left channel
}

function play() {
  const ctx = getCtx();
  const { src, data } = makeSource(ctx);
  src.connect(ctx.destination);
  src.start();
  drawScope(data);
  pushHistory();
}

// ---------------------------------------------------------------------------
// History — every sound that gets played is kept (deduped, newest first);
// clicking an entry restores and replays it. Persisted in localStorage.
// ---------------------------------------------------------------------------
const HISTORY_MAX = 20;
let history = [];       // [{ id, seed, label }]
let historyIndex = -1;  // which entry matches the current sound
let historyCount = 0;   // total sounds ever recorded, for stable #numbers

function soundLabel() {
  const dur = state.ampAttack + state.ampHold + state.ampDecay;
  const wave = WAVE_NAMES[Math.round(Math.min(7, Math.max(0, state.waveStart)))];
  return wave + " " + state.pitchStart.toFixed(0) + "→" + state.pitchEnd.toFixed(0)
       + " " + (dur * 1000).toFixed(0) + "ms";
}

function pushHistory() {
  const seed = encodeSeed();
  if (history[historyIndex] && history[historyIndex].seed === seed) return; // replay
  if (history[0] && history[0].seed === seed) {
    historyIndex = 0;
    renderHistory();
    return;
  }
  history.unshift({ id: ++historyCount, seed, label: soundLabel() });
  if (history.length > HISTORY_MAX) history.pop();
  historyIndex = 0;
  saveHistory();
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("history-list");
  list.textContent = "";
  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "( nothing yet — hit random )";
    list.appendChild(empty);
    return;
  }
  history.forEach((h, i) => {
    const row = document.createElement("div");
    row.className = "history-entry" + (i === historyIndex ? " current" : "");

    const restore = document.createElement("button");
    restore.className = "history-restore";
    restore.textContent = "#" + h.id + " " + h.label;
    restore.addEventListener("click", () => selectHistoryEntry(i, true));

    const del = document.createElement("button");
    del.className = "history-delete";
    del.textContent = "×";
    del.title = "delete";
    del.addEventListener("click", () => deleteHistory(i));

    row.appendChild(del);
    row.appendChild(restore);
    list.appendChild(row);
  });
}

// Load a history entry into the sliders as the current sound and highlight it.
function selectHistoryEntry(i, andPlay) {
  const h = history[i];
  if (!h || !decodeSeed(h.seed)) return;
  historyIndex = i;
  updateSeedField();
  renderHistory();
  if (andPlay) play();
}

function deleteHistory(i) {
  history.splice(i, 1);
  saveHistory();
  // deleting never changes the current sound: the highlight follows its entry,
  // and vanishes if that entry is the one deleted
  if (i === historyIndex) historyIndex = -1;
  else if (i < historyIndex) historyIndex--;
  renderHistory();
}

function saveHistory() {
  try {
    localStorage.setItem("chiptuna-history",
      JSON.stringify({ entries: history, count: historyCount }));
  } catch (e) { /* private mode / file:// quirks — history just won't persist */ }
}

function loadHistory() {
  try {
    const d = JSON.parse(localStorage.getItem("chiptuna-history"));
    if (d && Array.isArray(d.entries)) {
      history = d.entries.filter(h => h && typeof h.seed === "string" && h.label).slice(0, HISTORY_MAX);
      historyCount = d.count || history.length;
    }
  } catch (e) { /* missing or corrupt — start fresh */ }
}

function clearHistory() {
  history = [];
  historyIndex = -1;
  saveHistory();
  renderHistory();
}

// ---------------------------------------------------------------------------
// Save OGG — encodes the rendered samples to a real Ogg Vorbis file offline
// (no MediaRecorder, so it's the same in every browser). The encoder is the
// vendored wasm-media-encoders, loaded once lazily on the first export. Vorbis
// is used because it accepts the synth's native 22050 Hz rate directly (Opus
// only allows 8/12/16/24/48 kHz).
// ---------------------------------------------------------------------------
let oggEncoderPromise = null;
function getOggEncoder() {
  if (!oggEncoderPromise) {
    oggEncoderPromise = (async () => {
      if (!window.WasmMediaEncoder) throw new Error("encoder library not loaded");
      if (!window.OGG_WASM_B64) throw new Error("embedded wasm not loaded");
      // decode the embedded base64 to bytes — no fetch, so it works from file://
      const bin = atob(window.OGG_WASM_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return WasmMediaEncoder.createEncoder("audio/ogg", bytes);
    })();
  }
  return oggEncoderPromise;
}

async function saveOgg() {
  const btn = document.getElementById("btn-save");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "encoding…";
  try {
    const { left, channels } = renderChannels();

    // play it back so the export gives audible feedback, like it used to
    const ctx = getCtx();
    const buf = ctx.createBuffer(channels.length, left.length, SFX_SAMPLE_RATE);
    channels.forEach((c, i) => buf.getChannelData(i).set(c));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    drawScope(left);

    const enc = await getOggEncoder();
    enc.configure({ sampleRate: SFX_SAMPLE_RATE, channels: channels.length, vbrQuality: 5 });
    // encode() returns a view into wasm memory that gets reused, so copy it
    const parts = [enc.encode(channels).slice(), enc.finalize().slice()];

    const blob = new Blob(parts, { type: "audio/ogg" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sfx-" + Date.now() + ".ogg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    alert("Couldn't encode OGG: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// ---------------------------------------------------------------------------
// Oscilloscope preview of the rendered buffer
// ---------------------------------------------------------------------------
function drawScope(data) {
  const canvas = document.getElementById("scope");
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  g.fillStyle = "#000000";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#00e436";
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x < W; x++) {
    const i = Math.floor((x / W) * data.length);
    const y = H / 2 - data[i] * (H / 2 - 4);
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

// ---------------------------------------------------------------------------
// Randomizer — biased toward classic game-sfx shapes
// ---------------------------------------------------------------------------
function rnd(min, max) { return min + Math.random() * (max - min); }
function chance(p) { return Math.random() < p; }

// like setParam, but leaves locked values untouched so Random keeps them
function randSet(key, value) {
  if (!locked[key]) setParam(key, value);
}

function randomize() {
  // amp
  randSet("ampAttack", chance(0.7) ? rnd(0, 0.02) : rnd(0, 0.3));
  randSet("ampHold",   rnd(0, 0.3));
  randSet("ampDecay",  rnd(0.05, 0.8));
  if (chance(0.3)) {
    randSet("ampLfoRate",  rnd(2, 24));
    randSet("ampLfoDepth", rnd(0.2, 1));
  } else {
    randSet("ampLfoRate",  0);
    randSet("ampLfoDepth", 0);
  }

  // pitch — a locked start still anchors the relative end
  const start = locked.pitchStart ? state.pitchStart : rnd(8, 55);
  randSet("pitchStart", start);
  randSet("pitchEnd",   chance(0.25) ? start : Math.min(63, Math.max(0, start + rnd(-30, 30))));
  randSet("pitchHold",  rnd(0, 0.25));
  randSet("pitchDecay", rnd(0.03, 0.7));
  if (chance(0.35)) {
    randSet("pitchLfoRate",  rnd(2, 20));
    randSet("pitchLfoDepth", rnd(0.3, 6));
  } else {
    randSet("pitchLfoRate",  0);
    randSet("pitchLfoDepth", 0);
  }

  // wave
  const wStart = locked.waveStart
    ? state.waveStart
    : (chance(0.15) ? rnd(0, 7) : Math.floor(rnd(0, 8))); // usually a clean shape
  randSet("waveStart", wStart);
  randSet("waveEnd",   chance(0.6) ? wStart : Math.floor(rnd(0, 8)));
  randSet("waveHold",  rnd(0, 0.3));
  randSet("waveDecay", rnd(0.05, 0.6));
  if (chance(0.2)) {
    randSet("waveLfoRate",  rnd(1, 16));
    randSet("waveLfoDepth", rnd(0.2, 2));
  } else {
    randSet("waveLfoRate",  0);
    randSet("waveLfoDepth", 0);
  }

  // some rolls get a splash of stereo reverb
  randSet("reverb", chance(0.35) ? rnd(0.15, 0.7) : 0);

  // fresh noise character each roll; volume stays where the user set it
  state.noiseSeed = (Math.random() * 0x100000000) >>> 0;

  updateSeedField();
  play();
}

// ---------------------------------------------------------------------------
// Presets — each rolls a fresh random sound within a category's character.
// They set every sound param (so nothing stale bleeds in) via randSet, so
// locked values are still honored, then get a fresh noise seed and play.
// ---------------------------------------------------------------------------
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clampNote(n) { return Math.min(63, Math.max(0, n)); }

// neutral starting point that every preset overrides as needed
function presetBase() {
  return {
    ampAttack: 0, ampHold: 0, ampDecay: 0.3, ampLfoRate: 0, ampLfoDepth: 0,
    pitchStart: 30, pitchEnd: 30, pitchHold: 0.03, pitchDecay: 0.2, pitchLfoRate: 0, pitchLfoDepth: 0,
    waveStart: 3, waveEnd: 3, waveHold: 0, waveDecay: 0.2, waveLfoRate: 0, waveLfoDepth: 0,
    reverb: 0,
  };
}

const PRESETS = {
  // bright short up-blip (coin/pickup)
  pickup() {
    const p = presetBase(), base = rnd(33, 46), w = pick([0, 3, 4]);
    p.ampHold = rnd(0, 0.05); p.ampDecay = rnd(0.12, 0.3);
    p.pitchStart = base; p.pitchHold = rnd(0.02, 0.07);
    p.pitchEnd = clampNote(base + rnd(6, 14)); p.pitchDecay = rnd(0.02, 0.08);
    p.waveStart = w; p.waveEnd = w;
    p.reverb = chance(0.3) ? rnd(0.1, 0.3) : 0;
    return p;
  },
  // high pitch sliding down fast (laser/shoot)
  shoot() {
    const p = presetBase(), base = rnd(44, 58), w = pick([2, 3, 6]);
    p.ampHold = rnd(0, 0.03); p.ampDecay = rnd(0.1, 0.3);
    p.pitchStart = base; p.pitchHold = rnd(0, 0.03);
    p.pitchEnd = clampNote(base - rnd(18, 40)); p.pitchDecay = rnd(0.05, 0.18);
    p.waveStart = w; p.waveEnd = chance(0.4) ? 6 : w;
    return p;
  },
  // noise burst, low, long decay, boomy (explosion)
  explosion() {
    const p = presetBase(), base = rnd(14, 30);
    p.ampHold = rnd(0, 0.05); p.ampDecay = rnd(0.4, 1.1);
    if (chance(0.5)) { p.ampLfoRate = rnd(8, 24); p.ampLfoDepth = rnd(0.2, 0.5); }
    p.pitchStart = base; p.pitchHold = rnd(0, 0.05);
    p.pitchEnd = clampNote(base - rnd(6, 18)); p.pitchDecay = rnd(0.2, 0.6);
    p.waveStart = 6; p.waveEnd = 6;
    p.reverb = rnd(0.2, 0.5);
    return p;
  },
  // rising, warbly, cheerful (powerup)
  powerup() {
    const p = presetBase(), base = rnd(24, 36), w = pick([0, 3, 5]);
    p.ampAttack = rnd(0, 0.02); p.ampHold = rnd(0, 0.1); p.ampDecay = rnd(0.3, 0.7);
    p.pitchStart = base; p.pitchHold = rnd(0, 0.05);
    p.pitchEnd = clampNote(base + rnd(10, 24)); p.pitchDecay = rnd(0.2, 0.6);
    if (chance(0.6)) { p.pitchLfoRate = rnd(6, 16); p.pitchLfoDepth = rnd(0.5, 3); }
    p.waveStart = w; p.waveEnd = w;
    p.reverb = chance(0.4) ? rnd(0.1, 0.4) : 0;
    return p;
  },
  // short, harsh, noisy, downward (hit/hurt)
  hit() {
    const p = presetBase(), base = rnd(20, 40), w = pick([2, 3, 6]);
    p.ampDecay = rnd(0.08, 0.22);
    p.pitchStart = base; p.pitchEnd = clampNote(base - rnd(8, 20)); p.pitchDecay = rnd(0.03, 0.1);
    p.waveStart = w; p.waveEnd = chance(0.5) ? 6 : w;
    return p;
  },
  // upward slide, medium (jump)
  jump() {
    const p = presetBase(), base = rnd(28, 40), w = pick([0, 3, 4]);
    p.ampHold = rnd(0, 0.05); p.ampDecay = rnd(0.15, 0.35);
    p.pitchStart = base; p.pitchHold = rnd(0, 0.04);
    p.pitchEnd = clampNote(base + rnd(8, 20)); p.pitchDecay = rnd(0.08, 0.2);
    p.waveStart = w; p.waveEnd = w;
    return p;
  },
  // swirly warble with a wide sweep and wash of reverb (teleport/portal)
  portal() {
    const p = presetBase(), base = rnd(22, 38), w = pick([3, 4, 5]);
    p.ampAttack = rnd(0.02, 0.1); p.ampHold = rnd(0.05, 0.2); p.ampDecay = rnd(0.4, 0.9);
    if (chance(0.4)) { p.ampLfoRate = rnd(4, 12); p.ampLfoDepth = rnd(0.2, 0.5); }
    p.pitchStart = base; p.pitchHold = rnd(0, 0.1);
    p.pitchEnd = clampNote(base + rnd(-16, 20)); p.pitchDecay = rnd(0.3, 0.8);
    p.pitchLfoRate = rnd(4, 14); p.pitchLfoDepth = rnd(2, 6);
    p.waveStart = w; p.waveEnd = chance(0.4) ? pick([3, 4, 5]) : w;
    if (chance(0.5)) { p.waveHold = rnd(0, 0.2); p.waveDecay = rnd(0.2, 0.5); }
    p.reverb = rnd(0.3, 0.7);
    return p;
  },
  // pulsing alarm tone, harsh and insistent (warning/alert)
  warning() {
    const p = presetBase(), base = rnd(30, 44), w = pick([2, 3, 4]);
    p.ampHold = rnd(0.3, 0.6); p.ampDecay = rnd(0.4, 0.8); // sustain long enough for several beeps
    p.ampLfoRate = rnd(2.5, 6); p.ampLfoDepth = rnd(0.9, 1); // slow, deep gate: beeps with silent pauses
    p.pitchStart = base; p.pitchEnd = base;
    p.pitchHold = rnd(0.1, 0.3); p.pitchDecay = rnd(0.1, 0.3);
    if (chance(0.6)) { p.pitchLfoRate = rnd(2, 7); p.pitchLfoDepth = rnd(2, 5); } // two-tone siren wobble
    p.waveStart = w; p.waveEnd = w;
    return p;
  },
  // anything goes as long as it's noise-based — static, zaps, whooshes,
  // rumbles; wide pitch range because pitched noise changes character a lot
  noise() {
    const p = presetBase(), base = rnd(10, 55);
    p.ampAttack = chance(0.3) ? rnd(0, 0.15) : 0;
    p.ampHold = rnd(0, 0.2); p.ampDecay = rnd(0.05, 0.8);
    if (chance(0.35)) { p.ampLfoRate = rnd(3, 24); p.ampLfoDepth = rnd(0.3, 1); }
    p.pitchStart = base; p.pitchHold = rnd(0, 0.15);
    p.pitchEnd = chance(0.3) ? base : clampNote(base + rnd(-25, 25));
    p.pitchDecay = rnd(0.05, 0.5);
    if (chance(0.3)) { p.pitchLfoRate = rnd(2, 16); p.pitchLfoDepth = rnd(1, 6); }
    p.waveStart = 6; p.waveEnd = 6;
    if (chance(0.25)) {
      // tonal attack that dissolves into noise
      p.waveStart = pick([2, 3, 4, 7]); p.waveDecay = rnd(0.05, 0.2);
    } else if (chance(0.2)) {
      // noise that resolves into a tone
      p.waveEnd = pick([0, 5, 7]); p.waveHold = rnd(0, 0.1); p.waveDecay = rnd(0.1, 0.4);
    }
    p.reverb = chance(0.3) ? rnd(0.1, 0.5) : 0;
    return p;
  },
  // very short clean blip (menu select)
  select() {
    const p = presetBase(), base = rnd(36, 50), w = pick([0, 3, 4]);
    p.ampHold = rnd(0, 0.02); p.ampDecay = rnd(0.04, 0.12);
    p.pitchStart = base; p.pitchHold = rnd(0, 0.02);
    p.pitchEnd = chance(0.5) ? base : clampNote(base + rnd(2, 8)); p.pitchDecay = rnd(0.02, 0.06);
    p.waveStart = w; p.waveEnd = w;
    return p;
  },
};
const PRESET_ORDER = ["noise", "pickup", "shoot", "explosion", "powerup", "hit", "jump", "portal", "warning", "select"];

function runPreset(name) {
  const params = PRESETS[name]();
  for (const k in params) randSet(k, params[k]);
  state.noiseSeed = (Math.random() * 0x100000000) >>> 0;
  updateSeedField();
  play();
}

function buildPresets() {
  const container = document.getElementById("presets");
  for (const name of PRESET_ORDER) {
    const b = document.createElement("button");
    b.className = "preset";
    b.textContent = name;
    b.addEventListener("click", () => runPreset(name));
    container.appendChild(b);
  }
}

// nudge every parameter a little — keeps the sound's character but varies it
function mutate() {
  for (const [, key, , min, max] of PARAMS) {
    if (key === "volume" || locked[key]) continue;
    setParam(key, state[key] + (Math.random() * 2 - 1) * (max - min) * 0.08);
  }
  if (chance(0.3)) state.noiseSeed = (Math.random() * 0x100000000) >>> 0;
  updateSeedField();
  play();
}

// ---------------------------------------------------------------------------
// Pixel-art tuna mascot — sprite map rendered as ascii blocks, two per pixel
// so cells come out square in monospace
// ---------------------------------------------------------------------------
const TUNA_COLORS = {
  D: "#1d2b53", // outline / back
  B: "#29adff", // body
  S: "#c2c3c7", // flank
  W: "#fff1e8", // belly + eye
  Y: "#ffec27", // fins + finlets
  K: "#000000", // pupil
};

const TUNA = [
  ".........Y....................",
  "........YYY...................",
  ".....DDDYYYYDDYDYDD...........",
  "...DDBBBBBBBBBBBBBBDD....DD...",
  "..DBBWKBBBBBBBBBBBBBDD..DBD...",
  ".DBBBBBBBBBBBBBBBBBBBDDDBBD...",
  ".DBSSSSSDSSSSSSSSSSSBBBBBBD...",
  "..DSSSSSDDSSSSSSSSSSDDDDBBD...",
  "...DWSSSSDSSSSSSSSDD...DBD....",
  ".....DDWSSSSSSSDD..Y.Y..DD....",
  ".......DDWWWDD....Y.Y.........",
  ".........DD...................",
];

function drawTuna() {
  let html = "";
  for (const row of TUNA) {
    for (let i = 0; i < row.length; ) {
      let j = i;
      while (j < row.length && row[j] === row[i]) j++;
      const cells = "██".repeat(j - i);
      html += row[i] === "."
        ? "  ".repeat(j - i)
        : '<span style="color:' + TUNA_COLORS[row[i]] + '">' + cells + "</span>";
      i = j;
    }
    html += "\n";
  }
  document.getElementById("tuna").innerHTML = html;
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
drawTuna();
buildUI();
buildPresets();
updateSeedField();
loadHistory();
renderHistory();
document.getElementById("btn-clear-history").addEventListener("click", clearHistory);
document.getElementById("btn-play").addEventListener("click", play);
document.getElementById("btn-random").addEventListener("click", randomize);
document.getElementById("btn-mutate").addEventListener("click", mutate);
document.getElementById("btn-save").addEventListener("click", saveOgg);

const channelsSel = document.getElementById("channels");
channelsSel.addEventListener("change", () => {
  channelMode = channelsSel.value;
  try { localStorage.setItem("chiptuna-channels", channelMode); } catch (e) {}
});
try {
  const savedMode = localStorage.getItem("chiptuna-channels");
  if (["auto", "mono", "stereo"].includes(savedMode)) {
    channelMode = savedMode;
    channelsSel.value = savedMode;
  }
} catch (e) { /* private mode — setting just won't persist */ }

const seedInput = document.getElementById("seed");
// apply the moment a full valid seed lands in the field (paste or typing)
seedInput.addEventListener("input", () => {
  seedInput.classList.remove("bad");
  if (decodeSeed(seedInput.value)) {
    updateSeedField(); // normalize to canonical form
    seedInput.blur();  // so space = play works right away
    play();
  }
});
// only flag invalid on commit (enter / focus loss), not on every keystroke
seedInput.addEventListener("change", () => {
  if (!decodeSeed(seedInput.value)) seedInput.classList.add("bad");
});
document.getElementById("btn-copy-seed").addEventListener("click", () => {
  navigator.clipboard.writeText(seedInput.value);
});
document.addEventListener("keydown", (e) => {
  // Only text-entry fields (the seed box) should swallow shortcut keys.
  // Range sliders and buttons keep focus after you tweak/click them, but
  // Space must still play — so don't bail for those.
  const t = e.target;
  const typing = (t.tagName === "INPUT" && t.type === "text") ||
                 t.tagName === "TEXTAREA" || t.isContentEditable;
  if (typing) return;
  if (e.code === "Space") { e.preventDefault(); play(); }
  if (e.code === "KeyR")  { randomize(); }
  if (e.code === "KeyM")  { mutate(); }
});
