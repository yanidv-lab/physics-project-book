import type * as THREE from 'three';
import type { TopicId } from '../types/simulation';

export interface LabTelemetryCard {
  labelSimple: string;
  labelPhysics: string;
  value: string;
  noteTitle: string;
  noteText: string;
}

export interface LabSliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  noteTitle: string;
  noteText: string;
}

export interface LabToggleDef {
  key: string;
  label: string;
  checked: boolean;
  swatchColor: string;
  noteTitle: string;
  noteText: string;
}

export interface LabActionDef {
  id: string;
  label: string;
}

export interface LabControlSchema {
  sliders: LabSliderDef[];
  toggles: LabToggleDef[];
  actions: LabActionDef[];
}

export interface LabHoverData {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
  metrics: string[];
}

export interface LabCalloutPoint {
  id: string;
  label: string;
  accent: string;
  x: number;
  y: number;
  z: number;
  hover: LabHoverData;
}

export interface LabOscilloscopeSample {
  ch1: number;
  ch2: number;
  ch3: number;
  labels: [string, string, string];
  units: [string, string, string];
}

export interface LabFormula {
  captionSimple: string;
  captionPhysics: string;
  tex: string;
}

export interface LabModule {
  readonly topicId: Exclude<TopicId, 'circuits'>;
  readonly group: THREE.Group;

  activate(chapterId: string): void;
  getActiveChapterId(): string;
  applyQuickAction(apply: Record<string, number | boolean | string>): void;
  reset(): void;
  update(dt: number): void;

  getControlSchema(): LabControlSchema;
  setParam(key: string, value: number | boolean): void;
  runAction(actionId: string): void;

  getTelemetry(): LabTelemetryCard[];
  getFormula(): LabFormula;
  getOscilloscopeSample(): LabOscilloscopeSample;
  getStatusZonePill(): { label: string; color: string };

  getHitTargets(): THREE.Object3D[];
  inspectHit(hitObj: THREE.Object3D, hitPoint: THREE.Vector3): LabHoverData | null;
  getCallouts(): LabCalloutPoint[];
  getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] };
  dispose(): void;
}
