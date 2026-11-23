import { describe, expect, it } from 'vitest';
import {
  E_CHARGE,
  N_CU,
  RES_AREA_PHYS,
  V_FERMI_CU,
  WIRE_AREA_PHYS,
  createDefaultParams,
} from '../src/physics/constants';
import { PathGeometry } from '../src/physics/pathGeometry';
import { CircuitModel } from '../src/physics/circuitModel';
import { DrudeEngine, NUM_ELECTRONS } from '../src/physics/drudeEngine';

describe('DrudeEngine Carrier Dynamics & Edge Cases', () => {
  it('clamps huge dt (e.g. tab switch dt = 5.0 s) and keeps all carriers confined inside tubeRadius', () => {
    const params = createDefaultParams();
    const path = new PathGeometry(params.topology);
    const circuit = new CircuitModel(path, params);
    const engine = new DrudeEngine(path, circuit, params);
    const state = circuit.step(1 / 120, params);

    engine.step(5.0, circuit, state, path, params);

    for (let i = 0; i < NUM_ELECTRONS; i++) {
      const frame = path.sampleFrame(engine.s[i]);
      const r = Math.hypot(engine.u[i], engine.v[i]);
      expect(r).toBeLessThanOrEqual(frame.tubeRadius);
    }
  });

  it('maintains vigorous Fermi thermal motion with zero net drift when V_src = 0', () => {
    const params = createDefaultParams();
    params.voltage = 0;
    params.temperature = 300;
    const path = new PathGeometry(params.topology);
    const circuit = new CircuitModel(path, params);
    const engine = new DrudeEngine(path, circuit, params);

    const dt = 1 / 120;
    for (let step = 0; step < 240; step++) {
      const state = circuit.step(dt, params);
      engine.step(dt, circuit, state, path, params);
    }

    const state = circuit.getState();
    const { meanVDriftPhys, meanVInstPhys } = engine.getEnsembleSpeeds(circuit, state, params);
    expect(Math.abs(meanVDriftPhys)).toBeLessThan(1e-12);
    expect(meanVInstPhys).toBeCloseTo(V_FERMI_CU, -2);
    expect(engine.collisions).toBeGreaterThan(0);
  });

  it('enforces exact current continuity I = n * A * e * v_d across constricted resistors', () => {
    const params = createDefaultParams();
    params.topology = 'simple-r';
    params.voltage = 6.0;
    params.resistance = 10.0;

    const path = new PathGeometry(params.topology);
    const circuit = new CircuitModel(path, params);
    const engine = new DrudeEngine(path, circuit, params);
    const state = circuit.step(1 / 120, params);

    // Sample hero in copper wire
    engine.teleportHero(path.anchors.batteryEnd + 2.0, path, circuit);
    const wireTel = engine.getTelemetry(circuit, state, path, params);

    // Sample hero inside constricted resistor R1
    engine.teleportHero(0.5 * (path.anchors.res1Start + path.anchors.res1End), path, circuit);
    const resTel = engine.getTelemetry(circuit, state, path, params);

    expect(wireTel.vDrift).toBeCloseTo(state.current / (N_CU * E_CHARGE * WIRE_AREA_PHYS), 12);
    expect(resTel.vDrift).toBeCloseTo(state.current / (N_CU * E_CHARGE * RES_AREA_PHYS), 12);

    const expectedRatio = WIRE_AREA_PHYS / RES_AREA_PHYS;
    expect(resTel.vDrift / wireTel.vDrift).toBeCloseTo(expectedRatio, 9);
  });

  it('forbids any electron from entering the capacitor insulating dielectric gap', () => {
    const params = createDefaultParams();
    params.topology = 'rc';
    params.voltage = 12.0;
    params.resistance = 5.0;
    params.autoCapHandoff = false;

    const path = new PathGeometry('rc');
    const circuit = new CircuitModel(path, params);
    const engine = new DrudeEngine(path, circuit, params);

    const gapStart = path.anchors.capGapStart!;
    const gapEnd = path.anchors.capGapEnd!;
    expect(gapEnd).toBeGreaterThan(gapStart);

    // Place hero right next to negative capacitor plate to force repeated collisions
    engine.teleportHero(gapStart - 0.3, path, circuit);

    const dt = 1 / 120;
    let gapViolations = 0;
    for (let step = 0; step < 600; step++) {
      const state = circuit.step(dt, params);
      engine.step(dt, circuit, state, path, params);

      for (let i = 0; i < NUM_ELECTRONS; i++) {
        const si = engine.s[i];
        if (si > gapStart && si < gapEnd) {
          gapViolations++;
        }
      }
    }
    expect(gapViolations).toBe(0);
  });

  it('increments collision counts and heats lattice ions inside the active resistor (Joule heating)', () => {
    const params = createDefaultParams();
    params.topology = 'simple-r';
    params.voltage = 12.0;
    params.resistance = 10.0;

    const path = new PathGeometry('simple-r');
    const circuit = new CircuitModel(path, params);
    const engine = new DrudeEngine(path, circuit, params);

    // Place hero inside resistor
    engine.teleportHero(0.5 * (path.anchors.res1Start + path.anchors.res1End), path, circuit);

    const dt = 1 / 120;
    let prevCollisions = 0;
    for (let step = 0; step < 180; step++) {
      const state = circuit.step(dt, params);
      engine.step(dt, circuit, state, path, params);
      expect(engine.collisions).toBeGreaterThanOrEqual(prevCollisions);
      prevCollisions = engine.collisions;
    }

    expect(engine.collisions).toBeGreaterThan(15);

    let maxResHeat = 0;
    for (let i = 0; i < engine.ions.length; i++) {
      if (engine.ions[i].segmentKind === 'resistor') {
        maxResHeat = Math.max(maxResHeat, engine.ionHeat[i]);
      }
    }
    expect(maxResHeat).toBeGreaterThan(0.15);
  });
});
