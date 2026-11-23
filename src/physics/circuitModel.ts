import type {
  CircuitState,
  SampledCircuitPoint,
  SegmentFieldState,
  SegmentSpec,
  SimParams,
  TopologyId,
} from '../types/simulation';
import {
  BATTERY_INTERNAL_R,
  CAP_PLATE_AREA_PHYS,
  RES_AREA_PHYS,
  RES_TUBE_RADIUS,
  WIRE_AREA_PHYS,
  WIRE_TUBE_RADIUS,
  copperResistivity,
  drudeTau,
  resistorTempFactor,
  wrapS,
} from './constants';
import { MNASolver, type MNANetlist } from './mnaSolver';
import { PathGeometry } from './pathGeometry';

const PHYS_METERS_PER_SCENE_UNIT = 0.01; // 1 cm per world unit (~1 m loop)

interface ReactiveState {
  capV: number;
  capI: number;
  indV: number;
  indI: number;
  prevI: number;
  needsBackwardEuler: boolean;
  lastTopology: TopologyId;
  lastDischargeFlag: boolean;
}

/**
 * Bridges exact Modified Nodal Analysis (MNA) macro-circuit solutions to
 * continuous 1D curvilinear electrodynamics along the closed loop.
 */
export class CircuitModel {
  private path: PathGeometry;
  private segments: SegmentSpec[] = [];
  private state: CircuitState;
  private reactive: ReactiveState;

  constructor(path: PathGeometry, initialParams: SimParams) {
    this.path = path;
    this.reactive = {
      capV: 0,
      capI: 0,
      indV: 0,
      indI: 0,
      prevI: 0,
      needsBackwardEuler: true,
      lastTopology: initialParams.topology,
      lastDischargeFlag: initialParams.rcDischarging,
    };
    this.segments = this.buildSegments(initialParams);
    this.state = this.solveInstantaneousOrStep(0.001, initialParams, false);
  }

  public setPath(path: PathGeometry, params: SimParams): void {
    this.path = path;
    this.resetState(params);
  }

  public resetState(params: SimParams): void {
    this.reactive = {
      capV: 0,
      capI: 0,
      indV: 0,
      indI: 0,
      prevI: 0,
      needsBackwardEuler: true,
      lastTopology: params.topology,
      lastDischargeFlag: params.rcDischarging,
    };
    this.segments = this.buildSegments(params);
    this.state = this.solveInstantaneousOrStep(0.001, params, false);
    // Reset time to 0 on clean reset
    this.state.time = 0;
  }

  public getSegments(): readonly SegmentSpec[] {
    return this.segments;
  }

  public getState(): CircuitState {
    return this.state;
  }

  public getPath(): PathGeometry {
    return this.path;
  }

  /**
   * Computes exact segment specifications and resistances for the active topology & temperature.
   * Node 0 is always battery (-) terminal (ground, V = 0 V).
   */
  private buildSegments(params: SimParams): SegmentSpec[] {
    const a = this.path.anchors;
    const rhoCu = copperResistivity(params.temperature);
    const tResFactor = resistorTempFactor(params.temperature);
    const r1Val = Math.max(0.1, params.resistance * tResFactor);
    const r2Val = Math.max(0.1, params.resistance2 * tResFactor);

    const makeWire = (
      id: string,
      label: string,
      sStart: number,
      sEnd: number,
      nodeStart: number,
      nodeEnd: number,
    ): SegmentSpec => {
      const physLen = Math.max(1e-4, (sEnd - sStart) * PHYS_METERS_PER_SCENE_UNIT);
      const r = (rhoCu * physLen) / WIRE_AREA_PHYS;
      return {
        id,
        kind: 'wire',
        label,
        sStart,
        sEnd,
        physicalLength: physLen,
        physicalArea: WIRE_AREA_PHYS,
        tubeRadius: WIRE_TUBE_RADIUS,
        resistivity: rhoCu,
        nodeStart,
        nodeEnd,
        resistance: r,
      };
    };

    const makeResistor = (
      id: string,
      kind: 'resistor' | 'resistor2',
      label: string,
      sStart: number,
      sEnd: number,
      nodeStart: number,
      nodeEnd: number,
      resistance: number,
    ): SegmentSpec => {
      const physLen = Math.max(1e-4, (sEnd - sStart) * PHYS_METERS_PER_SCENE_UNIT);
      const rhoEff = (resistance * RES_AREA_PHYS) / physLen;
      return {
        id,
        kind,
        label,
        sStart,
        sEnd,
        physicalLength: physLen,
        physicalArea: RES_AREA_PHYS,
        tubeRadius: RES_TUBE_RADIUS,
        resistivity: rhoEff,
        nodeStart,
        nodeEnd,
        resistance,
      };
    };

    const batPhysLen = (a.batteryEnd - a.batteryStart) * PHYS_METERS_PER_SCENE_UNIT;
    const batRhoEff = (BATTERY_INTERNAL_R * WIRE_AREA_PHYS) / batPhysLen;

    if (params.topology === 'simple-r') {
      // Nodes: 0 = bat(-), 1 = EMF internal, 2 = bat(+), 3 = R1 start, 4 = R1 end
      const bat: SegmentSpec = {
        id: 'battery',
        kind: 'battery',
        label: 'EMF Source (Battery)',
        sStart: a.batteryStart,
        sEnd: a.batteryEnd,
        physicalLength: batPhysLen,
        physicalArea: WIRE_AREA_PHYS,
        tubeRadius: WIRE_TUBE_RADIUS,
        resistivity: batRhoEff,
        nodeStart: 2,
        nodeEnd: 0,
        resistance: BATTERY_INTERNAL_R,
      };
      const w1 = makeWire('wire-1', 'Copper Wire (Left Rail)', a.batteryEnd, a.res1Start, 0, 3);
      const r1 = makeResistor('resistor-1', 'resistor', 'Load Resistor R₁', a.res1Start, a.res1End, 3, 4, r1Val);
      const w2 = makeWire('wire-2', 'Copper Wire (Right Rail)', a.res1End, a.totalLength, 4, 2);
      return [bat, w1, r1, w2];
    }

    if (params.topology === 'divider') {
      // Nodes: 0=bat(-), 1=EMF internal, 2=bat(+), 3=R1 start, 4=R1 end, 5=R2 start, 6=R2 end
      const bat: SegmentSpec = {
        id: 'battery',
        kind: 'battery',
        label: 'EMF Source (Battery)',
        sStart: a.batteryStart,
        sEnd: a.batteryEnd,
        physicalLength: batPhysLen,
        physicalArea: WIRE_AREA_PHYS,
        tubeRadius: WIRE_TUBE_RADIUS,
        resistivity: batRhoEff,
        nodeStart: 2,
        nodeEnd: 0,
        resistance: BATTERY_INTERNAL_R,
      };
      const r2Start = a.res2Start ?? a.res1End + 8;
      const r2End = a.res2End ?? r2Start + 8;
      const w1 = makeWire('wire-1', 'Copper Wire (Left Rail)', a.batteryEnd, a.res1Start, 0, 3);
      const r1 = makeResistor('resistor-1', 'resistor', 'Resistor R₁', a.res1Start, a.res1End, 3, 4, r1Val);
      const w2 = makeWire('wire-2', 'Copper Mid-Node (V_div)', a.res1End, r2Start, 4, 5);
      const r2 = makeResistor('resistor-2', 'resistor2', 'Resistor R₂', r2Start, r2End, 5, 6, r2Val);
      const w3 = makeWire('wire-3', 'Copper Wire (Return)', r2End, a.totalLength, 6, 2);
      return [bat, w1, r1, w2, r2, w3];
    }

    if (params.topology === 'rc') {
      // Nodes: 0=bat(-), 1=EMF internal, 2=bat(+), 3=R1 start, 4=R1 end, 5=Cap(-), 6=Cap(+)
      const bat: SegmentSpec = {
        id: 'battery',
        kind: 'battery',
        label: params.rcDischarging ? 'Shorted Switch (0 V Discharge)' : 'EMF Source (Battery)',
        sStart: a.batteryStart,
        sEnd: a.batteryEnd,
        physicalLength: batPhysLen,
        physicalArea: WIRE_AREA_PHYS,
        tubeRadius: WIRE_TUBE_RADIUS,
        resistivity: batRhoEff,
        nodeStart: 2,
        nodeEnd: 0,
        resistance: BATTERY_INTERNAL_R,
      };
      const capStart = a.capStart ?? a.res1End + 10;
      const capEnd = a.capEnd ?? capStart + 3.2;
      const capPhysLen = Math.max(1e-4, (a.capGapEnd! - a.capGapStart!) * PHYS_METERS_PER_SCENE_UNIT);

      const w1 = makeWire('wire-1', 'Copper Wire (Left Rail)', a.batteryEnd, a.res1Start, 0, 3);
      const r1 = makeResistor('resistor-1', 'resistor', 'Resistor R₁', a.res1Start, a.res1End, 3, 4, r1Val);
      const w2a = makeWire('wire-2a', 'Copper Wire (to Cap −)', a.res1End, capStart, 4, 5);
      const cap: SegmentSpec = {
        id: 'capacitor',
        kind: 'capacitor',
        label: 'Capacitor C (Dielectric Gap)',
        sStart: capStart,
        sEnd: capEnd,
        physicalLength: capPhysLen,
        physicalArea: CAP_PLATE_AREA_PHYS,
        tubeRadius: WIRE_TUBE_RADIUS,
        resistivity: 1e12,
        nodeStart: 5,
        nodeEnd: 6,
        resistance: Infinity,
      };
      const w2b = makeWire('wire-2b', 'Copper Wire (Cap + to Bat +)', capEnd, a.totalLength, 6, 2);
      return [bat, w1, r1, w2a, cap, w2b];
    }

    // topology === 'rlc'
    // Nodes: 0=bat(-), 1=EMF internal, 2=bat(+), 3=Ind start, 4=Ind coil-internal, 5=Ind end,
    //        6=R1 start, 7=R1 end, 8=Cap(-), 9=Cap(+)
    const bat: SegmentSpec = {
      id: 'battery',
      kind: 'battery',
      label: 'EMF Source (Battery)',
      sStart: a.batteryStart,
      sEnd: a.batteryEnd,
      physicalLength: batPhysLen,
      physicalArea: WIRE_AREA_PHYS,
      tubeRadius: WIRE_TUBE_RADIUS,
      resistivity: batRhoEff,
      nodeStart: 2,
      nodeEnd: 0,
      resistance: BATTERY_INTERNAL_R,
    };
    const indStart = a.inductorStart ?? a.batteryEnd + 8;
    const indEnd = a.inductorEnd ?? indStart + 30;
    const indPhysLen = Math.max(1e-4, (indEnd - indStart) * PHYS_METERS_PER_SCENE_UNIT);
    const indCoilR = (rhoCu * indPhysLen) / WIRE_AREA_PHYS;

    const capStart = a.capStart ?? a.res1End + 10;
    const capEnd = a.capEnd ?? capStart + 3.2;
    const capPhysLen = Math.max(1e-4, (a.capGapEnd! - a.capGapStart!) * PHYS_METERS_PER_SCENE_UNIT);

    const w1a = makeWire('wire-1a', 'Copper Wire (to Inductor)', a.batteryEnd, indStart, 0, 3);
    const ind: SegmentSpec = {
      id: 'inductor',
      kind: 'inductor',
      label: 'Helical Inductor L',
      sStart: indStart,
      sEnd: indEnd,
      physicalLength: indPhysLen,
      physicalArea: WIRE_AREA_PHYS,
      tubeRadius: WIRE_TUBE_RADIUS,
      resistivity: rhoCu,
      nodeStart: 3,
      nodeEnd: 5,
      resistance: indCoilR,
    };
    const w1b = makeWire('wire-1b', 'Copper Wire (Inductor to R₁)', indEnd, a.res1Start, 5, 6);
    const r1 = makeResistor('resistor-1', 'resistor', 'Resistor R₁', a.res1Start, a.res1End, 6, 7, r1Val);
    const w2a = makeWire('wire-2a', 'Copper Wire (to Cap −)', a.res1End, capStart, 7, 8);
    const cap: SegmentSpec = {
      id: 'capacitor',
      kind: 'capacitor',
      label: 'Capacitor C (Dielectric Gap)',
      sStart: capStart,
      sEnd: capEnd,
      physicalLength: capPhysLen,
      physicalArea: CAP_PLATE_AREA_PHYS,
      tubeRadius: WIRE_TUBE_RADIUS,
      resistivity: 1e12,
      nodeStart: 8,
      nodeEnd: 9,
      resistance: Infinity,
    };
    const w2b = makeWire('wire-2b', 'Copper Wire (Cap + to Bat +)', capEnd, a.totalLength, 9, 2);
    return [bat, w1a, ind, w1b, r1, w2a, cap, w2b];
  }

  public step(dt: number, params: SimParams): CircuitState {
    if (params.topology !== this.reactive.lastTopology) {
      this.reactive.lastTopology = params.topology;
      this.reactive.needsBackwardEuler = true;
    }
    if (params.rcDischarging !== this.reactive.lastDischargeFlag) {
      this.reactive.lastDischargeFlag = params.rcDischarging;
      this.reactive.needsBackwardEuler = true;
    }

    this.segments = this.buildSegments(params);
    this.state = this.solveInstantaneousOrStep(dt, params, true);
    return this.state;
  }

  private solveInstantaneousOrStep(
    dt: number,
    params: SimParams,
    advanceTime: boolean,
  ): CircuitState {
    const nextTime = advanceTime ? (this.state ? this.state.time + dt : dt) : 0;
    const isRcDischarge = params.topology === 'rc' && params.rcDischarging;
    const sourceVoltage = isRcDischarge
      ? 0
      : params.sourceMode === 'ac'
        ? params.voltage * Math.sin(2 * Math.PI * params.acFrequency * nextTime)
        : params.voltage;

    const netlist: MNANetlist = {
      numNodes: 2,
      resistors: [],
      voltageSources: [{ nPos: 1, nNeg: 0, voltage: sourceVoltage }],
      capacitors: [],
      inductors: [],
    };

    // Internal battery resistor r_int between node 1 (ideal EMF +) and node 2 (external + terminal)
    netlist.resistors.push({ n1: 1, n2: 2, resistance: BATTERY_INTERNAL_R });

    let maxNode = 2;
    for (const seg of this.segments) {
      maxNode = Math.max(maxNode, seg.nodeStart, seg.nodeEnd);
      if (seg.kind === 'battery') continue;
      if (seg.kind === 'wire' || seg.kind === 'resistor' || seg.kind === 'resistor2') {
        netlist.resistors.push({
          n1: seg.nodeStart,
          n2: seg.nodeEnd,
          resistance: seg.resistance,
        });
      } else if (seg.kind === 'capacitor') {
        netlist.capacitors.push({
          id: 'cap',
          nPos: seg.nodeEnd, // + plate toward Bat(+)
          nNeg: seg.nodeStart, // - plate toward R1/Bat(-)
          capacitance: Math.max(1e-6, params.capacitance),
          prevV: this.reactive.capV,
          prevI: this.reactive.capI,
        });
      } else if (seg.kind === 'inductor') {
        // Split inductor segment into coil resistance (nodeStart -> node 4) and ideal L (node 4 -> nodeEnd)
        maxNode = Math.max(maxNode, 4);
        netlist.resistors.push({
          n1: seg.nodeStart,
          n2: 4,
          resistance: seg.resistance,
        });
        netlist.inductors.push({
          id: 'ind',
          nPos: seg.nodeEnd, // conventional current enters nodeEnd and leaves node 4 toward nodeStart
          nNeg: 4,
          inductance: Math.max(1e-4, params.inductance),
          prevV: this.reactive.indV,
          prevI: this.reactive.indI,
        });
      }
    }
    netlist.numNodes = maxNode;

    const useBE = this.reactive.needsBackwardEuler;
    const sol = MNASolver.solve(netlist, Math.max(1e-6, dt), useBE);

    if (advanceTime) {
      this.reactive.needsBackwardEuler = false;
      if (sol.capacitorStates.cap) {
        this.reactive.capV = sol.capacitorStates.cap.v;
        this.reactive.capI = sol.capacitorStates.cap.i;
      }
      if (sol.inductorStates.ind) {
        this.reactive.indV = sol.inductorStates.ind.v;
        this.reactive.indI = sol.inductorStates.ind.i;
      }
    }

    // MNA sourceCurrents[0] is current flowing into nPos internally (nPos -> nNeg);
    // delivered conventional current exiting Battery (+) terminal is -sourceCurrents[0].
    const current = -(sol.sourceCurrents[0] ?? 0);
    const dIdt = advanceTime && dt > 0 ? (current - this.reactive.prevI) / dt : 0;
    if (advanceTime) {
      this.reactive.prevI = current;
    }

    const capV = sol.capacitorStates.cap ? sol.capacitorStates.cap.v : 0;
    const capQ = (params.topology === 'rc' || params.topology === 'rlc')
      ? params.capacitance * capV
      : 0;
    const displacementCurrentDensity = (params.topology === 'rc' || params.topology === 'rlc')
      ? current / CAP_PLATE_AREA_PHYS
      : 0;

    const indV = sol.inductorStates.ind ? sol.inductorStates.ind.v : 0;
    const indBackEmf = -indV;

    const segmentFields: Record<string, SegmentFieldState> = {};
    let totalPower = 0;

    for (const seg of this.segments) {
      const vStart = sol.nodeVoltages[seg.nodeStart] ?? 0;
      const vEnd = sol.nodeVoltages[seg.nodeEnd] ?? 0;

      if (seg.kind === 'battery') {
        // Inside battery (from + at sStart to - at sEnd):
        // Electrostatic field E_elec points from + to - (+T): E_elec = -(0 - vStart) / L = +vStart / L
        const E_elec = -(vEnd - vStart) / seg.physicalLength;
        const f_chem = sourceVoltage / seg.physicalLength; // chemical drive magnitude opposing E_elec
        const E_axial = E_elec;
        const power = current * current * seg.resistance;
        totalPower += power;
        segmentFields[seg.id] = {
          E_axial,
          E_elec,
          E_ind: 0,
          f_chem,
          V_start: vStart,
          V_end: vEnd,
          power,
          resistivity: seg.resistivity,
          tauPhys: drudeTau(seg.resistivity),
        };
      } else if (seg.kind === 'capacitor') {
        const E_elec = -(vEnd - vStart) / seg.physicalLength;
        segmentFields[seg.id] = {
          E_axial: E_elec,
          E_elec,
          E_ind: 0,
          f_chem: 0,
          V_start: vStart,
          V_end: vEnd,
          power: 0,
          resistivity: seg.resistivity,
          tauPhys: 0,
        };
      } else if (seg.kind === 'inductor') {
        const E_elec = -(vEnd - vStart) / seg.physicalLength;
        const E_ind = indV / seg.physicalLength; // -dA/dt opposes changing current
        const E_axial = (-current * seg.resistivity) / seg.physicalArea;
        const power = current * current * seg.resistance;
        totalPower += power;
        segmentFields[seg.id] = {
          E_axial,
          E_elec,
          E_ind,
          f_chem: 0,
          V_start: vStart,
          V_end: vEnd,
          power,
          resistivity: seg.resistivity,
          tauPhys: drudeTau(seg.resistivity),
        };
      } else {
        // Wire or Resistor: E_axial = -I * rho / A = -(V_end - V_start) / L
        const E_elec = -(vEnd - vStart) / seg.physicalLength;
        const power = current * current * seg.resistance;
        totalPower += power;
        segmentFields[seg.id] = {
          E_axial: E_elec,
          E_elec,
          E_ind: 0,
          f_chem: 0,
          V_start: vStart,
          V_end: vEnd,
          power,
          resistivity: seg.resistivity,
          tauPhys: drudeTau(seg.resistivity),
        };
      }
    }

    return {
      time: nextTime,
      sourceVoltage,
      current,
      dIdt,
      nodeVoltages: sol.nodeVoltages,
      capacitorVoltage: capV,
      capacitorCharge: capQ,
      displacementCurrentDensity,
      inductorVoltage: indV,
      inductorBackEmf: indBackEmf,
      totalPower,
      segmentFields,
    };
  }

  public sampleAtS(s: number): SampledCircuitPoint {
    const wrapped = wrapS(s, this.path.totalLength);
    let seg = this.segments[this.segments.length - 1];
    for (const candidate of this.segments) {
      if (wrapped >= candidate.sStart && wrapped <= candidate.sEnd) {
        seg = candidate;
        break;
      }
    }

    const field = this.state.segmentFields[seg.id];
    const span = Math.max(1e-6, seg.sEnd - seg.sStart);
    const t = Math.max(0, Math.min(1, (wrapped - seg.sStart) / span));

    const a = this.path.anchors;
    const isInsideCapacitorGap =
      a.capGapStart !== null &&
      a.capGapEnd !== null &&
      wrapped > a.capGapStart &&
      wrapped < a.capGapEnd;

    let localV = field.V_start + (field.V_end - field.V_start) * t;
    if (seg.kind === 'capacitor' && a.capGapStart !== null && a.capGapEnd !== null) {
      if (wrapped <= a.capGapStart) {
        localV = field.V_start;
      } else if (wrapped >= a.capGapEnd) {
        localV = field.V_end;
      } else {
        const gapT = (wrapped - a.capGapStart) / Math.max(1e-6, a.capGapEnd - a.capGapStart);
        localV = field.V_start + (field.V_end - field.V_start) * gapT;
      }
    }

    // Reference electrostatic potential mean around circuit for normalized surface charge sigma(s)
    const vMidRef = 0.5 * (this.state.nodeVoltages[2] ?? this.state.sourceVoltage);
    const vScale = Math.max(1.0, Math.abs(this.state.sourceVoltage), Math.abs(this.state.capacitorVoltage));
    const sigma = (localV - vMidRef) / vScale;

    return {
      localV,
      localU_eV: -localV,
      E_axial: field.E_axial,
      E_elec: field.E_elec,
      E_ind: field.E_ind,
      f_chem: field.f_chem,
      sigma,
      tauPhys: field.tauPhys,
      segment: seg,
      isInsideCapacitorGap,
    };
  }
}
