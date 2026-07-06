# chiptuna

A PICO-8 flavored random SFX generator. Pure vanilla JS + Web Audio, no dependencies, no build step.

## Run

Open `index.html` directly in a browser, or:

```sh
npm start   # serves the folder via `npx serve`
```

## Controls

- **Random** (`r`) — roll a new sound, biased toward classic game-sfx shapes
- **Mutate** (`m`) — nudge every parameter a little: same character, new variation
- **Play** (`space`) — play the current parameters
- **Save OGG** — export the sound (ogg/opus in Firefox; Chrome doesn't support the ogg container, so it saves webm/opus)
- **History** — every sound you play is listed (newest first, up to 20, deduped, kept across reloads); click an entry to bring that sound back, **×** deletes one entry, **clear** wipes the list

## Parameters

Three sections, each with its own envelope (hold at start value, then slide to end value over decay) and LFO:

- **AMP** — master volume, attack / hold / decay volume envelope + tremolo LFO. Total sound length = attack + hold + decay.
- **PITCH** — start/end in PICO-8 note units (0–63, C0 ≈ 65.4 Hz) + vibrato LFO in semitones.
- **WAVE** — morphs across the 8 PICO-8 waveforms (TRI, TILT, SAW, SQR, PULSE, ORGAN, NOISE, PHASER), crossfading between adjacent shapes for fractional values.

## Seed

The **seed** field below the scope holds the entire sound as a compact shareable string, e.g.

```
chiptuna:Af__BR8ZmiVOAAAAAGGGYYYMzRhxAAAAAAAAAAAZmhhxAAAAAAAAAAEk
```

It updates live as you tweak sliders or roll a sound; pasting a seed into the field loads and plays that exact sound immediately. The base64url payload is a version byte, each parameter quantized to 16 bits, a 32-bit noise seed, and a checksum — so truncated or mistyped seeds are rejected instead of loading garbage, and since noise comes from a seeded PRNG a seed reproduces the sound sample-for-sample.

The field also imports three other formats:

- **`[sfx]…[/sfx]`** — a genuine PICO-8 clipboard string (ctrl-C on a sound in PICO-8's sfx editor). Its 32 notes are mapped approximately onto the synth's envelopes: the volume column becomes the amp attack/hold/decay, the first/last audible pitches and waveforms become the pitch and wave envelopes, and note length comes from the sfx speed.
- **`sfxg…`** — the native format of the [sfxp cart](https://www.lexaloffle.com/bbs/?tid=54142) that inspired this tool: 17 parameter values plus a speed. The import runs a port of sfxp's own note renderer to produce the same 32 notes sfxp would write into a cartridge, then maps those as above.
- Seeds from this tool's earlier versions (`chirp8:…` and hex `[sfx]01…`) still load exactly.

PICO-8/sfxp imports are a starting point rather than an exact recreation (per-note effects and detail are ignored) — the field then shows the imported sound re-encoded as a native seed.

## Sound character

To stay close to PICO-8's output the synth renders at 22050 Hz (PICO-8's native mix rate), runs everything through a one-pole lowpass at ~4.5 kHz, and uses interpolated sample-and-hold noise instead of white noise.
