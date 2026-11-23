import type { SimParams } from '../types/simulation';

export const E_CHARGE = 1.602176634e-19; // C
export const M_E_EFF = 9.20e-31; // kg (effective electron mass in Cu, ~1.01 * m_e)
export const N_CU = 8.49e28; // m^-3 (conduction electron density in Cu)
export const RHO_CU_300 = 1.68e-8; // Ohm*m (copper resistivity at 300 K)
export const V_FERMI_CU = 1.57e6; // m/s (Fermi velocity in Cu)
export const K_BOLTZMANN = 1.380649e-23; // J/K
export const EPSILON_0 = 8.854187817e-12; // F/m
export const MU_0 = 4 * Math.PI * 1e-7; // H/m

export const WIRE_RADIUS_PHYS = 1.0e-3; // m (1 mm wire radius)
export const WIRE_AREA_PHYS = Math.PI * WIRE_RADIUS_PHYS * WIRE_RADIUS_PHYS; // ~3.14159e-6 m^2

export const WIRE_TUBE_RADIUS = 1.55; // scene units
export const RES_TUBE_RADIUS = 0.93; // scene units (A_res / A_wire = 0.36)
export const RES_AREA_RATIO = (RES_TUBE_RADIUS / WIRE_TUBE_RADIUS) ** 2; // 0.36
export const RES_AREA_PHYS = WIRE_AREA_PHYS * RES_AREA_RATIO;

export const BATTERY_INTERNAL_R = 0.2; // Ohms
export const CAP_PLATE_AREA_PHYS = 0.015; // m^2 effective parallel-plate area for J_D = dsigma/dt = I / A_plate

export function createDefaultParams(): SimParams {
  return {
    topology: 'simple-r',
    sourceMode: 'dc',
    voltage: 6.0,
    acFrequency: 1.59,
    resistance: 10,
    resistance2: 30,
    capacitance: 0.025,
    inductance: 2.5,
    rcDischarging: false,
    autoCapHandoff: true,
    temperature: 300,
    scaleCompression: 0.0,
    timeDilation: 1.0,
    paused: false,
    layers: {
      electricField: true,
      surfaceCharge: true,
      potentialLandscape: true,
      phononGlow: true,
      magneticField: true,
    },
  };
}

/**
 * Smooth Bloch-Grüneisen-inspired copper resistivity as a function of temperature (K).
 * Evaluates to exact RHO_CU_300 at 300 K, drops ~100x at 10 K, and climbs ~2.83x at 800 K.
 */
export function copperResistivity(temperatureK: number): number {
  const T = Math.max(1, temperatureK);
  const f = (t: number) => (t / 300) / (1 + (85 / t) ** 2);
  const g = f(T) / f(300);
  return RHO_CU_300 * (0.01 + 0.99 * g);
}

/**
 * Gentle metallic-alloy temperature coefficient of resistance for load resistors.
 * Evaluates to 1.0 at 300 K.
 */
export function resistorTempFactor(temperatureK: number): number {
  return Math.max(0.25, 1 + 0.0012 * (temperatureK - 300));
}

/**
 * Drude mean free time tau = m* / (n * e^2 * rho).
 */
export function drudeTau(resistivity: number): number {
  const safeRho = Math.max(1e-12, resistivity);
  return M_E_EFF / (N_CU * E_CHARGE * E_CHARGE * safeRho);
}

/**
 * Wraps arc-length s cleanly into [0, totalLength).
 */
export function wrapS(s: number, totalLength: number): number {
  if (totalLength <= 0) return 0;
  const wrapped = s % totalLength;
  return wrapped < 0 ? wrapped + totalLength : wrapped;
}

/**
 * Computes signed shortest arc-length delta from `from` to `to` on a closed loop of length `totalLength`.
 * Result lies in (-totalLength / 2, totalLength / 2].
 */
export function shortestDeltaS(from: number, to: number, totalLength: number): number {
  let d = wrapS(to - from, totalLength);
  if (d > totalLength * 0.5) {
    d -= totalLength;
  }
  return d;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
