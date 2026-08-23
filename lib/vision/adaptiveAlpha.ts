export type NormalizedAnalysisBox = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

/** Decide whether a second, higher-resolution alpha pass is worth the cost. */
export function shouldRefineAlphaAnalysis(
  visionObjects: readonly NormalizedAnalysisBox[],
  alphaObjects: readonly NormalizedAnalysisBox[],
): boolean {
  if (alphaObjects.length === 0) return true;
  if (visionObjects.length > alphaObjects.length) return true;

  return alphaObjects.some((object) => {
    const width = Math.max(0, object.x_max - object.x_min);
    const height = Math.max(0, object.y_max - object.y_min);
    return Math.min(width, height) <= 0.008 && Math.max(width, height) >= 0.04;
  });
}
