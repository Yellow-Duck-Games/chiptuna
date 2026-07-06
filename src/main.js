"use strict";

// ---------------------------------------------------------------------------
// Parameter definitions
// ---------------------------------------------------------------------------
const PARAMS = [
  // group, key,            label,            min, max, step, default, format
  ["amp",   "volume",       "volume",         0, 1,    0.01,  1.00, v => (v * 100).toFixed(0) + "%"],
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
];

const state = { noiseSeed: 1 };
const sliders = {};

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

    const val = document.createElement("span");
    val.className = "val";
    val.textContent = fmt(def);

    slider.addEventListener("input", () => {
      state[key] = parseFloat(slider.value);
      val.textContent = fmt(state[key]);
      updateSeedField();
    });

    sliders[key] = { slider, val, fmt, min, max };

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
  s.val.textContent = s.fmt(v);
}

// ---------------------------------------------------------------------------
// Seed — the full sound state as a shareable "chiptuna:" string.
// Payload bytes: version, each param in PARAMS order as a big-endian 16-bit
// value quantized across its min..max range, the 32-bit noise seed, and a
// checksum byte — base64url-encoded so truncated or mistyped seeds are
// rejected instead of loading garbage.
// ---------------------------------------------------------------------------
const SEED_VERSION = 1;
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
  if (!bytes || bytes.length !== SEED_BYTE_LEN) return false;
  if (bytes[0] !== SEED_VERSION) return false;
  if (bytes[bytes.length - 1] !== seedChecksum(bytes.slice(0, -1))) return false;
  PARAMS.forEach(([, key, , min, max], i) => {
    const q = (bytes[1 + i * 2] << 8) | bytes[2 + i * 2];
    setParam(key, min + (q / 0xffff) * (max - min));
  });
  const o = 1 + PARAMS.length * 2;
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

// pre-rename seeds: the same payload as chirp8: but hex in an [sfx] wrapper
const LEGACY_SEED_HEX_LEN = 2 + PARAMS.length * 4 + 8;

function decodeLegacySeed(h) {
  if (h.length !== LEGACY_SEED_HEX_LEN) return false;
  if (parseInt(h.slice(0, 2), 16) !== SEED_VERSION) return false;
  PARAMS.forEach(([, key, , min, max], i) => {
    const q = parseInt(h.slice(2 + i * 4, 6 + i * 4), 16);
    setParam(key, min + (q / 0xffff) * (max - min));
  });
  state.noiseSeed = parseInt(h.slice(2 + PARAMS.length * 4), 16) >>> 0;
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

function makeSource(ctx) {
  const data = renderSfx(state, SFX_SAMPLE_RATE);
  const buf = ctx.createBuffer(1, data.length, SFX_SAMPLE_RATE);
  buf.getChannelData(0).set(data);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return { src, data };
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
    restore.addEventListener("click", () => {
      if (decodeSeed(h.seed)) {
        historyIndex = i;
        updateSeedField();
        renderHistory();
        play();
      }
    });

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

function deleteHistory(i) {
  history.splice(i, 1);
  if (historyIndex === i) historyIndex = -1;      // current sound keeps playing, just unlisted
  else if (historyIndex > i) historyIndex--;
  saveHistory();
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
// Save OGG — records the buffer through MediaRecorder. Firefox produces real
// ogg/opus; Chrome doesn't support the ogg container, so it falls back to
// webm/opus (same codec) and the file is named accordingly.
// ---------------------------------------------------------------------------
function pickRecorderMime() {
  const candidates = [
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const m of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function saveOgg() {
  const mime = pickRecorderMime();
  if (!mime) {
    alert("This browser has no MediaRecorder support - cannot encode audio.");
    return;
  }
  const ctx = getCtx();
  const { src, data } = makeSource(ctx);
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  src.connect(ctx.destination); // hear it while it records

  const rec = new MediaRecorder(dest.stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  rec.onstop = () => {
    const ext = mime.startsWith("audio/ogg") ? "ogg"
              : mime.startsWith("audio/webm") ? "webm"
              : "m4a";
    const blob = new Blob(chunks, { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sfx-" + Date.now() + "." + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  rec.start();
  src.onended = () => setTimeout(() => rec.stop(), 100); // tail so the end isn't clipped
  src.start();
  drawScope(data);
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

function randomize() {
  // amp
  setParam("ampAttack", chance(0.7) ? rnd(0, 0.02) : rnd(0, 0.3));
  setParam("ampHold",   rnd(0, 0.3));
  setParam("ampDecay",  rnd(0.05, 0.8));
  if (chance(0.3)) {
    setParam("ampLfoRate",  rnd(2, 24));
    setParam("ampLfoDepth", rnd(0.2, 1));
  } else {
    setParam("ampLfoRate",  0);
    setParam("ampLfoDepth", 0);
  }

  // pitch
  const start = rnd(8, 55);
  setParam("pitchStart", start);
  setParam("pitchEnd",   chance(0.25) ? start : Math.min(63, Math.max(0, start + rnd(-30, 30))));
  setParam("pitchHold",  rnd(0, 0.25));
  setParam("pitchDecay", rnd(0.03, 0.7));
  if (chance(0.35)) {
    setParam("pitchLfoRate",  rnd(2, 20));
    setParam("pitchLfoDepth", rnd(0.3, 6));
  } else {
    setParam("pitchLfoRate",  0);
    setParam("pitchLfoDepth", 0);
  }

  // wave
  const wStart = chance(0.15) ? rnd(0, 7) : Math.floor(rnd(0, 8)); // usually a clean shape
  setParam("waveStart", wStart);
  setParam("waveEnd",   chance(0.6) ? wStart : Math.floor(rnd(0, 8)));
  setParam("waveHold",  rnd(0, 0.3));
  setParam("waveDecay", rnd(0.05, 0.6));
  if (chance(0.2)) {
    setParam("waveLfoRate",  rnd(1, 16));
    setParam("waveLfoDepth", rnd(0.2, 2));
  } else {
    setParam("waveLfoRate",  0);
    setParam("waveLfoDepth", 0);
  }

  // fresh noise character each roll; volume stays where the user set it
  state.noiseSeed = (Math.random() * 0x100000000) >>> 0;

  updateSeedField();
  play();
}

// nudge every parameter a little — keeps the sound's character but varies it
function mutate() {
  for (const [, key, , min, max] of PARAMS) {
    if (key === "volume") continue;
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
updateSeedField();
loadHistory();
renderHistory();
document.getElementById("btn-clear-history").addEventListener("click", clearHistory);
document.getElementById("btn-play").addEventListener("click", play);
document.getElementById("btn-random").addEventListener("click", randomize);
document.getElementById("btn-mutate").addEventListener("click", mutate);
document.getElementById("btn-save").addEventListener("click", saveOgg);

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
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); play(); }
  if (e.code === "KeyR")  { randomize(); }
  if (e.code === "KeyM")  { mutate(); }
});
