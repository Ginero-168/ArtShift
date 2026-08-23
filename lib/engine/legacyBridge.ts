/**
 * Compatibility boundary for the pre-Engine Zustand document store.
 *
 * New UI code should not read `useStore.getState().doc` directly. Keeping the
 * adapter here makes the eventual legacy-store removal a single seam.
 */

import { useStore } from "../store";
import { legacyToEngineDoc } from "./adapter";
import type { EngineDoc } from "./types";

export async function importLegacyStoreDocument(): Promise<EngineDoc> {
  return legacyToEngineDoc(useStore.getState().doc);
}
