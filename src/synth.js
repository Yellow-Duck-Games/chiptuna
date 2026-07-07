"use strict";

// ---------------------------------------------------------------------------
// Waveforms (pico-8 style, 8 shapes, index 0..7)
// ---------------------------------------------------------------------------
const WAVE_NAMES = ["TRI", "TILT", "SAW", "SQR", "PULSE", "ORGAN", "NOISE", "PHASER"];

// phase p in [0,1)
function waveSample(idx, p, noise) {
  switch (idx) {
    case 0: // triangle
      return Math.abs(p * 4 - 2) - 1;
    case 1: { // tilted saw
      const t = 0.875;
      return (p < t ? p / t : (1 - p) / (1 - t)) * 2 - 1;
    }
    case 2: // saw
      return p * 2 - 1;
    case 3: // square
      return p < 0.5 ? 1 : -1;
    case 4: // pulse 25%
      return p < 0.25 ? 1 : -1;
    case 5: { // organ (tri + tri one octave up)
      const t1 = Math.abs(p * 4 - 2) - 1;
      const p2 = (p * 2) % 1;
      const t2 = Math.abs(p2 * 4 - 2) - 1;
      return t1 * 0.7 + t2 * 0.3;
    }
    case 6: // pitched noise (sample & hold, updated by the render loop)
      return noise.value;
    case 7: { // phaser: two detuned triangles
      const t1 = Math.abs(p * 4 - 2) - 1;
      const p2 = noise.phaserPhase;
      const t2 = Math.abs(p2 * 4 - 2) - 1;
      return (t1 + t2) * 0.5;
    }
    default:
      return 0;
  }
}

// note -> Hz, pico-8 style (0..63 note range with C0 = 65.4 Hz)
function noteToFreq(note) {
  return 65.40639 * Math.pow(2, note / 12);
}

// hold at `start` for `hold` sec, then move to `end` over `decay` sec
function holdDecayEnv(t, start, end, hold, decay) {
  if (t <= hold) return start;
  const k = Math.min(1, (t - hold) / decay);
  return start + (end - start) * k;
}

// deterministic PRNG so the noise waveform is reproducible from a seed
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Render the whole sfx into a Float32Array, sample by sample
// ---------------------------------------------------------------------------
function renderSfx(s, sr) {
  const dur = Math.max(0.02, s.ampAttack + s.ampHold + s.ampDecay);
  const n = Math.ceil(dur * sr);
  const data = new Float32Array(n);

  let phase = 0;
  const noise = { value: 0, prev: 0, next: 0, lastStep: -1, phaserPhase: 0 };
  const rand = mulberry32(s.noiseSeed === undefined ? 1 : s.noiseSeed);
  const volume = s.volume === undefined ? 1 : s.volume;

  // one-pole lowpass, mimics pico-8's soft top end (its output rolls off
  // well below the raw harmonics a naive square/saw would produce)
  let lp = 0;
  const lpAlpha = 1 - Math.exp((-2 * Math.PI * 4500) / sr);

  for (let i = 0; i < n; i++) {
    const t = i / sr;

    // --- amp envelope: attack -> hold -> decay ---
    let amp;
    if (t < s.ampAttack) {
      amp = t / s.ampAttack;
    } else if (t < s.ampAttack + s.ampHold) {
      amp = 1;
    } else {
      amp = 1 - (t - s.ampAttack - s.ampHold) / s.ampDecay;
    }
    amp = Math.max(0, amp);

    // amp lfo: a smooth tremolo at low depth, a hard on/off gate (with real
    // silent pauses, like an alarm) at high depth. depth drives both how far
    // it dips and how square the edges get, so a deep lfo reads as beeping
    // rather than a continuous wave.
    if (s.ampLfoDepth > 0 && s.ampLfoRate > 0) {
      const phase = 0.5 + 0.5 * Math.sin(2 * Math.PI * s.ampLfoRate * t); // 0..1
      const k = 1 + s.ampLfoDepth * 14; // edge steepness: soft when shallow, square when deep
      const gate = 1 / (1 + Math.exp(-k * (phase - 0.5))); // logistic-shaped tremolo
      // blend toward the hard gate as depth rises so shallow tremolos stay smooth
      const shaped = (1 - s.ampLfoDepth) * phase + s.ampLfoDepth * gate;
      amp *= 1 - s.ampLfoDepth * shaped;
    }

    // --- pitch envelope + vibrato ---
    let note = holdDecayEnv(t, s.pitchStart, s.pitchEnd, s.pitchHold, s.pitchDecay);
    if (s.pitchLfoDepth > 0 && s.pitchLfoRate > 0) {
      note += s.pitchLfoDepth * Math.sin(2 * Math.PI * s.pitchLfoRate * t);
    }
    const freq = noteToFreq(Math.max(0, note));

    // --- wave envelope + wave lfo, crossfade between adjacent shapes ---
    let wave = holdDecayEnv(t, s.waveStart, s.waveEnd, s.waveHold, s.waveDecay);
    if (s.waveLfoDepth > 0 && s.waveLfoRate > 0) {
      wave += s.waveLfoDepth * Math.sin(2 * Math.PI * s.waveLfoRate * t);
    }
    wave = Math.min(7, Math.max(0, wave));
    const w0 = Math.floor(wave);
    const w1 = Math.min(7, w0 + 1);
    const frac = wave - w0;

    // pitched noise: sample & hold stepped at 8x the oscillator frequency,
    // linearly interpolated between steps (pico-8's noise is dark/brownish,
    // not hissy white noise)
    const stepPos = t * freq * 8;
    const step = Math.floor(stepPos);
    if (step !== noise.lastStep) {
      noise.lastStep = step;
      noise.prev = noise.next;
      noise.next = rand() * 2 - 1;
    }
    noise.value = noise.prev + (noise.next - noise.prev) * (stepPos - step);

    let sample = waveSample(w0, phase, noise);
    if (frac > 0.0001) {
      sample = sample * (1 - frac) + waveSample(w1, phase, noise) * frac;
    }

    lp += lpAlpha * (sample - lp);
    data[i] = lp * amp * 0.5 * volume;

    phase += freq / sr;
    phase -= Math.floor(phase);
    noise.phaserPhase += (freq * 0.992) / sr; // slightly detuned second osc for phaser
    noise.phaserPhase -= Math.floor(noise.phaserPhase);
  }

  // tiny fade-out to avoid clicks
  const fade = Math.min(64, n);
  for (let i = 0; i < fade; i++) {
    data[n - 1 - i] *= i / fade;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Stereo reverb — Schroeder/Freeverb-style: parallel damped comb filters into
// series allpass filters, run once per channel with the right channel's delays
// nudged by a stereo offset so the two tails decorrelate (that's what widens
// the image). `reverb` (0..1) sets both the wet mix and the room size, so one
// knob goes from dry-mono to wide-and-spacious. Deterministic: it only depends
// on the (seeded) dry signal, so a seed still reproduces the sound exactly.
// ---------------------------------------------------------------------------

// tunings in samples at 44.1kHz (scaled to the actual sample rate below)
const COMB_TUNING = [1116, 1277, 1422, 1557];
const ALLPASS_TUNING = [556, 341];
const STEREO_SPREAD = 23;

function reverbChannel(dry, n, sr, offset, roomSize, damp, wet) {
  const scale = sr / 44100;
  const out = new Float32Array(n);

  const combs = COMB_TUNING.map((tune) => ({
    buf: new Float32Array(Math.max(1, Math.round((tune + offset) * scale))),
    idx: 0,
    store: 0,
  }));
  const allpasses = ALLPASS_TUNING.map((tune) => ({
    buf: new Float32Array(Math.max(1, Math.round((tune + offset) * scale))),
    idx: 0,
  }));

  for (let i = 0; i < n; i++) {
    const input = (i < dry.length ? dry[i] : 0) * 0.3; // feed gain keeps the tail tame
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.idx];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.idx] = input + c.store * roomSize;
      if (++c.idx >= c.buf.length) c.idx = 0;
      acc += y;
    }
    for (const a of allpasses) {
      const bufout = a.buf[a.idx];
      a.buf[a.idx] = acc + bufout * 0.5;
      if (++a.idx >= a.buf.length) a.idx = 0;
      acc = bufout - acc;
    }
    // soft clip so a big wet mix can't exceed the ±1 the audio buffer allows
    out[i] = Math.tanh((i < dry.length ? dry[i] : 0) + acc * wet);
  }
  return out;
}

function renderStereo(s, sr) {
  const dry = renderSfx(s, sr);
  const amt = s.reverb === undefined ? 0 : s.reverb;
  if (amt <= 0.0001) return { left: dry, right: dry }; // dry -> identical channels = mono

  const tail = Math.floor(sr * (0.15 + amt * 0.6)); // room for the tail to ring out
  const n = dry.length + tail;
  const roomSize = 0.7 + amt * 0.28; // 0.70..0.98
  const damp = 0.25;
  const wet = amt * 0.9;

  const left = reverbChannel(dry, n, sr, 0, roomSize, damp, wet);
  const right = reverbChannel(dry, n, sr, STEREO_SPREAD, roomSize, damp, wet);

  // gentle fade on the tail end to avoid a click when the buffer stops
  const fade = Math.min(256, n);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    left[n - 1 - i] *= g;
    right[n - 1 - i] *= g;
  }
  return { left, right };
}
