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

export type LagrangePointName = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface LagrangePointInfo {
  name: LagrangePointName;
  x: number;
  z: number;
  stable: boolean;
}

/**
 * Effective Roche potential in the co-rotating barycentric frame (XZ plane).
 * Primary M1 sits at (-mu*sep, 0) and secondary M2 sits at ((1 - mu)*sep, 0).
 */
export function rocheEffectivePotential(
  x: number,
  z: number,
  m1: number,
  m2: number,
  sep: number,
  G = DEFAULT_G,
  softening = 0.0,
): number {
  const mTot = Math.max(1e-9, m1 + m2);
  const mu = m2 / mTot;
  const x1 = -mu * sep;
  const x2 = (1 - mu) * sep;
  const omega2 = (G * mTot) / (sep * sep * sep);
  const eps2 = softening * softening;

  const r1 = Math.sqrt((x - x1) * (x - x1) + z * z + eps2);
  const r2 = Math.sqrt((x - x2) * (x - x2) + z * z + eps2);

  return -(G * m1) / r1 - (G * m2) / r2 - 0.5 * omega2 * (x * x + z * z);
}

/**
 * Analytical effective force per unit mass (-grad Phi_eff) in the co-rotating frame,
 * combining gravitational attraction toward M1 & M2 with centrifugal acceleration.
 */
export function rocheEffectiveAccel(
  x: number,
  z: number,
  m1: number,
  m2: number,
  sep: number,
  G = DEFAULT_G,
  softening = 0.0,
): { ax: number; az: number } {
  const mTot = Math.max(1e-9, m1 + m2);
  const mu = m2 / mTot;
  const x1 = -mu * sep;
  const x2 = (1 - mu) * sep;
  const omega2 = (G * mTot) / (sep * sep * sep);
  const eps2 = softening * softening;

  const dx1 = x - x1;
  const dx2 = x - x2;
  const r1Sq = dx1 * dx1 + z * z + eps2;
  const r2Sq = dx2 * dx2 + z * z + eps2;

  const invR1_3 = -(G * m1) / (r1Sq * Math.sqrt(r1Sq));
  const invR2_3 = -(G * m2) / (r2Sq * Math.sqrt(r2Sq));

  return {
    ax: dx1 * invR1_3 + dx2 * invR2_3 + omega2 * x,
    az: z * invR1_3 + z * invR2_3 + omega2 * z,
  };
}

function bisectCollinearRoot(fn: (xi: number) => number, loInit: number, hiInit: number): number {
  let lo = loInit;
  let hi = hiInit;
  let fLo = fn(lo);
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    const fMid = fn(mid);
    if ((fLo <= 0 && fMid <= 0) || (fLo >= 0 && fMid >= 0)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Computes exact barycentric coordinates for all five equilibrium Lagrange points (L1-L5).
 */
export function computeLagrangePoints(
  m1: number,
  m2: number,
  sep: number,
): Record<LagrangePointName, LagrangePointInfo> {
  const mTot = Math.max(1e-9, m1 + m2);
  const mu = m2 / mTot;

  const fCollinear = (xi: number): number => {
    const d1 = xi + mu;
    const d2 = xi - (1 - mu);
    return xi - (1 - mu) / (d1 * Math.abs(d1)) - mu / (d2 * Math.abs(d2));
  };

  const xi1 = bisectCollinearRoot(fCollinear, -mu + 1e-5, 1 - mu - 1e-5);
  const xi2 = bisectCollinearRoot(fCollinear, 1 - mu + 1e-5, 2.5);
  const xi3 = bisectCollinearRoot(fCollinear, -2.5, -mu - 1e-5);

  const stableTri = mu < 0.03852;
  const xTri = (0.5 - mu) * sep;
  const zTri = Math.sqrt(3) * 0.5 * sep;

  return {
    L1: { name: 'L1', x: xi1 * sep, z: 0, stable: false },
    L2: { name: 'L2', x: xi2 * sep, z: 0, stable: false },
    L3: { name: 'L3', x: xi3 * sep, z: 0, stable: false },
    L4: { name: 'L4', x: xTri, z: -zTri, stable: stableTri },
    L5: { name: 'L5', x: xTri, z: zTri, stable: stableTri },
  };
}

/**
 * Conserved Jacobi Constant C = -2 * Phi_eff - v_rot^2 in the Circular Restricted 3-Body Problem.
 */
export function jacobiConstant(
  body: OrbitalBodyState,
  m1: number,
  m2: number,
  sep: number,
  G = DEFAULT_G,
  softening = 0.0,
): number {
  const phi = rocheEffectivePotential(body.pos.x, body.pos.z, m1, m2, sep, G, softening);
  const v2 = body.vel.x * body.vel.x + body.vel.z * body.vel.z;
  return -2 * phi - v2;
}

/**
 * 4th-order Runge-Kutta integrator in the co-rotating frame including Coriolis & centrifugal accelerations.
 */
export function stepRotatingThreeBody(
  body: OrbitalBodyState,
  m1: number,
  m2: number,
  sep: number,
  dt: number,
  G = DEFAULT_G,
  softening = 0.0,
): void {
  const mTot = Math.max(1e-9, m1 + m2);
  const omega = Math.sqrt((G * mTot) / (sep * sep * sep));

  const deriv = (x: number, z: number, vx: number, vz: number) => {
    const { ax, az } = rocheEffectiveAccel(x, z, m1, m2, sep, G, softening);
    return {
      dx: vx,
      dz: vz,
      dvx: ax - 2 * omega * vz,
      dvz: az + 2 * omega * vx,
    };
  };

  const x0 = body.pos.x;
  const z0 = body.pos.z;
  const vx0 = body.vel.x;
  const vz0 = body.vel.z;

  const k1 = deriv(x0, z0, vx0, vz0);
  const k2 = deriv(
    x0 + 0.5 * dt * k1.dx,
    z0 + 0.5 * dt * k1.dz,
    vx0 + 0.5 * dt * k1.dvx,
    vz0 + 0.5 * dt * k1.dvz,
  );
  const k3 = deriv(
    x0 + 0.5 * dt * k2.dx,
    z0 + 0.5 * dt * k2.dz,
    vx0 + 0.5 * dt * k2.dvx,
    vz0 + 0.5 * dt * k2.dvz,
  );
  const k4 = deriv(
    x0 + dt * k3.dx,
    z0 + dt * k3.dz,
    vx0 + dt * k3.dvx,
    vz0 + dt * k3.dvz,
  );

  const dt6 = dt / 6;
  body.pos.x = x0 + dt6 * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
  body.pos.z = z0 + dt6 * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz);
  body.vel.x = vx0 + dt6 * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx);
  body.vel.z = vz0 + dt6 * (k1.dvz + 2 * k2.dvz + 2 * k3.dvz + k4.dvz);
}
