/**
 * Pure educational physics helpers for Volume XI: Stellar Fusion & Tokamak Plasma.
 *
 * Covers:
 * - D-T fusion Q-value (17.6 MeV: 3.5 MeV alpha + 14.1 MeV neutron)
 * - Gamow quantum tunneling probability factor P ~ exp(-sqrt(E_G / E))
 * - Lawson triple product n · T · τ_E and ignition ratio Q_fusion
 * - Tokamak safety factor q and toroidal magnetic pressure P_B = B² / (2 μ₀)
 * - Solar core proton-proton luminosity & mass conversion rate (~4.26M tonnes/s)
 */

export const MU_0 = 4 * Math.PI * 1e-7; // T·m/A
export const DT_Q_VALUE_MEV = 17.6;
export const DT_ALPHA_MEV = 3.5;
export const DT_NEUTRON_MEV = 14.1;
export const LAWSON_IGNITION_TRIPLE = 3.0e21; // keV · s / m³

/**
 * Relative Gamow quantum tunneling probability in [0, 1] for D-T nuclei at
 * plasma temperature `tempMK` (millions of Kelvin, 10–250 MK).
 */
export function gamowTunnelingFactor(tempMK: number): number {
  const tKeV = Math.max(0.5, tempMK * 0.08617);
  // Gamow energy for D-T is ~1183 keV; peak reactivity around 60-80 keV
  const raw = Math.exp(-Math.sqrt(1183 / (tKeV * 6.5))) * Math.pow(tKeV, -2 / 3) * 28.0;
  return Math.max(0.002, Math.min(1.0, raw));
}

/**
 * Magnetic pressure in atmospheres for toroidal field `bTesla` (1–15 T).
 * P_B = B² / (2 μ₀).
 */
export function magneticPressureAtm(bTesla: number): number {
  const b = Math.max(0, bTesla);
  const pascals = (b * b) / (2 * MU_0);
  return pascals / 101325;
}

/**
 * Lawson triple product n · T · τ_E (in 10²¹ keV·s/m³) and estimated fusion gain Q.
 */
export function computeLawsonMetrics(
  bTesla: number,
  tempMK: number,
  confinementSec: number,
): {
  tripleProduct1e21: number;
  fusionGainQ: number;
  ignited: boolean;
  magneticPressureAtm: number;
} {
  const tKeV = Math.max(1, tempMK * 0.08617);
  // Density scales roughly with magnetic pressure (beta limit)
  const n1e20 = Math.min(4.5, 0.35 * bTesla * bTesla * 0.12);
  const triple1e21 = n1e20 * 0.1 * tKeV * Math.max(0.1, confinementSec);
  const reactivityBoost = gamowTunnelingFactor(tempMK);
  const q = Math.max(0, (triple1e21 / 3.0) * (0.4 + 2.4 * reactivityBoost) * 4.2);
  return {
    tripleProduct1e21: triple1e21,
    fusionGainQ: q,
    ignited: triple1e21 >= 3.0 && tempMK >= 100,
    magneticPressureAtm: magneticPressureAtm(bTesla),
  };
}

/**
 * Inertial confinement (ICF) fuel compression metrics for laser drive energy `laserMJ` (0.5–4.0 MJ).
 */
export function computeIcfYield(laserMJ: number): {
  targetYieldMJ: number;
  gainQ: number;
  compressionRatio: number;
  ignited: boolean;
} {
  const e = Math.max(0.2, laserMJ);
  const compressionRatio = 250 + e * 380;
  // Nonlinear ignition cliff around 1.8 - 2.05 MJ (mirroring NIF's 2.05 MJ -> 3.15 MJ milestone!)
  const cliff = 1 / (1 + Math.exp(-(e - 1.95) * 4.5));
  const targetYieldMJ = e * (0.15 + 2.45 * cliff);
  return {
    targetYieldMJ,
    gainQ: targetYieldMJ / e,
    compressionRatio,
    ignited: targetYieldMJ > e,
  };
}

/**
 * Stellar core luminosity scaling (L ∝ M^3.5) and hydrogen-to-helium mass defect rate.
 */
export function computeStellarCore(solarMasses: number): {
  coreTempMK: number;
  luminositySolar: number;
  massConvertedMillionTonnesPerSec: number;
} {
  const m = Math.max(0.4, Math.min(3.0, solarMasses));
  const coreTempMK = 15.7 * Math.pow(m, 0.55);
  const luminositySolar = Math.pow(m, 3.5);
  const massConvertedMillionTonnesPerSec = 4.26 * luminositySolar;
  return { coreTempMK, luminositySolar, massConvertedMillionTonnesPerSec };
}
