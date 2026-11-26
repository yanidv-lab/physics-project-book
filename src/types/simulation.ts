export type TopicId =
  | 'circuits'
  | 'em'
  | 'gravity'
  | 'waves'
  | 'thermo'
  | 'optics'
  | 'mechanics'
  | 'fluids'
  | 'relativity'
  | 'nuclear';
export type TopologyId = 'simple-r' | 'rc' | 'rlc' | 'divider';
export type SourceMode = 'dc' | 'ac';
export type CameraMode = 'locked-drift' | 'raw-pov' | 'side-cutaway' | 'macro-overview';
export type SegmentKind = 'battery' | 'wire' | 'resistor' | 'resistor2' | 'capacitor' | 'inductor';

export interface LayerVisibility {
  electricField: boolean;
  surfaceCharge: boolean;
  potentialLandscape: boolean;
  phononGlow: boolean;
  magneticField: boolean;
}

export interface SimParams {
  topology: TopologyId;
  sourceMode: SourceMode;
  voltage: number;
  acFrequency: number;
  resistance: number;
  resistance2: number;
  capacitance: number;
  inductance: number;
  rcDischarging: boolean;
  autoCapHandoff: boolean;
  temperature: number;
  scaleCompression: number;
  timeDilation: number;
  paused: boolean;
  layers: LayerVisibility;
}

export interface SegmentSpec {
  id: string;
  kind: SegmentKind;
  label: string;
  sStart: number;
  sEnd: number;
  physicalLength: number;
  physicalArea: number;
  tubeRadius: number;
  resistivity: number;
  nodeStart: number;
  nodeEnd: number;
  resistance: number;
}

export interface SegmentFieldState {
  E_axial: number;
  E_elec: number;
  E_ind: number;
  f_chem: number;
  V_start: number;
  V_end: number;
  power: number;
  resistivity: number;
  tauPhys: number;
}

export interface CircuitState {
  time: number;
  sourceVoltage: number;
  current: number;
  dIdt: number;
  nodeVoltages: number[];
  capacitorVoltage: number;
  capacitorCharge: number;
  displacementCurrentDensity: number;
  inductorVoltage: number;
  inductorBackEmf: number;
  totalPower: number;
  segmentFields: Record<string, SegmentFieldState>;
}

export interface SampledCircuitPoint {
  localV: number;
  localU_eV: number;
  E_axial: number;
  E_elec: number;
  E_ind: number;
  f_chem: number;
  sigma: number;
  tauPhys: number;
  segment: SegmentSpec;
  isInsideCapacitorGap: boolean;
}

export interface TelemetrySnapshot {
  zone: SegmentKind;
  zoneLabel: string;
  localE: number;
  vInst: number;
  vDrift: number;
  localV: number;
  localU_eV: number;
  meanFreeTime: number;
  collisions: number;
  totalPower: number;
  current: number;
  scaleRatioDisplay: number;
  heroS: number;
  totalLength: number;
  atCapacitorBarrier: boolean;
  handoffMessage: string | null;
}

export interface PhononEvent {
  ionIndex: number;
  s: number;
  u: number;
  v: number;
  intensity: number;
}

export type PinColor = 'cyan' | 'gold' | 'magenta' | 'emerald';

export type HoverTargetKind = SegmentKind | 'corner' | 'hero';

export interface UserPin {
  id: string;
  topology: TopologyId;
  s: number;
  targetKind: HoverTargetKind;
  title: string;
  note: string;
  color: PinColor;
  createdAt: number;
}

export interface WorldPin {
  id: string;
  topicId: Exclude<TopicId, 'circuits'>;
  chapterId: string;
  targetKey: string;
  x: number;
  y: number;
  z: number;
  title: string;
  note: string;
  color: PinColor;
  createdAt: number;
}

export interface HoverTargetInfo {
  s: number;
  kind: HoverTargetKind;
  clientX: number;
  clientY: number;
  localV: number;
  localU_eV: number;
  E_abs: number;
  power?: number;
  capV?: number;
}

