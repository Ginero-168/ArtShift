import { type AiTransportPort, browserAiTransport } from "./aiTransport";
import { browserFileSystem, type FileSystemPort } from "./fileSystem";
import { localStoragePersistence, type PersistencePort } from "./persistence";

/** Runtime-owned ports shared by the browser and the future Tauri shell. */
export type PlatformServices = {
  fileSystem: FileSystemPort;
  persistence: PersistencePort;
  aiTransport: AiTransportPort;
};

export const browserPlatformServices: PlatformServices = {
  fileSystem: browserFileSystem,
  persistence: localStoragePersistence,
  aiTransport: browserAiTransport,
};

/**
 * Keep application code dependent on this one seam. A Tauri entry point can
 * provide native implementations without importing browser globals into the
 * editor or changing the document model.
 */
export type PlatformServicesFactory = () => PlatformServices | Promise<PlatformServices>;
