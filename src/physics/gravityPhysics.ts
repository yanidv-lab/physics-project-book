import type { Vec3Like } from './emPhysics';

export interface GravityAttractor {
  x: number;
  y: number;
  z: number;
  mass: number;
  radius: number;
}

export interface OrbitalBodyState {
  pos: Vec3Like;
  vel: Vec3Like;
}

export const DEFAULT_G = 24;

export function gravityPotential(
  x: number,
  z: number,
  attractors: readonly GravityAttractor[],
  G = DEFAULT_G,
  softening = 0.85,
): number {
  let phi = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < attractors.length; i++) {
    const a = attractors[i];
    const dx = x - a.x;
    const dz = z - a.z;
    phi -= (G * a.mass) / Math.sqrt(dx * dx + dz * dz + eps2);
  }
  return phi;
}

export function gravityAccel(
  pos: Vec3Like,
  attractors: readonly GravityAttractor[],
  out: Vec3Like = { x: 0, y: 0, z: 0 },
  G = DEFAULT_G,
  softening = 0.85,
): Vec3Like {
  let ax = 0;
  let ay = 0;
  let az = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < attractors.length; i++) {
    const a = attractors[i];
    const dx = pos.x - a.x;
    const dy = pos.y - a.y;
    const dz = pos.z - a.z;
    const r2 = dx * dx + dy * dy + dz * dz + eps2;
    const invR3 = (-G * a.mass) / (r2 * Math.sqrt(r2));
    ax += dx * invR3;
    ay += dy * invR3;
    az += dz * invR3;
  }
  out.x = ax;
  out.y = ay;
  out.z = az;
  return out;
}

/**
 * Symplectic Velocity-Verlet orbital integrator preserving mechanical energy.
 */
export function stepVelocityVerlet(
  body: OrbitalBodyState,
  attractors: readonly GravityAttractor[],
  dt: number,
  G = DEFAULT_G,
  softening = 0.85,
): void {
  const a0 = gravityAccel(body.pos, attractors, { x: 0, y: 0, z: 0 }, G, softening);
  const halfDt2 = 0.5 * dt * dt;

  body.pos.x += body.vel.x * dt + a0.x * halfDt2;
  body.pos.y += body.vel.y * dt + a0.y * halfDt2;
  body.pos.z += body.vel.z * dt + a0.z * halfDt2;

  const a1 = gravityAccel(body.pos, attractors, { x: 0, y: 0, z: 0 }, G, softening);
  const halfDt = 0.5 * dt;

  body.vel.x += (a0.x + a1.x) * halfDt;
  body.vel.y += (a0.y + a1.y) * halfDt;
  body.vel.z += (a0.z + a1.z) * halfDt;
}

export function bodyMechanicalEnergy(
  body: OrbitalBodyState,
  attractors: readonly GravityAttractor[],
  G = DEFAULT_G,
  softening = 0.85,
): { kinetic: number; potential: number; total: number } {
  const v2 = body.vel.x * body.vel.x + body.vel.y * body.vel.y + body.vel.z * body.vel.z;
  const kinetic = 0.5 * v2;
  let potential = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < attractors.length; i++) {
    const a = attractors[i];
    const dx = body.pos.x - a.x;
    const dy = body.pos.y - a.y;
    const dz = body.pos.z - a.z;
    potential -= (G * a.mass) / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
  }
  return { kinetic, potential, total: kinetic + potential };
}

export function circularSpeed(mass: number, r: number, G = DEFAULT_G): number {
  return Math.sqrt((G * mass) / Math.max(1e-6, r));
}

export function escapeSpeed(mass: number, r: number, G = DEFAULT_G): number {
  return Math.sqrt((2 * G * mass) / Math.max(1e-6, r));
}

export function softenedCircularSpeed(
  mass: number,
  r: number,
  G = DEFAULT_G,
  softening = 0.85,
): number {
  const r2 = r * r;
  const denom = r2 + softening * softening;
  return Math.sqrt((G * mass * r2) / (denom * Math.sqrt(denom)));
}
