/**
 * Pure educational physics helpers for Volume X: Nuclear Fission & Atomic Energy.
 *
 * Covers:
 * - Single U-235 fission Q-value (~200 MeV) and mass defect via E = Δm c²
 * - Yield conversion (Joules <-> kilotons of TNT equivalent)
 * - Critical mass scaling with density and neutron reflector: M_c ∝ 1 / ρ²
 * - Effective neutron multiplication factor k_eff and exponential generation growth
 * - Sedov-Taylor blast wave scaling R(t) ∝ (E / ρ₀)^(1/5) t^(2/5)
 */

export const SPEED_OF_LIGHT = 2.99792458e8; // m/s
export const JOULES_PER_KT_TNT = 4.184e12; // 1 kiloton TNT = 4.184 TJ
export const FISSION_ENERGY_MEV = 200.0; // ~200 MeV per U-235 fission
export const MEV_TO_JOULES = 1.602176634e-13;
export const U235_MOLAR_MASS_KG = 0.2350439; // kg/mol
export const AVOGADRO = 6.02214076e23;

/** Bare U-235 reference critical mass (~52 kg at normal density 19.1 g/cm³). */
export const BARE_CRITICAL_MASS_KG = 52.0;

/**
 * Compute energy released from completely fissioning `fissionedMassKg` of U-235.
 * About 0.091% of the uranium rest mass converts into kinetic & radiant energy (Δm = E / c²).
 */
export function computeFissionYield(fissionedMassKg: number): {
  fissions: number;
  energyJoules: number;
  yieldKt: number;
  massDefectGrams: number;
  blastKt: number;
  thermalKt: number;
  radiationKt: number;
} {
  const m = Math.max(0, fissionedMassKg);
  const fissions = (m / U235_MOLAR_MASS_KG) * AVOGADRO;
  const energyJoules = fissions * FISSION_ENERGY_MEV * MEV_TO_JOULES;
  const yieldKt = energyJoules / JOULES_PER_KT_TNT;
  const massDefectGrams = (energyJoules / (SPEED_OF_LIGHT * SPEED_OF_LIGHT)) * 1000;
  return {
    fissions,
    energyJoules,
    yieldKt,
    massDefectGrams,
    blastKt: yieldKt * 0.5,
    thermalKt: yieldKt * 0.35,
    radiationKt: yieldKt * 0.15,
  };
}

/**
 * Critical mass scales inversely with density squared (M_c ∝ 1 / ρ²)
 * and drops with a surrounding neutron reflector / tamper.
 */
export function criticalMassKg(densityRatio: number, reflectorEfficiency: number): number {
  const rho = Math.max(0.5, densityRatio);
  const ref = Math.max(0, Math.min(0.95, reflectorEfficiency));
  const reflectorFactor = 1 - 0.55 * ref;
  return (BARE_CRITICAL_MASS_KG / (rho * rho)) * reflectorFactor;
}

/**
 * Effective neutron multiplication factor k_eff for a spherical core of mass `coreMassKg`,
 * relative density `densityRatio` (ρ / ρ₀), and neutron reflector efficiency in [0, 1].
 *
 * k_eff = 1 exactly when coreMassKg == criticalMassKg(densityRatio, reflectorEfficiency).
 */
export function effectiveMultiplicationFactor(
  coreMassKg: number,
  densityRatio: number,
  reflectorEfficiency: number,
): number {
  const mc = criticalMassKg(densityRatio, reflectorEfficiency);
  const ratio = Math.max(0.01, coreMassKg / mc);
  // Smooth physical scaling: k_eff = 1 at ratio = 1, saturating below k_inf ≈ 2.42
  const kInf = 2.42;
  const pLeak = Math.pow(ratio, -2 / 3);
  return kInf / (1 + (kInf - 1) * pLeak);
}

/**
 * Sedov-Taylor self-similar blast wave radius in metres for yield `yieldKt`
 * at elapsed time `timeSec` in sea-level air (ρ₀ = 1.225 kg/m³).
 */
export function sedovTaylorRadiusMeters(yieldKt: number, timeSec: number): number {
  const E = Math.max(0.01, yieldKt) * JOULES_PER_KT_TNT;
  const rho0 = 1.225;
  const t = Math.max(0, timeSec);
  const xi0 = 1.033;
  return xi0 * Math.pow(E / rho0, 0.2) * Math.pow(t, 0.4);
}

/**
 * Liquid-drop fission saddle deformation metric: returns neck radius in [0, 1]
 * as a function of elongation phase s in [0, 1].
 */
export function liquidDropNeck(phase: number): number {
  const s = Math.max(0, Math.min(1, phase));
  if (s >= 0.82) return 0;
  return Math.max(0, Math.cos((s / 0.82) * Math.PI * 0.5));
}
