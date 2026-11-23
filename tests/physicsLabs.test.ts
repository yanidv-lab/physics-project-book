import { describe, expect, it } from 'vitest';
import { BOOK_VOLUMES } from '../src/data/bookCatalog';
import {
  computeElectricField,
  evaluateEmWave,
  evaluateFaradayCoil,
  stepBorisLorentz,
} from '../src/physics/emPhysics';
import {
  bodyMechanicalEnergy,
  circularSpeed,
  escapeSpeed,
  softenedCircularSpeed,
  stepVelocityVerlet,
} from '../src/physics/gravityPhysics';
import {
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

  it('Book Catalog defines 4 volumes and 21 unique chapters, and NotebookStore persists WorldPins', () => {
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
    expect(total).toBe(21);

    const store = new NotebookStore();
    const wp = store.addWorldPin('gravity', 'grav-well', 'central-star', 0, 1, 0, 'Heavy Star', 'Curves spacetime', 'gold');
    expect(store.getWorldPinsForChapter('gravity', 'grav-well').some((p) => p.id === wp.id)).toBe(true);
    expect(store.exportMarkdown()).toContain('Heavy Star');
    expect(store.deleteWorldPin(wp.id)).toBe(true);
  });
});
