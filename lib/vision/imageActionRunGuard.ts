const inFlightKeys = new Set<string>();

export function claimImageActionRun(key: string): boolean {
  if (inFlightKeys.has(key)) return false;
  inFlightKeys.add(key);
  return true;
}

export function releaseImageActionRun(key: string): void {
  inFlightKeys.delete(key);
}
