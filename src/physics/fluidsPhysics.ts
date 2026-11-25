export function venturiRadius(x: number, rInlet: number, rThroat: number): number {
  return rInlet - (rInlet - rThroat) * Math.exp(-(x * x) / 6.5);
}

export interface VenturiSample {
  radius: number;
  area: number;
  velocity: number;
  pressure: number;
}

export function evaluateVenturi(
  x: number,
  rInlet: number,
  rThroat: number,
  flowQ: number,
  rho = 1.0,
  pInlet = 100,
): VenturiSample {
  const r = Math.max(0.2, venturiRadius(x, rInlet, rThroat));
  const area = Math.PI * r * r;
  const velocity = flowQ / area;
  const vInlet = flowQ / (Math.PI * rInlet * rInlet);
  const pressure = pInlet + 0.5 * rho * (vInlet * vInlet - velocity * velocity);
  return { radius: r, area, velocity, pressure };
}

/**
 * Potential flow past a spinning/circulating cylinder (uniform stream + doublet + circulation vortex).
 */
export function evaluateCylinderPotentialFlow(
  x: number,
  y: number,
  uInf: number,
  radius: number,
  circulation: number,
): { ux: number; uy: number; speed: number } {
  const r2 = Math.max(radius * radius * 0.25, x * x + y * y);
  const a2 = radius * radius;
  const factor = a2 / r2;
  const dx2 = (x * x - y * y) / r2;
  const dxy = (2 * x * y) / r2;

  const ux = uInf * (1 - factor * dx2) + (circulation / (2 * Math.PI * r2)) * y;
  const uy = -uInf * factor * dxy - (circulation / (2 * Math.PI * r2)) * x;

  return { ux, uy, speed: Math.hypot(ux, uy) };
}

export function kuttaJoukowskiLift(rho: number, uInf: number, circulation: number): number {
  return rho * uInf * circulation;
}

/**
 * Cylinder wake with alternating counter-rotating Kármán vortices shed downstream.
 */
export function evaluateKarmanWake(
  x: number,
  y: number,
  t: number,
  uInf: number,
  radius: number,
): { ux: number; uy: number } {
  const base = evaluateCylinderPotentialFlow(x, y, uInf, radius, 0);
  let ux = base.ux;
  let uy = base.uy;

  const vSpeed = 0.82 * uInf;
  const spacingX = 3.2;
  const offsetY = 0.95 * radius;
  const gamma0 = 5.4 * uInf;

  for (let k = 0; k < 6; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    const vx = radius * 1.4 + ((k * spacingX * 0.5 + t * vSpeed) % 16);
    const vy = sign * offsetY;
    const dx = x - vx;
    const dy = y - vy;
    const r2 = dx * dx + dy * dy + 0.85;
    const strength = (sign * gamma0) / (2 * Math.PI * r2);
    ux -= strength * dy;
    uy += strength * dx;
  }

  return { ux, uy };
}

/**
 * Superposition of two KdV sech^2 solitons where taller amplitude propagates faster.
 */
export function evaluateKdvSoliton(
  x: number,
  t: number,
  amp1: number,
  amp2: number,
  x01: number,
  x02: number,
): number {
  const evalSingle = (amp: number, x0: number): number => {
    const c = 0.75 * amp;
    const widthInv = Math.sqrt(Math.max(0.05, amp) * 0.28);
    const arg = widthInv * (x - x0 - c * t);
    if (Math.abs(arg) > 20) return 0;
    const ch = Math.cosh(arg);
    return amp / (ch * ch);
  };
  return evalSingle(amp1, x01) + evalSingle(amp2, x02);
}
