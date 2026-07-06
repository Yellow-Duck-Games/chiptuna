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

    // amp lfo (tremolo, dips below full volume)
    if (s.ampLfoDepth > 0 && s.ampLfoRate > 0) {
      const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * s.ampLfoRate * t);
      amp *= 1 - s.ampLfoDepth * lfo;
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
