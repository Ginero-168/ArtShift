# Platform seams

ArtShift keeps the editor and document model independent from the runtime that
hosts it. The shared boundary is `lib/platform/services.ts`:

- `FileSystemPort` owns open/save bytes.
- `PersistencePort` owns project/session persistence.
- `AiTransportPort` owns network AI requests.
- `RasterProcessor` owns pixel jobs and has Local/Eco and API/Fast adapters.

The browser currently provides the default implementations. A future Tauri
shell should provide native implementations at its entry point and inject them
through `PlatformServicesFactory`. It should not import Tauri APIs from React
components or the Zustand store.

This keeps desktop work on a separate branch and prevents a native filesystem
or transport decision from coupling the web editor to a single deployment.
