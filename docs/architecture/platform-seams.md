# Platform seams

ArtShift keeps raster processing, file access, persistence, and AI transport behind small ports. The browser adapters are the default implementation today; a Tauri desktop build can provide native adapters without changing EditorController or RasterProcessor consumers.

- `lib/raster/processor.ts`: Local and API raster implementations share one job contract.
- `lib/raster/opencvJsAdapter.ts`: OpenCV.js is lazy-loaded only for advanced local retouch jobs; the base editor does not pay the WASM startup cost.
- `lib/platform/fileSystem.ts`: import/export bytes and native file dialogs.
- `lib/platform/persistence.ts`: autosave and project persistence.
- `lib/platform/aiTransport.ts`: remote AI requests and desktop-local transports.
