/** Small random tilt in radians (~±6°) so placed items feel physical, not chaotic. */
export function lightTiltRadians(rng: () => number = Math.random): number {
  const degrees = (rng() - 0.5) * 12;
  return (degrees * Math.PI) / 180;
}

export function lightTiltDegrees(rng: () => number = Math.random): number {
  return (rng() - 0.5) * 12;
}
