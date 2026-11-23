import * as THREE from 'three';
import type {
  CircuitState,
  PhononEvent,
  SegmentKind,
  SimParams,
  TelemetrySnapshot,
} from '../types/simulation';
import {
  E_CHARGE,
  N_CU,
  RHO_CU_300,
  V_FERMI_CU,
  WIRE_TUBE_RADIUS,
  drudeTau,
  resistorTempFactor,
  shortestDeltaS,
  wrapS,
} from './constants';
import { CircuitModel } from './circuitModel';
import { PathGeometry } from './pathGeometry';

export const NUM_ELECTRONS = 650;
export const HERO_TRAIL_LEN = 96;

export interface LatticeIonDescriptor {
  s: number;
  u: number;
  v: number;
  segmentKind: SegmentKind;
  baseWorldPos: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  tangent: THREE.Vector3;
}

export class DrudeEngine {
  // Carrier state arrays (index 0 is always the Hero / Tagged Electron)
  public readonly s = new Float64Array(NUM_ELECTRONS);
  public readonly u = new Float64Array(NUM_ELECTRONS);
  public readonly v = new Float64Array(NUM_ELECTRONS);
  public readonly vs = new Float64Array(NUM_ELECTRONS);
  public readonly vu = new Float64Array(NUM_ELECTRONS);
  public readonly vv = new Float64Array(NUM_ELECTRONS);
  public readonly dirS = new Float64Array(NUM_ELECTRONS);
  public readonly dirU = new Float64Array(NUM_ELECTRONS);
  public readonly dirV = new Float64Array(NUM_ELECTRONS);
  public readonly worldPos: THREE.Vector3[] = Array.from(
    { length: NUM_ELECTRONS },
    () => new THREE.Vector3(),
  );

  // Lattice ions
  public ions: LatticeIonDescriptor[] = [];
  public ionHeat = new Float32Array(0);

  // Hero telemetry & tracking
  public heroDriftS = 0;
  public heroWorldVel = new THREE.Vector3();
  public heroDriftVelWorld = new THREE.Vector3();
  public collisions = 0;
  public atCapacitorBarrier = false;
  public handoffMessage: string | null = null;

  // Hero trail ring buffer (stored chronologically via head index)
  public readonly trailPositions: THREE.Vector3[] = Array.from(
    { length: HERO_TRAIL_LEN },
    () => new THREE.Vector3(),
  );
  public readonly trailBreaks = new Uint8Array(HERO_TRAIL_LEN);
  public trailHead = 0;
  public trailCount = 0;

  // Phonon ripple events produced during the latest frame/step
  public readonly pendingPhononEvents: PhononEvent[] = [];

  private barrierDwellTimer = 0;
  private handoffTimer = 0;
  private pendingTrailBreak = false;
  private lastHeroZone: SegmentKind = 'wire';
  private rngState = 0x13579bdf;

  constructor(path: PathGeometry, circuit: CircuitModel, params: SimParams) {
    this.rebuildForTopology(path, circuit, params);
  }

  private rand(): number {
    // Fast deterministic-quality Mulberry32 PRNG
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private sampleIsotropicUnit(): [number, number, number] {
    const z = 2 * this.rand() - 1;
    const phi = 2 * Math.PI * this.rand();
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return [r * Math.cos(phi), r * Math.sin(phi), z];
  }

  public rebuildForTopology(
    path: PathGeometry,
    circuit: CircuitModel,
    params: SimParams,
  ): void {
    this.buildLatticeIons(path, circuit);
    this.resetCarriers(path, circuit, params);
  }

  private buildLatticeIons(path: PathGeometry, circuit: CircuitModel): void {
    const a = path.anchors;
    const segments = circuit.getSegments();
    const ionsPerRing = 8;

    // Weight metallic length (resistors get 2x ring density) so total ion count stays ~1950
    let weightedLen = 0;
    for (const seg of segments) {
      if (seg.kind === 'capacitor') continue;
      const len = seg.sEnd - seg.sStart;
      const mult = seg.kind === 'resistor' || seg.kind === 'resistor2' ? 2.0 : 1.0;
      weightedLen += len * mult;
    }
    const targetIons = 1950;
    const baseStepS = Math.max(0.25, (weightedLen * ionsPerRing) / targetIons);

    const newIons: LatticeIonDescriptor[] = [];
    const tmpFrame = path.sampleFrame(0);

    for (const seg of segments) {
      if (seg.kind === 'capacitor') {
        // Place small metallic plate lattice ions on plate collars outside gap
        const gapS = a.capGapStart ?? seg.sStart;
        const gapE = a.capGapEnd ?? seg.sEnd;
        const collars: Array<[number, number]> = [
          [seg.sStart, gapS - 0.08],
          [gapE + 0.08, seg.sEnd],
        ];
        for (const [cStart, cEnd] of collars) {
          if (cEnd <= cStart) continue;
          const rings = Math.max(2, Math.round((cEnd - cStart) / baseStepS));
          for (let r = 0; r < rings; r++) {
            const sPos = cStart + ((r + 0.5) / rings) * (cEnd - cStart);
            path.sampleFrame(sPos, tmpFrame);
            this.pushIonRing(newIons, tmpFrame, seg.kind, ionsPerRing, r % 2 === 1);
          }
        }
        continue;
      }

      const isRes = seg.kind === 'resistor' || seg.kind === 'resistor2';
      const step = isRes ? baseStepS * 0.5 : baseStepS;
      const span = seg.sEnd - seg.sStart;
      const numRings = Math.max(4, Math.round(span / step));

      for (let r = 0; r < numRings; r++) {
        const sPos = seg.sStart + ((r + 0.5) / numRings) * span;
        path.sampleFrame(sPos, tmpFrame);
        this.pushIonRing(newIons, tmpFrame, seg.kind, ionsPerRing, r % 2 === 1);
      }
    }

    this.ions = newIons;
    this.ionHeat = new Float32Array(newIons.length);
  }

  private pushIonRing(
    list: LatticeIonDescriptor[],
    frame: ReturnType<PathGeometry['sampleFrame']>,
    segmentKind: SegmentKind,
    count: number,
    stagger: boolean,
  ): void {
    const angleOffset = stagger ? Math.PI / count : 0;
    for (let k = 0; k < count; k++) {
      const theta = (2 * Math.PI * k) / count + angleOffset;
      const radialFrac = k % 2 === 0 ? 0.72 : 0.38;
      const rad = frame.tubeRadius * radialFrac;
      const u = rad * Math.cos(theta);
      const v = rad * Math.sin(theta);
      const baseWorldPos = frame.pos
        .clone()
        .addScaledVector(frame.normal, u)
        .addScaledVector(frame.binormal, v);
      list.push({
        s: frame.s,
        u,
        v,
        segmentKind,
        baseWorldPos,
        normal: frame.normal.clone(),
        binormal: frame.binormal.clone(),
        tangent: frame.tangent.clone(),
      });
    }
  }

  public resetCarriers(
    path: PathGeometry,
    circuit: CircuitModel,
    params: SimParams,
  ): void {
    const a = path.anchors;
    const L = path.totalLength;
    const vThInit = 7.5 * Math.sqrt(0.35 + 0.65 * (params.temperature / 300));

    // Place hero electron in copper wire just upstream of Resistor R1 for an iconic opening vista
    const heroStartS = wrapS(a.res1Start - 4.2, L);
    const frame = path.sampleFrame(0);

    for (let i = 0; i < NUM_ELECTRONS; i++) {
      let sPos: number;
      if (i === 0) {
        sPos = heroStartS;
      } else {
        // Distribute uniformly over non-gap path
        sPos = ((i - 1) / (NUM_ELECTRONS - 1)) * L;
        if (a.capGapStart !== null && a.capGapEnd !== null) {
          if (sPos >= a.capGapStart - 0.05 && sPos <= a.capGapEnd + 0.05) {
            const mid = 0.5 * (a.capGapStart + a.capGapEnd);
            sPos = sPos < mid ? a.capGapStart - 0.15 : a.capGapEnd + 0.15;
          }
        }
      }

      path.sampleFrame(sPos, frame);
      const rMax = Math.max(0.15, frame.tubeRadius - 0.16);
      const r = i === 0 ? 0.05 : rMax * Math.sqrt(this.rand());
      const theta = 2 * Math.PI * this.rand();
      const uVal = r * Math.cos(theta);
      const vVal = r * Math.sin(theta);

      const [ds, du, dv] = this.sampleIsotropicUnit();
      this.s[i] = wrapS(sPos, L);
      this.u[i] = uVal;
      this.v[i] = vVal;
      this.dirS[i] = ds;
      this.dirU[i] = du;
      this.dirV[i] = dv;
      this.vs[i] = vThInit * ds;
      this.vu[i] = vThInit * du;
      this.vv[i] = vThInit * dv;

      path.localToWorld(this.s[i], this.u[i], this.v[i], this.worldPos[i]);
    }

    this.heroDriftS = this.s[0];
    this.collisions = 0;
    this.barrierDwellTimer = 0;
    this.atCapacitorBarrier = false;
    this.handoffMessage = null;
    this.handoffTimer = 0;
    this.trailHead = 0;
    this.trailCount = 0;
    this.pendingTrailBreak = true;
    this.ionHeat.fill(0);
    this.pendingPhononEvents.length = 0;
    this.lastHeroZone = circuit.sampleAtS(this.s[0]).segment.kind;
    this.pushTrailPoint(this.worldPos[0], true);
  }

  public teleportHero(targetS: number, path: PathGeometry, circuit: CircuitModel): void {
    const a = path.anchors;
    let clampedS = wrapS(targetS, path.totalLength);
    if (a.capGapStart !== null && a.capGapEnd !== null) {
      if (clampedS >= a.capGapStart - 0.05 && clampedS <= a.capGapEnd + 0.05) {
        const mid = 0.5 * (a.capGapStart + a.capGapEnd);
        clampedS = clampedS < mid ? a.capGapStart - 0.12 : a.capGapEnd + 0.12;
      }
    }
    this.s[0] = clampedS;
    this.u[0] = 0;
    this.v[0] = 0;
    this.heroDriftS = clampedS;
    this.barrierDwellTimer = 0;
    this.atCapacitorBarrier = false;
    this.pendingTrailBreak = true;
    path.localToWorld(this.s[0], this.u[0], this.v[0], this.worldPos[0]);
    this.pushTrailPoint(this.worldPos[0], true);
    this.lastHeroZone = circuit.sampleAtS(this.s[0]).segment.kind;
  }

  public triggerCapacitorHandoff(current: number, path: PathGeometry): boolean {
    const a = path.anchors;
    if (a.capGapStart === null || a.capGapEnd === null) return false;

    const targetS =
      current >= 0 ? wrapS(a.capGapEnd + 0.45, path.totalLength) : wrapS(a.capGapStart - 0.45, path.totalLength);
    this.s[0] = targetS;
    this.u[0] = 0;
    this.v[0] = 0;
    this.vs[0] = (current >= 0 ? 1 : -1) * Math.max(2.0, Math.abs(this.vs[0]));
    this.heroDriftS = targetS;
    this.barrierDwellTimer = 0;
    this.atCapacitorBarrier = false;
    this.pendingTrailBreak = true;
    path.localToWorld(this.s[0], this.u[0], this.v[0], this.worldPos[0]);
    this.pushTrailPoint(this.worldPos[0], true);

    this.handoffMessage =
      'Displacement Current Handoff (J_D = ε ∂E/∂t): Electric flux repelled a paired electron off the opposite plate.';
    this.handoffTimer = 3.8;
    return true;
  }

  private pushTrailPoint(pos: THREE.Vector3, isBreak: boolean): void {
    this.trailPositions[this.trailHead].copy(pos);
    this.trailBreaks[this.trailHead] = isBreak ? 1 : 0;
    this.trailHead = (this.trailHead + 1) % HERO_TRAIL_LEN;
    if (this.trailCount < HERO_TRAIL_LEN) {
      this.trailCount++;
    }
  }

  /**
   * Computes visual mean free time and thermal speed inside a given segment.
   */
  private getSceneDrudeParams(
    segKind: SegmentKind,
    segResistance: number,
    tauPhys: number,
    tubeRadius: number,
    current: number,
    params: SimParams,
  ): { vDriftScene: number; vThScene: number; tauScene: number } {
    const lambda = Math.max(0, Math.min(1, params.scaleCompression));
    const tauCu300 = drudeTau(RHO_CU_300);

    // Current continuity: v_d proportional to I / A
    const areaRatio = (tubeRadius / WIRE_TUBE_RADIUS) ** 2;
    const driftCompression = Math.pow(0.04, lambda);
    const vDriftScene = ((4.2 * current) / Math.max(0.1, areaRatio)) * driftCompression;

    const tempThermalBoost = Math.sqrt(0.35 + 0.65 * (params.temperature / 300));
    const vThScale = Math.pow(12, lambda);
    const vThScene = 7.5 * tempThermalBoost * vThScale;

    let envFactor = 1.0;
    if (segKind === 'resistor' || segKind === 'resistor2') {
      const tRes = resistorTempFactor(params.temperature);
      const rNominal = Math.max(1, segResistance / tRes);
      envFactor = 1 / ((5.5 + 1.8 * Math.log10(rNominal)) * Math.sqrt(tRes));
    } else {
      const tauRatio = Math.max(0.2, Math.min(100, tauPhys / tauCu300));
      envFactor = Math.pow(tauRatio, 0.52);
      if (segKind === 'battery') {
        envFactor *= 0.65;
      }
    }

    const tauScene = Math.max(0.0012, (0.16 * envFactor) / Math.pow(14, lambda));
    return { vDriftScene, vThScene, tauScene };
  }

  private findNearestIonIndex(sPos: number, uPos: number, vPos: number): number {
    if (this.ions.length === 0) return -1;
    // Binary search by s isn't exact due to segment order, but ions are ordered monotonically in s!
    let lo = 0;
    let hi = this.ions.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.ions[mid].s <= sPos) lo = mid;
      else hi = mid;
    }
    const start = Math.max(0, lo - 18);
    const end = Math.min(this.ions.length - 1, lo + 18);
    let bestIdx = lo;
    let bestDistSq = Infinity;
    for (let i = start; i <= end; i++) {
      const ion = this.ions[i];
      const ds = ion.s - sPos;
      const du = ion.u - uPos;
      const dv = ion.v - vPos;
      const d2 = ds * ds + du * du + dv * dv;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  public step(
    dt: number,
    circuit: CircuitModel,
    circuitState: CircuitState,
    path: PathGeometry,
    params: SimParams,
  ): void {
    const clampedDt = Math.min(Math.max(dt, 0), 0.05);
    this.pendingPhononEvents.length = 0;

    if (this.handoffTimer > 0) {
      this.handoffTimer = Math.max(0, this.handoffTimer - clampedDt);
      if (this.handoffTimer === 0) {
        this.handoffMessage = null;
      }
    }

    // Decay ion Joule heat & deposit steady ohmic thermal glow inside active resistors
    const heatDecay = Math.exp(-clampedDt * 1.35);
    for (let i = 0; i < this.ionHeat.length; i++) {
      this.ionHeat[i] *= heatDecay;
    }

    const r1Power = circuitState.segmentFields['resistor-1']?.power ?? 0;
    const r2Power = circuitState.segmentFields['resistor-2']?.power ?? 0;
    if (r1Power > 1e-4 || r2Power > 1e-4) {
      const r1Boost = Math.min(0.85, Math.log10(1 + r1Power * 2.5) * 0.42) * clampedDt * 1.6;
      const r2Boost = Math.min(0.85, Math.log10(1 + r2Power * 2.5) * 0.42) * clampedDt * 1.6;
      for (let i = 0; i < this.ions.length; i++) {
        const k = this.ions[i].segmentKind;
        if (k === 'resistor' && r1Boost > 0) {
          this.ionHeat[i] = Math.min(1, this.ionHeat[i] + r1Boost);
        } else if (k === 'resistor2' && r2Boost > 0) {
          this.ionHeat[i] = Math.min(1, this.ionHeat[i] + r2Boost);
        }
      }
    }

    if (clampedDt <= 0) return;

    const L = path.totalLength;
    const a = path.anchors;
    const hasCapGap = a.capGapStart !== null && a.capGapEnd !== null;
    const gapStart = a.capGapStart ?? -1;
    const gapEnd = a.capGapEnd ?? -1;
    const gapMid = 0.5 * (gapStart + gapEnd);

    const frame = path.sampleFrame(0);
    let heroTouchedBarrier = false;

    for (let i = 0; i < NUM_ELECTRONS; i++) {
      const isHero = i === 0;
      const sampled = circuit.sampleAtS(this.s[i]);
      path.sampleFrame(this.s[i], frame);

      const { vDriftScene, vThScene, tauScene } = this.getSceneDrudeParams(
        sampled.segment.kind,
        sampled.segment.resistance,
        sampled.tauPhys,
        frame.tubeRadius,
        circuitState.current,
        params,
      );

      const maxStepForTau = Math.max(0.0006, 0.25 * tauScene);
      const maxStepForSpeed =
        frame.tubeRadius > 0
          ? Math.max(0.0006, (0.3 * frame.tubeRadius) / Math.max(1, vThScene + Math.abs(vDriftScene)))
          : 0.01;
      const substeps = Math.min(
        isHero ? 16 : 8,
        Math.max(1, Math.ceil(clampedDt / Math.min(maxStepForTau, maxStepForSpeed))),
      );
      const h = clampedDt / substeps;
      const pScatter = 1 - Math.exp(-h / tauScene);
      const accelS = vDriftScene / tauScene;

      let si = this.s[i];
      let ui = this.u[i];
      let vi = this.v[i];
      let vsi = this.vs[i];
      let vui = this.vu[i];
      let vvi = this.vv[i];

      for (let sub = 0; sub < substeps; sub++) {
        // 1. Accelerate strictly opposite to local driving E-field between collisions
        vsi += accelS * h;

        const prevSi = si;
        si += vsi * h;
        ui += vui * h;
        vi += vvi * h;

        // Wrap around loop
        if (si < 0 || si >= L) {
          si = wrapS(si, L);
        }

        // 2. Capacitor insulating dielectric barrier check
        if (hasCapGap && si >= gapStart && si <= gapEnd) {
          if (isHero) heroTouchedBarrier = true;
          // Determine side of barrier
          const dStart = Math.abs(shortestDeltaS(prevSi, gapStart, L));
          const dEnd = Math.abs(shortestDeltaS(prevSi, gapEnd, L));
          if (dStart <= dEnd || (prevSi < gapMid && prevSi >= gapStart - 2.0)) {
            si = gapStart - 0.04;
            vsi = -Math.abs(vsi) * 0.72;
          } else {
            si = gapEnd + 0.04;
            vsi = Math.abs(vsi) * 0.72;
          }
        }

        // 3. Confinement reflection at conductor tube wall
        path.sampleFrame(si, frame);
        const rMax = Math.max(0.12, frame.tubeRadius - 0.12);
        const rSq = ui * ui + vi * vi;
        if (rSq > rMax * rMax) {
          const r = Math.sqrt(rSq);
          const nx = ui / r;
          const ny = vi / r;
          ui = nx * (rMax - 0.01);
          vi = ny * (rMax - 0.01);
          const vRad = vui * nx + vvi * ny;
          if (vRad > 0) {
            // 85% specular + 15% diffuse wall scatter
            vui -= 1.85 * vRad * nx + (this.rand() - 0.5) * 0.3 * vThScene;
            vvi -= 1.85 * vRad * ny + (this.rand() - 0.5) * 0.3 * vThScene;
            // Re-inward clamp if diffuse jitter pointed outward
            const vRadAfter = vui * nx + vvi * ny;
            if (vRadAfter > 0) {
              vui -= 1.2 * vRadAfter * nx;
              vvi -= 1.2 * vRadAfter * ny;
            }
          }
        }

        // 4. Stochastic Poisson phonon/impurity scattering
        if (this.rand() < pScatter) {
          const kPre = 0.5 * (vsi * vsi + vui * vui + vvi * vvi);
          const [dx, dy, dz] = this.sampleIsotropicUnit();
          vsi = vThScene * dx;
          vui = vThScene * dy;
          vvi = vThScene * dz;
          this.dirS[i] = dx;
          this.dirU[i] = dy;
          this.dirV[i] = dz;

          if (isHero) {
            this.collisions++;
          }

          const deltaK = Math.max(0, kPre - 0.5 * vThScene * vThScene);
          const heroDist = Math.abs(shortestDeltaS(this.s[0], si, L));
          if (isHero || (heroDist < 10 && this.pendingPhononEvents.length < 24)) {
            const ionIdx = this.findNearestIonIndex(si, ui, vi);
            if (ionIdx >= 0) {
              const hasCurrent = Math.abs(circuitState.current) > 1e-4;
              const heatAdd = hasCurrent
                ? Math.min(0.45, 0.04 + deltaK * 0.008 + Math.abs(sampled.E_axial) * 0.002)
                : 0;
              if (heatAdd > 0) {
                this.ionHeat[ionIdx] = Math.min(1, this.ionHeat[ionIdx] + heatAdd);
              }
              this.pendingPhononEvents.push({
                ionIndex: ionIdx,
                s: si,
                u: ui,
                v: vi,
                intensity: Math.min(1.0, (isHero ? 0.65 : 0.35) + heatAdd * 1.5),
              });
            }
          }
        }
      }

      this.s[i] = si;
      this.u[i] = ui;
      this.v[i] = vi;
      this.vs[i] = vsi;
      this.vu[i] = vui;
      this.vv[i] = vvi;

      path.localToWorld(si, ui, vi, this.worldPos[i], frame);
    }

    // Update hero velocity vectors in world coordinates for camera & HUD arrow
    const heroFrame = path.sampleFrame(this.s[0]);
    this.heroWorldVel
      .set(0, 0, 0)
      .addScaledVector(heroFrame.tangent, this.vs[0])
      .addScaledVector(heroFrame.normal, this.vu[0])
      .addScaledVector(heroFrame.binormal, this.vv[0]);

    const heroSampled = circuit.sampleAtS(this.s[0]);
    const heroDrude = this.getSceneDrudeParams(
      heroSampled.segment.kind,
      heroSampled.segment.resistance,
      heroSampled.tauPhys,
      heroFrame.tubeRadius,
      circuitState.current,
      params,
    );
    this.heroDriftVelWorld.copy(heroFrame.tangent).multiplyScalar(heroDrude.vDriftScene);

    // Smooth drift tracker around closed loop (used by Locked-Drift camera)
    const deltaHero = shortestDeltaS(this.heroDriftS, this.s[0], L);
    if (Math.abs(deltaHero) > 10) {
      this.heroDriftS = this.s[0];
      this.pendingTrailBreak = true;
    } else {
      const followRate = 1 - Math.exp(-clampedDt * 7.5);
      this.heroDriftS = wrapS(this.heroDriftS + deltaHero * followRate, L);
    }

    // Capacitor barrier dwell detection & automatic displacement-current handoff
    if (hasCapGap && Math.abs(circuitState.current) > 0.002) {
      const upstreamPlate = circuitState.current > 0 ? gapStart : gapEnd;
      const distToUpstream = Math.abs(shortestDeltaS(this.s[0], upstreamPlate, L));
      if (heroTouchedBarrier || distToUpstream < 0.55) {
        this.atCapacitorBarrier = true;
        this.barrierDwellTimer += clampedDt;
        if (params.autoCapHandoff && this.barrierDwellTimer >= 1.8) {
          this.triggerCapacitorHandoff(circuitState.current, path);
        }
      } else {
        this.atCapacitorBarrier = false;
        this.barrierDwellTimer = Math.max(0, this.barrierDwellTimer - clampedDt * 2);
      }
    } else {
      this.atCapacitorBarrier = false;
      this.barrierDwellTimer = 0;
    }

    // Update hero trail
    this.pushTrailPoint(this.worldPos[0], this.pendingTrailBreak);
    this.pendingTrailBreak = false;

    this.lastHeroZone = heroSampled.segment.kind;
  }

  public getTelemetry(
    circuit: CircuitModel,
    circuitState: CircuitState,
    path: PathGeometry,
    params: SimParams,
  ): TelemetrySnapshot {
    const sampled = circuit.sampleAtS(this.s[0]);
    const seg = sampled.segment;

    // Exact SI drift velocity I = n * A * e * v_d
    const vDriftSigned = -circuitState.current / (N_CU * E_CHARGE * seg.physicalArea);
    // Wait: check sign! When current I > 0, electrons flow in +T direction, so v_d along +T is positive:
    // Let's report magnitude of drift or signed along +T:
    const vDriftAlongT = circuitState.current / (N_CU * E_CHARGE * seg.physicalArea);
    void vDriftSigned;

    // Exact instantaneous SI speed combining Fermi velocity and drift velocity
    const thermalTempScale = Math.sqrt(0.35 + 0.65 * (params.temperature / 300));
    const vF_eff = V_FERMI_CU * thermalTempScale;
    const vx = vF_eff * this.dirS[0] + vDriftAlongT;
    const vy = vF_eff * this.dirU[0];
    const vz = vF_eff * this.dirV[0];
    const vInst = Math.sqrt(vx * vx + vy * vy + vz * vz);

    const scaleRatioDisplay = 5 * Math.pow(10, 9.6 * Math.max(0, Math.min(1, params.scaleCompression)));

    return {
      zone: this.lastHeroZone,
      zoneLabel: seg.label,
      localE: sampled.E_axial,
      vInst,
      vDrift: Math.abs(vDriftAlongT),
      localV: sampled.localV,
      localU_eV: sampled.localU_eV,
      meanFreeTime: sampled.tauPhys,
      collisions: this.collisions,
      totalPower: circuitState.totalPower,
      current: circuitState.current,
      scaleRatioDisplay,
      heroS: this.s[0],
      totalLength: path.totalLength,
      atCapacitorBarrier: this.atCapacitorBarrier,
      handoffMessage: this.handoffMessage,
    };
  }

  /**
   * Computes ensemble average physical drift speed and instantaneous speed across all 650 electrons.
   */
  public getEnsembleSpeeds(circuit: CircuitModel, circuitState: CircuitState, params: SimParams): {
    meanVDriftPhys: number;
    meanVInstPhys: number;
  } {
    const thermalTempScale = Math.sqrt(0.35 + 0.65 * (params.temperature / 300));
    const vF_eff = V_FERMI_CU * thermalTempScale;
    let sumDrift = 0;
    let sumInst = 0;

    for (let i = 0; i < NUM_ELECTRONS; i++) {
      const sampled = circuit.sampleAtS(this.s[i]);
      const vd = circuitState.current / (N_CU * E_CHARGE * sampled.segment.physicalArea);
      const vx = vF_eff * this.dirS[i] + vd;
      const vy = vF_eff * this.dirU[i];
      const vz = vF_eff * this.dirV[i];
      sumDrift += vd;
      sumInst += Math.sqrt(vx * vx + vy * vy + vz * vz);
    }

    return {
      meanVDriftPhys: sumDrift / NUM_ELECTRONS,
      meanVInstPhys: sumInst / NUM_ELECTRONS,
    };
  }
}
