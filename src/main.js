"use strict";

// ---------------------------------------------------------------------------
// Parameter definitions
// ---------------------------------------------------------------------------
const PARAMS = [
  // group, key,            label,            min, max, step, default, format
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

const state = {};
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

  play();
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
buildUI();
document.getElementById("btn-play").addEventListener("click", play);
document.getElementById("btn-random").addEventListener("click", randomize);
document.getElementById("btn-save").addEventListener("click", saveOgg);
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); play(); }
  if (e.code === "KeyR")  { randomize(); }
});
