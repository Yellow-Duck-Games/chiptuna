# Vendored third-party code

- **WasmMediaEncoder.min.js** + **ogg-wasm.js** — [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) v0.7.0 (MIT). A WebAssembly build of Xiph libvorbis/libogg (BSD-3-Clause). Used by `saveOgg()` to encode the rendered samples to a real Ogg Vorbis file in every browser.

`ogg-wasm.js` is the package's `wasm/ogg.wasm` base64-embedded into a `window.OGG_WASM_B64` string, so the export needs no network fetch and works even when `index.html` is opened directly from disk (`file://`).

Committed as-is (no build step). To update: download the matching `dist/umd/WasmMediaEncoder.min.js` and `wasm/ogg.wasm` from the same package version, then regenerate `ogg-wasm.js`:

```sh
node -e 'const fs=require("fs");const b64=fs.readFileSync("ogg.wasm").toString("base64");fs.writeFileSync("ogg-wasm.js",`window.OGG_WASM_B64 = "${b64}";\n`)'
```
