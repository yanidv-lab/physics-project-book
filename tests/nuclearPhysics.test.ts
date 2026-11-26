import { describe, expect, it } from 'vitest';
import {
  BARE_CRITICAL_MASS_KG,
  computeFissionYield,
  criticalMassKg,
  effectiveMultiplicationFactor,
  liquidDropNeck,
  sedovTaylorRadiusMeters,
} from '../src/physics/nuclearPhysics';
import { NuclearLab } from '../src/labs/nuclearLab';

describe('Volume X: Nuclear Fission & Atomic Energy physics', () => {
  it('computes E = Δmc² yield accurately (~15 kt for ~0.85 kg U-235)', () => {
    const y = computeFissionYield(0.85);
    expect(y.yieldKt).toBeGreaterThan(14);
    expect(y.yieldKt).toBeLessThan(20);
    expect(y.massDefectGrams).toBeGreaterThan(0.6);
    expect(y.massDefectGrams).toBeLessThan(1.0);
    expect(y.blastKt + y.thermalKt + y.radiationKt).toBeCloseTo(y.yieldKt, 6);
  });

  it('scales critical mass inversely with density squared (M_c ∝ 1/ρ²)', () => {
    const bare = criticalMassKg(1.0, 0);
    expect(bare).toBeCloseTo(BARE_CRITICAL_MASS_KG, 5);

    const doubled = criticalMassKg(2.0, 0);
    expect(doubled).toBeCloseTo(bare / 4, 5);

    const reflected = criticalMassKg(1.0, 0.5);
    expect(reflected).toBeLessThan(bare);
  });

  it('crosses k_eff = 1.0 exactly at critical mass', () => {
    const mc = criticalMassKg(1.5, 0.3);
    expect(effectiveMultiplicationFactor(mc, 1.5, 0.3)).toBeCloseTo(1.0, 6);
    expect(effectiveMultiplicationFactor(mc * 0.5, 1.5, 0.3)).toBeLessThan(1.0);
    expect(effectiveMultiplicationFactor(mc * 1.5, 1.5, 0.3)).toBeGreaterThan(1.0);
  });

  it('computes Sedov-Taylor shockwave scaling and liquid-drop neck pinch', () => {
    const r1 = sedovTaylorRadiusMeters(15, 0.1);
    const r2 = sedovTaylorRadiusMeters(15, 1.0);
    expect(r2).toBeGreaterThan(r1);
    expect(liquidDropNeck(0)).toBeCloseTo(1, 5);
    expect(liquidDropNeck(0.9)).toBe(0);
  });

  it('instantiates NuclearLab and steps all 4 chapters cleanly', () => {
    const lab = new NuclearLab();
    for (const ch of ['nuc-liquiddrop', 'nuc-critical', 'nuc-implosion', 'nuc-fireball']) {
      lab.activate(ch);
      lab.update(0.05);
      expect(lab.getTelemetry().length).toBe(4);
      expect(lab.getFormula().tex.length).toBeGreaterThan(5);
      expect(lab.getRecommendedCamera().position.length).toBe(3);
    }
    lab.dispose();
  });
});
