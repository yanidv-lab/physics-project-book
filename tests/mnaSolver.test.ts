import { describe, expect, it } from 'vitest';
import { createDefaultParams, BATTERY_INTERNAL_R } from '../src/physics/constants';
import { PathGeometry } from '../src/physics/pathGeometry';
import { CircuitModel } from '../src/physics/circuitModel';

describe('MNA Solver & CircuitModel Physics', () => {
  it('solves Simple R-Loop matching exact Ohm Law, KVL, and E = I * rho / A', () => {
    const params = createDefaultParams();
    params.topology = 'simple-r';
    params.voltage = 10.0;
    params.resistance = 20.0;
    params.temperature = 300;

    const path = new PathGeometry('simple-r');
    const circuit = new CircuitModel(path, params);
    const state = circuit.step(1 / 120, params);

    const segs = circuit.getSegments();
    const totalR = segs.reduce((acc, s) => acc + s.resistance, 0);
    const expectedI = params.voltage / totalR;

    expect(state.current).toBeCloseTo(expectedI, 10);

    // KVL around closed loop: sum of (V_end - V_start) over passive elements + internal drop equals V_src
    let externalDrop = 0;
    for (const seg of segs) {
      if (seg.kind === 'battery') continue;
      const f = state.segmentFields[seg.id];
      externalDrop += f.V_end - f.V_start;
    }
    const internalDrop = state.current * BATTERY_INTERNAL_R;
    expect(externalDrop + internalDrop).toBeCloseTo(params.voltage, 10);

    // Check E = I * rho / A = -Delta V / L on resistor and copper wires
    for (const seg of segs) {
      if (seg.kind === 'battery') continue;
      const f = state.segmentFields[seg.id];
      const expectedE = (-state.current * seg.resistivity) / seg.physicalArea;
      const eFromDeltaV = -(f.V_end - f.V_start) / seg.physicalLength;
      expect(f.E_axial).toBeCloseTo(expectedE, 8);
      expect(f.E_axial).toBeCloseTo(eFromDeltaV, 8);
    }
  });

  it('produces exact zero current, electric field, and power at V_src = 0', () => {
    const params = createDefaultParams();
    params.topology = 'simple-r';
    params.voltage = 0;
    params.resistance = 10;

    const path = new PathGeometry('simple-r');
    const circuit = new CircuitModel(path, params);
    const state = circuit.step(1 / 120, params);

    expect(Math.abs(state.current)).toBeLessThan(1e-14);
    expect(Math.abs(state.totalPower)).toBeLessThan(1e-14);
    for (const seg of circuit.getSegments()) {
      expect(Math.abs(state.segmentFields[seg.id].E_axial)).toBeLessThan(1e-14);
    }
  });

  it('computes exact node potentials and distinct E-fields in Series R1 + R2 Divider', () => {
    const params = createDefaultParams();
    params.topology = 'divider';
    params.voltage = 12.0;
    params.resistance = 10.0;
    params.resistance2 = 30.0;
    params.temperature = 300;

    const path = new PathGeometry('divider');
    const circuit = new CircuitModel(path, params);
    const state = circuit.step(1 / 120, params);

    const segs = circuit.getSegments();
    const r1Seg = segs.find((s) => s.id === 'resistor-1')!;
    const r2Seg = segs.find((s) => s.id === 'resistor-2')!;
    const f1 = state.segmentFields['resistor-1'];
    const f2 = state.segmentFields['resistor-2'];

    // V_mid at node 4 (after R1 from ground side):
    // Electron flow: 0 (bat-) -> wire1 -> node 3 -> R1 -> node 4 -> wire2 -> node 5 -> R2 -> node 6 -> wire3 -> node 2 (bat+)
    const rBeforeMid = segs
      .filter((s) => s.id === 'wire-1' || s.id === 'resistor-1')
      .reduce((acc, s) => acc + s.resistance, 0);
    const rTotal = segs.reduce((acc, s) => acc + s.resistance, 0);
    const expectedVMid = params.voltage * (rBeforeMid / rTotal);

    expect(state.nodeVoltages[4]).toBeCloseTo(expectedVMid, 8);
    expect(Math.abs(f2.V_end - f2.V_start) / Math.abs(f1.V_end - f1.V_start)).toBeCloseTo(
      r2Seg.resistance / r1Seg.resistance,
      8,
    );
    expect(Math.abs(f2.E_axial)).toBeGreaterThan(Math.abs(f1.E_axial) * 2.5);
  });

  it('matches analytical RC charging and discharging curves within 0.5%', () => {
    const params = createDefaultParams();
    params.topology = 'rc';
    params.voltage = 10.0;
    params.resistance = 100.0;
    params.capacitance = 0.01; // tau ~ 1.002 s
    params.temperature = 300;

    const path = new PathGeometry('rc');
    const circuit = new CircuitModel(path, params);
    const segs = circuit.getSegments();
    const totalSeriesR = segs
      .filter((s) => s.kind !== 'capacitor')
      .reduce((acc, s) => acc + s.resistance, 0);
    const tau = totalSeriesR * params.capacitance;

    const dt = 1 / 120;
    const steps = Math.round(tau / dt);
    const actualT = steps * dt;

    for (let i = 0; i < steps; i++) {
      circuit.step(dt, params);
    }
    const vcCharged = circuit.getState().capacitorVoltage;
    const expectedCharged = params.voltage * (1 - Math.exp(-actualT / tau));
    const relErrCharge = Math.abs(vcCharged - expectedCharged) / expectedCharged;
    expect(relErrCharge).toBeLessThan(0.005);

    // Switch to discharge (source shorted to 0 V) for another 1 tau
    params.rcDischarging = true;
    const v0 = vcCharged;
    for (let i = 0; i < steps; i++) {
      circuit.step(dt, params);
    }
    const vcDischarged = circuit.getState().capacitorVoltage;
    const expectedDischarged = v0 * Math.exp(-actualT / tau);
    const relErrDischarge = Math.abs(vcDischarged - expectedDischarged) / expectedDischarged;
    expect(relErrDischarge).toBeLessThan(0.005);
  });

  it('produces underdamped RLC resonance matching analytical damped frequency within 2%', () => {
    const params = createDefaultParams();
    params.topology = 'rlc';
    params.voltage = 10.0;
    params.resistance = 5.0;
    params.inductance = 2.5;
    params.capacitance = 0.004;
    params.temperature = 300;

    const path = new PathGeometry('rlc');
    const circuit = new CircuitModel(path, params);
    const segs = circuit.getSegments();
    const totalR = segs
      .filter((s) => s.kind !== 'capacitor')
      .reduce((acc, s) => acc + s.resistance, 0);

    const omega0Sq = 1 / (params.inductance * params.capacitance);
    const alpha = totalR / (2 * params.inductance);
    const omegaD = Math.sqrt(omega0Sq - alpha * alpha);
    const expectedHalfPeriod = Math.PI / omegaD;

    const dt = 1 / 240;
    const totalSimTime = 2.0; // > 3 half-periods (T_d ~ 0.629 s)
    const steps = Math.round(totalSimTime / dt);
    const zeroCrossings: number[] = [];
    let prevI = 0;

    for (let k = 1; k <= steps; k++) {
      const st = circuit.step(dt, params);
      if (k > 5 && ((prevI > 0 && st.current <= 0) || (prevI < 0 && st.current >= 0))) {
        // Linear interpolation for accurate zero-crossing time
        const frac = Math.abs(prevI) / (Math.abs(prevI) + Math.abs(st.current));
        zeroCrossings.push((k - 1 + frac) * dt);
      }
      prevI = st.current;
    }

    expect(zeroCrossings.length).toBeGreaterThanOrEqual(3);
    const measuredHalfPeriod = zeroCrossings[1] - zeroCrossings[0];
    const relFreqErr = Math.abs(measuredHalfPeriod - expectedHalfPeriod) / expectedHalfPeriod;
    expect(relFreqErr).toBeLessThan(0.02);
  });
});
