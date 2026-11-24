export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface PointCharge {
  x: number;
  y: number;
  z: number;
  q: number;
}

/**
 * Computes exact softened 3D Coulomb electric field:
 * E(r) = sum_i k * q_i * (r - r_i) / (|r - r_i|^2 + eps^2)^(3/2)
 */
export function computeElectricField(
  pos: Vec3Like,
  charges: readonly PointCharge[],
  out: Vec3Like = { x: 0, y: 0, z: 0 },
  softening = 0.55,
  kCoulomb = 22,
): Vec3Like {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  const eps2 = softening * softening;

  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = pos.x - c.x;
    const dy = pos.y - c.y;
    const dz = pos.z - c.z;
    const r2 = dx * dx + dy * dy + dz * dz + eps2;
    const invR3 = (kCoulomb * c.q) / (r2 * Math.sqrt(r2));
    ex += dx * invR3;
    ey += dy * invR3;
    ez += dz * invR3;
  }

  out.x = ex;
  out.y = ey;
  out.z = ez;
  return out;
}

export function computeElectricPotential(
  pos: Vec3Like,
  charges: readonly PointCharge[],
  softening = 0.55,
  kCoulomb = 22,
): number {
  let v = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = pos.x - c.x;
    const dy = pos.y - c.y;
    const dz = pos.z - c.z;
    v += (kCoulomb * c.q) / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
  }
  return v;
}

/**
 * Symplectic/energy-conserving 3D Boris algorithm for Lorentz force:
 * F/m = (q/m) * (E + v x B).
 * Strictly conserves kinetic speed |v| when E = 0.
 */
export function stepBorisLorentz(
  pos: Vec3Like,
  vel: Vec3Like,
  E: Vec3Like,
  B: Vec3Like,
  qOverM: number,
  dt: number,
): void {
  const halfQDt = 0.5 * qOverM * dt;

  // 1. Half electric impulse
  const vmx = vel.x + halfQDt * E.x;
  const vmy = vel.y + halfQDt * E.y;
  const vmz = vel.z + halfQDt * E.z;

  // 2. Magnetic rotation
  const tx = halfQDt * B.x;
  const ty = halfQDt * B.y;
  const tz = halfQDt * B.z;
  const t2 = tx * tx + ty * ty + tz * tz;
  const sFactor = 2 / (1 + t2);
  const sx = tx * sFactor;
  const sy = ty * sFactor;
  const sz = tz * sFactor;

  // v' = v- + (v- x t)
  const vpx = vmx + (vmy * tz - vmz * ty);
  const vpy = vmy + (vmz * tx - vmx * tz);
  const vpz = vmz + (vmx * ty - vmy * tx);

  // v+ = v- + (v' x s)
  const vxPlus = vmx + (vpy * sz - vpz * sy);
  const vyPlus = vmy + (vpz * sx - vpx * sz);
  const vzPlus = vmz + (vpx * sy - vpy * sx);

  // 3. Second half electric impulse
  vel.x = vxPlus + halfQDt * E.x;
  vel.y = vyPlus + halfQDt * E.y;
  vel.z = vzPlus + halfQDt * E.z;

  // 4. Advance position
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

export interface EmWaveSample {
  E: Vec3Like;
  B: Vec3Like;
  poynting: Vec3Like;
}

/**
 * Evaluates a transverse electromagnetic plane wave propagating along +X.
 * Orthogonal triad: E perp B, S = E x B points strictly along +X.
 */
export function evaluateEmWave(
  x: number,
  t: number,
  frequency: number,
  wavelength: number,
  amplitude: number,
  circular = false,
): EmWaveSample {
  const k = (2 * Math.PI) / Math.max(0.5, wavelength);
  const omega = 2 * Math.PI * frequency;
  const phase = k * x - omega * t;

  const sinP = Math.sin(phase);
  const cosP = Math.cos(phase);

  const ey = amplitude * sinP;
  const ez = circular ? amplitude * cosP : 0;
  // B = x_hat x E (normalized c = 1): (-ez, ey) in (y, z)
  const by = -ez;
  const bz = ey;

  // S = E x B
  const sx = ey * bz - ez * by;
  const sy = 0;
  const sz = 0;

  return {
    E: { x: 0, y: ey, z: ez },
    B: { x: 0, y: by, z: bz },
    poynting: { x: sx, y: sy, z: sz },
  };
}

export interface FaradayCoilSample {
  magnetZ: number;
  magnetVelZ: number;
  fluxTotal: number;
  emf: number;
}

/**
 * Evaluates a plunging magnetic dipole oscillating along a N-turn coil axis (Z).
 * Analytical EMF = -N * dPhi/dt.
 */
export function evaluateFaradayCoil(
  t: number,
  frequency: number,
  amplitude: number,
  turns: number,
): FaradayCoilSample {
  const omega = 2 * Math.PI * frequency;
  const magnetZ = amplitude * Math.sin(omega * t);
  const magnetVelZ = amplitude * omega * Math.cos(omega * t);

  const coilLen = 2.6;
  const u = magnetZ / coilLen;
  const denom = 1 + u * u;
  const sqrtD = Math.sqrt(denom);

  const fluxPerTurn = 1.0 / (denom * sqrtD);
  const dFluxDz = (-3 * magnetZ) / (coilLen * coilLen * denom * denom * sqrtD);

  const fluxTotal = turns * fluxPerTurn;
  const emf = -turns * dFluxDz * magnetVelZ;

  return {
    magnetZ,
    magnetVelZ,
    fluxTotal,
    emf,
  };
}

export interface HallEquilibriumSample {
  driftSpeed: number;
  hallFieldZ: number;
  hallVoltage: number;
  magneticDeflectAccelZ: number;
}

/**
 * Evaluates steady-state Hall Effect equilibrium in a rectangular bar
 * with conventional current I along +X and magnetic field B_y along +Y.
 * Right-handed axes: x_hat x y_hat = +z_hat.
 */
export function evaluateHallEquilibrium(
  current: number,
  bFieldY: number,
  carrierSign: 1 | -1,
  width = 4.4,
  thickness = 1.3,
  carrierDensity = 1.0,
): HallEquilibriumSample {
  const safeDenom = Math.max(1e-6, carrierDensity * width * thickness);
  const driftSpeed = carrierSign * (current / safeDenom);
  const magneticDeflectAccelZ = carrierSign * driftSpeed * bFieldY;
  const hallFieldZ = -driftSpeed * bFieldY;
  const hallVoltage = -hallFieldZ * width;

  return {
    driftSpeed,
    hallFieldZ,
    hallVoltage,
    magneticDeflectAccelZ,
  };
}
