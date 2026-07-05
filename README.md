# pico sfxp reimagined

A PICO-8 style random SFX generator. Pure vanilla JS + Web Audio, no dependencies, no build step.

## Run

Open `index.html` directly in a browser, or:

```sh
npm start   # serves the folder via `npx serve`
```

## Controls

- **Random** (`r`) — roll a new sound, biased toward classic game-sfx shapes
- **Play** (`space`) — play the current parameters
- **Save OGG** — export the sound (ogg/opus in Firefox; Chrome doesn't support the ogg container, so it saves webm/opus)

## Parameters

Three sections, each with its own envelope (hold at start value, then slide to end value over decay) and LFO:

- **AMP** — attack / hold / decay volume envelope + tremolo LFO. Total sound length = attack + hold + decay.
- **PITCH** — start/end in PICO-8 note units (0–63, C0 ≈ 65.4 Hz) + vibrato LFO in semitones.
- **WAVE** — morphs across the 8 PICO-8 waveforms (TRI, TILT, SAW, SQR, PULSE, ORGAN, NOISE, PHASER), crossfading between adjacent shapes for fractional values.

## Sound character

To stay close to PICO-8's output the synth renders at 22050 Hz (PICO-8's native mix rate), runs everything through a one-pole lowpass at ~4.5 kHz, and uses interpolated sample-and-hold noise instead of white noise.
