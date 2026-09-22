/** Default Replicate model for Moodboard AI batch fill (~$0.003/image). */
export const MOODBOARD_REPLICATE_IMAGE_MODEL = "black-forest-labs/flux-schnell" as const;

/** Server-owned alias resolved in modelManifest → flux-schnell. */
export const MOODBOARD_IMAGE_MODEL_ALIAS = "image-moodboard" as const;

/** Intentional batch size — do not apply chat default-count=1 to this path. */
export const MOODBOARD_IMAGE_COUNT = 9 as const;

export const MOODBOARD_GRID_COLUMNS = 3 as const;
export const MOODBOARD_GRID_ROWS = 3 as const;

/** Square cell size on the infinite board (world units). */
export const MOODBOARD_CELL_SIZE = 320 as const;
export const MOODBOARD_GRID_GAP = 24 as const;

/** Parallel Replicate predictions while filling the 3×3 grid. */
export const MOODBOARD_GENERATE_CONCURRENCY = 3 as const;

export const MOODBOARD_IMAGE_WIDTH = 1024 as const;
export const MOODBOARD_IMAGE_HEIGHT = 1024 as const;

/** ~$0.003/image × 9 with headroom for retries. */
export const MOODBOARD_GENERATE_MAX_COST_USD = 0.05 as const;
