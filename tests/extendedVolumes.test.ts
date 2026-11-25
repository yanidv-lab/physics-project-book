import { describe, expect, it } from 'vitest';
import {
  evaluateCylinderPotentialFlow,
  evaluateKdvSoliton,
  evaluateVenturi,
  kuttaJoukowskiLift,
} from '../src/physics/fluidsPhysics';
import {
  doublePendulumEnergy,
  evaluateCoupledModes,
  gyroPrecessionRate,
  stepDoublePendulumRK4,
} from '../src/physics/mechanicsPhysics';
import {
  cauchyIndex,
  computeSnellRefraction,
  evaluateMalusStack,
  solveThinLens,
} from '../src/physics/opticsPhysics';
import {
  contractedLength,
  fissionKFactor,
  lorentzBoost,
  lorentzGamma,
  radioactiveRemaining,
} from '../src/physics/relativityPhysics';
import {
  carnotEfficiency,
  idealGasPressure,
  shannonMixingEntropy,
} from '../src/physics/thermoPhysics';

describe('Volumes V-IX First-Principles Physics Engines', () => {
  it('Thermodynamics: Carnot limit, Ideal Gas P ~ NT/V, and Mixing Entropy bounds', () => {
    expect(carnotEfficiency(600, 300)).toBeCloseTo(0.5, 10);
    expect(carnotEfficiency(300, 400)).toBe(0);

    const p1 = idealGasPressure(100, 300, 1.0);
    const p2 = idealGasPressure(100, 600, 0.5);
    expect(p2).toBeCloseTo(4 * p1, 10);

    expect(shannonMixingEntropy(80, 80, 0, 80)).toBeCloseTo(0, 12);
    expect(shannonMixingEntropy(40, 80, 40, 80)).toBeCloseTo(Math.LN2, 12);
  });

  it("Optics: Snell's Law + TIR, Cauchy Dispersion, Thin Lens 1/f, and Malus 3-Polarizer Paradox", () => {
    const tir = computeSnellRefraction((50 * Math.PI) / 180, 1.5, 1.0);
    expect(tir.isTIR).toBe(true);
    expect(tir.thetaTransRad).toBeNull();
    expect(tir.reflectance).toBe(1);

    const refract = computeSnellRefraction((30 * Math.PI) / 180, 1.0, 1.5);
    expect(refract.isTIR).toBe(false);
    expect(1.0 * Math.sin((30 * Math.PI) / 180)).toBeCloseTo(
      1.5 * Math.sin(refract.thetaTransRad!),
      12,
    );

    expect(cauchyIndex(410)).toBeGreaterThan(cauchyIndex(680));

    const lens = solveThinLens(6.0, 2.0);
    expect(1 / lens.imageDist + 1 / 6.0).toBeCloseTo(1 / 2.0, 12);

    const twoCrossed = evaluateMalusStack(0, 45, 90, false);
    const threeWith45 = evaluateMalusStack(0, 45, 90, true);
    expect(twoCrossed.i3).toBeCloseTo(0, 12);
    expect(threeWith45.i3).toBeCloseTo(0.125, 12);
  });

  it('Mechanics: RK4 double pendulum energy conservation, butterfly divergence, coupled modes, gyro precession', () => {
    const a = { theta1: 2.1, omega1: 0, theta2: 2.3, omega2: 0 };
    const b = { theta1: 2.101, omega1: 0, theta2: 2.3, omega2: 0 };
    const e0 = doublePendulumEnergy(a, 1, 1, 2, 2, 9.8);
    for (let i = 0; i < 1000; i++) {
      stepDoublePendulumRK4(a, 1, 1, 2, 2, 9.8, 0.012);
      stepDoublePendulumRK4(b, 1, 1, 2, 2, 9.8, 0.012);
    }
    const eEnd = doublePendulumEnergy(a, 1, 1, 2, 2, 9.8);
    expect(Math.abs(eEnd - e0) / Math.abs(e0)).toBeLessThan(1e-3);
    expect(Math.abs(a.theta2 - b.theta2)).toBeGreaterThan(0.05);

    const sym = evaluateCoupledModes(0, 2.4, 1.6, 1.0, 'symmetric');
    expect(sym.omega2).toBeGreaterThan(sym.omega1);

    expect(gyroPrecessionRate(1.2, 9.8, 0.8, 1.0, 20)).toBeGreaterThan(
      gyroPrecessionRate(1.2, 9.8, 0.8, 1.0, 40),
    );
  });

  it('Fluids: Venturi continuity & Bernoulli invariant, Kutta-Joukowski lift, and KdV soliton speeds', () => {
    const sIn = evaluateVenturi(-6, 2.6, 1.2, 10.0, 1.0, 100);
    const sTh = evaluateVenturi(0, 2.6, 1.2, 10.0, 1.0, 100);
    expect(sIn.area * sIn.velocity).toBeCloseTo(sTh.area * sTh.velocity, 10);
    expect(sIn.pressure + 0.5 * sIn.velocity ** 2).toBeCloseTo(
      sTh.pressure + 0.5 * sTh.velocity ** 2,
      10,
    );

    expect(kuttaJoukowskiLift(1.2, 3.0, 8.0)).toBeCloseTo(2 * kuttaJoukowskiLift(1.2, 3.0, 4.0), 10);
    const cyl = evaluateCylinderPotentialFlow(0, 2.5, 2.0, 1.5, 6.0);
    expect(cyl.ux).toBeGreaterThan(2.0);

    const hFast = evaluateKdvSoliton(-9.0 + 0.75 * 3.0 * 4.0, 4.0, 3.0, 1.0, -9.0, 0);
    expect(hFast).toBeGreaterThan(2.5);
  });

  it('Relativity & Nuclear: Lorentz interval invariance, contraction, half-life decay, and fission criticality', () => {
    const beta = 0.8;
    const g = lorentzGamma(beta);
    expect(contractedLength(10, beta)).toBeCloseTo(10 / g, 10);

    const x = 4.2;
    const ct = 7.5;
    const boosted = lorentzBoost(x, ct, beta);
    expect(boosted.ctPrime ** 2 - boosted.xPrime ** 2).toBeCloseTo(ct ** 2 - x ** 2, 10);

    expect(radioactiveRemaining(200, 5.0, 5.0)).toBeCloseTo(100, 10);
    expect(fissionKFactor(0.8, 0.1)).toBeGreaterThan(fissionKFactor(0.8, 0.9));
  });
});
