# ArtShift VTracer Browser WASM

This directory contains the first-party browser binding for the official
VisionCortex VTracer core.

- Upstream: <https://github.com/visioncortex/vtracer>
- Pinned core: `vtracer = 1.0.0-alpha.4`
- License: `MIT OR Apache-2.0`
- Input: raw RGBA8 pixels
- Output: SVG string
- Target: `wasm32-unknown-unknown` through `wasm-pack --target web`

ArtShift runs the generated module inside `lib/vectorize/vectorizer.worker.ts`.
The runtime files copied to `public/wasm/vtracer/` are intentionally bundled
with the application: vectorization does not upload image data or fetch a model
at runtime.

## Rebuild

Build prerequisites:

- Rust stable
- `wasm32-unknown-unknown` target
- `wasm-pack`

From the repository root:

```bash
npm run build:vtracer-wasm
```

The build script creates `pkg/` under this directory and copies only the web
ESM glue and `.wasm` binary to `public/wasm/vtracer/`.

The generated binary is a release artifact; keep the pinned crate version and
retain the upstream license notice when redistributing it.
