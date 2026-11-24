import { describe, expect, it } from 'vitest';
import { BOOK_VOLUMES } from '../src/data/bookCatalog';
import {
  computeElectricField,
  evaluateEmWave,
  evaluateFaradayCoil,
  evaluateHallEquilibrium,
  stepBorisLorentz,
} from '../src/physics/emPhysics';
import {
  DEFAULT_G,
  bodyMechanicalEnergy,
  circularSpeed,
  computeLagrangePoints,
  escapeSpeed,
  jacobiConstant,
  rocheEffectiveAccel,
  softenedCircularSpeed,
  stepRotatingThreeBody,
  stepVelocityVerlet,
} from '../src/physics/gravityPhysics';
import {
  QuantumHarmonicSolver,
  QuantumTunnelingSolver,
  evaluateVectorField,
} from '../src/physics/quantumWavePhysics';
import { NotebookStore } from '../src/ui/annotationsManager';

describe('Volumes II-IV First-Principles Physics Engines & Catalog', () => {
  it('Boris Lorentz pusher conserves speed in pure B-field and Coulomb superposition is exact', () => {
    const pos = { x: 3.0, y: 0, z: 0 };
    const vel = { x: 0, y: 1.5, z: 5.0 };
    const v0 = Math.hypot(vel.x, vel.y, vel.z);
    const E = { x: 0, y: 0, z: 0 };
    const B = { x: 0, y: 2.2, z: 0 };

    for (let i = 0; i < 500; i++) {
      stepBorisLorentz(pos, vel, E, B, 1.0, 0.01);
    }
    const vEnd = Math.hypot(vel.x, vel.y, vel.z);
    expect(Math.abs(vEnd - v0)).toBeLessThan(1e-10);

    const eDip = computeElectricField({ x: 0, y: 0, z: 0 }, [
      { x: -3, y: 0, z: 0, q: 1 },
      { x: 3, y: 0, z: 0, q: -1 },
    ]);
    expect(eDip.x).toBeGreaterThan(0);
    expect(Math.abs(eDip.y)).toBeLessThan(1e-12);
  });

  it('EM wave maintains exact E perp B and Faraday EMF matches -dPhi/dt', () => {
    for (const circular of [false, true]) {
      const w = evaluateEmWave(2.3, 0.75, 1.2, 6.0, 2.5, circular);
      const dotEB = w.E.x * w.B.x + w.E.y * w.B.y + w.E.z * w.B.z;
      expect(Math.abs(dotEB)).toBeLessThan(1e-12);
      expect(w.poynting.x).toBeGreaterThanOrEqual(0);
      if (circular) {
        expect(w.poynting.x).toBeCloseTo(2.5 * 2.5, 10);
      }
    }

    const t = 0.27;
    const dt = 1e-5;
    const f0 = evaluateFaradayCoil(t - dt, 1.3, 4.5, 8);
    const f1 = evaluateFaradayCoil(t + dt, 1.3, 4.5, 8);
    const fMid = evaluateFaradayCoil(t, 1.3, 4.5, 8);
    const numEmf = -(f1.fluxTotal - f0.fluxTotal) / (2 * dt);
    expect(Math.abs(fMid.emf - numEmf) / Math.abs(numEmf)).toBeLessThan(0.01);
  });

  it('Velocity-Verlet conserves orbital mechanical energy and escapeSpeed = sqrt(2) * circularSpeed', () => {
    const attractors = [{ x: 0, y: 0, z: 0, mass: 2.0, radius: 1.0 }];
    const r = 7.5;
    const v = softenedCircularSpeed(2.0, r);
    const body = { pos: { x: r, y: 0, z: 0 }, vel: { x: 0, y: 0, z: v } };
    const e0 = bodyMechanicalEnergy(body, attractors).total;

    for (let i = 0; i < 400; i++) {
      stepVelocityVerlet(body, attractors, 0.02);
    }
    const eEnd = bodyMechanicalEnergy(body, attractors).total;
    expect(Math.abs(eEnd - e0) / Math.abs(e0)).toBeLessThan(1e-3);

    expect(escapeSpeed(2.0, 5.0) / circularSpeed(2.0, 5.0)).toBeCloseTo(Math.SQRT2, 10);
  });

  it('Crank-Nicolson TDSE conserves probability norm and exhibits partial quantum tunneling', () => {
    const solver = new QuantumTunnelingSolver(180, 0.25);
    solver.reset(2.1, 1.6, 2.0);
    expect(solver.getNorm()).toBeCloseTo(1.0, 6);

    for (let i = 0; i < 200; i++) {
      solver.step(0.042);
    }
    expect(Math.abs(solver.getNorm() - 1.0)).toBeLessThan(1e-5);
    const probs = solver.getProbabilities();
    expect(probs.transmitted).toBeGreaterThan(0.01);
    expect(probs.transmitted).toBeLessThan(0.99);
    expect(probs.reflected + probs.barrier + probs.transmitted).toBeCloseTo(1.0, 5);

    const curl = evaluateVectorField(2, 0, 'curl');
    expect(Math.abs(curl.fx)).toBeLessThan(1e-12);
    expect(curl.fz).toBeGreaterThan(0);
  });

  it('Book Catalog defines 4 volumes and 25 unique chapters, and NotebookStore persists WorldPins', () => {
    expect(BOOK_VOLUMES.length).toBe(4);
    const chIds = new Set<string>();
    let total = 0;
    for (const vol of BOOK_VOLUMES) {
      for (const ch of vol.chapters) {
        expect(chIds.has(ch.id)).toBe(false);
        chIds.add(ch.id);
        expect(ch.simpleSummary.length).toBeGreaterThan(20);
        total++;
      }
    }
    expect(total).toBe(25);

    const store = new NotebookStore();
    const wp = store.addWorldPin('gravity', 'grav-well', 'central-star', 0, 1, 0, 'Heavy Star', 'Curves spacetime', 'gold');
    expect(store.getWorldPinsForChapter('gravity', 'grav-well').some((p) => p.id === wp.id)).toBe(true);
    expect(store.exportMarkdown()).toContain('Heavy Star');
    expect(store.deleteWorldPin(wp.id)).toBe(true);
  });

  it('Hall equilibrium cancels magnetic force and flips voltage sign between electrons and holes', () => {
    const I = 3.0;
    const By = 1.8;
    const W = 4.4;
    const T = 1.3;
    const n = 1.0;

    const eSample = evaluateHallEquilibrium(I, By, -1, W, T, n);
    const hSample = evaluateHallEquilibrium(I, By, 1, W, T, n);

    expect(Math.abs(-1 * eSample.hallFieldZ + eSample.magneticDeflectAccelZ)).toBeLessThan(1e-12);
    expect(Math.abs(1 * hSample.hallFieldZ + hSample.magneticDeflectAccelZ)).toBeLessThan(1e-12);

    const expectedMagV = (I * By) / (n * T);
    expect(eSample.hallVoltage).toBeCloseTo(-expectedMagV, 12);
    expect(hSample.hallVoltage).toBeCloseTo(expectedMagV, 12);
    expect(hSample.hallVoltage).toBeCloseTo(-eSample.hallVoltage, 12);
  });

  it('Lagrange L1-L5 satisfy zero effective acceleration and RK4 conserves Jacobi Constant', () => {
    const sep = 11.0;
    const mu = 0.03;
    const m1 = 3.0 * (1 - mu);
    const m2 = 3.0 * mu;
    const pts = computeLagrangePoints(m1, m2, sep);

    for (const key of ['L1', 'L2', 'L3', 'L4', 'L5'] as const) {
      const pt = pts[key];
      const acc = rocheEffectiveAccel(pt.x, pt.z, m1, m2, sep, DEFAULT_G, 0.0);
      expect(Math.abs(acc.ax)).toBeLessThan(1e-5);
      expect(Math.abs(acc.az)).toBeLessThan(1e-5);
    }

    const x1 = -mu * sep;
    const x2 = (1 - mu) * sep;
    expect(Math.hypot(pts.L4.x - x1, pts.L4.z)).toBeCloseTo(sep, 10);
    expect(Math.hypot(pts.L4.x - x2, pts.L4.z)).toBeCloseTo(sep, 10);
    expect(Math.hypot(pts.L5.x - x1, pts.L5.z)).toBeCloseTo(sep, 10);
    expect(Math.hypot(pts.L5.x - x2, pts.L5.z)).toBeCloseTo(sep, 10);

    const body = {
      pos: { x: pts.L4.x + 0.25, y: 0, z: pts.L4.z + 0.15 },
      vel: { x: 0.04, y: 0, z: 0.08 },
    };
    const c0 = jacobiConstant(body, m1, m2, sep, DEFAULT_G, 0.0);
    for (let i = 0; i < 300; i++) {
      stepRotatingThreeBody(body, m1, m2, sep, 0.02, DEFAULT_G, 0.0);
    }
    const cEnd = jacobiConstant(body, m1, m2, sep, DEFAULT_G, 0.0);
    expect(Math.abs(cEnd - c0) / Math.abs(c0)).toBeLessThan(1e-4);
  });

  it('Quantum Harmonic Oscillator preserves norm, ground energy, stationary n=1, and coherent swinging', () => {
    const omega = 0.45;
    const solver = new QuantumHarmonicSolver(180, 0.18);

    // 1. Ground state n=0 energy ~ 0.5 * omega
    solver.reset('eigenstate', 0, omega, 0);
    expect(Math.abs(solver.getNorm() - 1.0)).toBeLessThan(1e-6);
    const e0 = solver.getExpectedEnergy();
    expect(Math.abs(e0 - 0.5 * omega) / (0.5 * omega)).toBeLessThan(0.02);

    // 2. Stationary n=1 eigenstate keeps <x> ~ 0 and norm ~ 1
    solver.reset('eigenstate', 1, omega, 0);
    for (let i = 0; i < 180; i++) {
      solver.step(0.035);
    }
    expect(Math.abs(solver.getNorm() - 1.0)).toBeLessThan(1e-5);
    expect(Math.abs(solver.getExpectationX())).toBeLessThan(1e-4);

    // 3. Displaced coherent packet swings to negative <x> across half-period T/2 ~ 6.98
    solver.reset('coherent', 0, omega, 4.0);
    for (let i = 0; i < 180; i++) {
      solver.step(0.038);
    }
    expect(Math.abs(solver.getNorm() - 1.0)).toBeLessThan(1e-5);
    expect(solver.getExpectationX()).toBeLessThan(-2.0);
  });
});
