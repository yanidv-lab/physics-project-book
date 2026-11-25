export function lorentzGamma(beta: number): number {
  const b = Math.min(0.995, Math.abs(beta));
  return 1 / Math.sqrt(1 - b * b);
}

export function contractedLength(restLength: number, beta: number): number {
  return restLength / lorentzGamma(beta);
}

export function lorentzBoost(
  x: number,
  ct: number,
  beta: number,
): { xPrime: number; ctPrime: number } {
  const b = Math.max(-0.995, Math.min(0.995, beta));
  const g = lorentzGamma(b);
  return {
    xPrime: g * (x - b * ct),
    ctPrime: g * (ct - b * x),
  };
}

export function radioactiveRemaining(n0: number, halfLife: number, t: number): number {
  return n0 * Math.pow(0.5, Math.max(0, t) / Math.max(1e-6, halfLife));
}

export function fissionKFactor(enrichment: number, rodInsertion: number): number {
  const safeEnrich = Math.max(0, Math.min(1, enrichment));
  const safeRod = Math.max(0, Math.min(1, rodInsertion));
  return Math.max(0.1, (0.65 + safeEnrich * 1.45) * (1 - 0.68 * safeRod));
}
