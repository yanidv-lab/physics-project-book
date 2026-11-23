import * as THREE from 'three';
import type { TopologyId } from '../types/simulation';
import {
  RES_TUBE_RADIUS,
  WIRE_TUBE_RADIUS,
  smoothstep,
  wrapS,
} from './constants';

export interface FrameSample {
  s: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  curvature: number;
  tubeRadius: number;
}

export interface GeometryAnchors {
  totalLength: number;
  batteryStart: number;
  batteryEnd: number;
  inductorStart: number | null;
  inductorEnd: number | null;
  res1Start: number;
  res1End: number;
  res2Start: number | null;
  res2End: number | null;
  capStart: number | null;
  capEnd: number | null;
  capGapStart: number | null;
  capGapEnd: number | null;
}

const LOOP_HALF_W = 16; // X in [-16, +16]
const LOOP_HALF_D = 11; // Z in [-11, +11]
const CORNER_R = 3.5;
const STRAIGHT_X = 2 * (LOOP_HALF_W - CORNER_R); // 25.0
const STRAIGHT_Z = 2 * (LOOP_HALF_D - CORNER_R); // 15.0
const CORNER_ARC = 0.5 * Math.PI * CORNER_R; // ~5.497787

// Helix parameters for RLC inductor on the left edge
const HELIX_SPAN = 12.5; // centered along the 15-unit left straight
const HELIX_RADIUS = 2.6;
const HELIX_TURNS = 3;

const NUM_SAMPLES = 1200;

function quinticEnvelope(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (10 - 15 * c + 6 * c * c);
}

/**
 * Closed-loop 3D spline with twist-free Bishop (parallel transport) framing
 * and variable cross-section tube radius.
 * Parameterization runs clockwise when viewed from +Y (electron flow for V_src > 0),
 * with s = 0 at the battery (+) terminal (x = +4, z = +11).
 */
export class PathGeometry {
  public readonly topology: TopologyId;
  public readonly totalLength: number;
  public readonly anchors: GeometryAnchors;

  private readonly samples: FrameSample[] = [];
  private readonly rawPoints: THREE.Vector3[] = [];
  private readonly rawCumLen: number[] = [];

  constructor(topology: TopologyId) {
    this.topology = topology;

    const densePts = this.buildDenseCenterline(topology);
    this.rawPoints = densePts;
    this.rawCumLen = new Array<number>(densePts.length).fill(0);
    let len = 0;
    for (let i = 1; i < densePts.length; i++) {
      len += densePts[i].distanceTo(densePts[i - 1]);
      this.rawCumLen[i] = len;
    }
    this.totalLength = len;

    this.anchors = this.computeAnchors(topology, densePts, this.rawCumLen);
    this.buildUniformFrames();
  }

  private buildDenseCenterline(topology: TopologyId): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const hasHelix = topology === 'rlc';
    const xStraight = LOOP_HALF_W - CORNER_R; // 12.5
    const zStraight = LOOP_HALF_D - CORNER_R; // 7.5

    const pushLine = (p0: THREE.Vector3, p1: THREE.Vector3, steps: number) => {
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        pts.push(new THREE.Vector3().lerpVectors(p0, p1, t));
      }
    };

    const pushArc = (
      cx: number,
      cz: number,
      a0: number,
      a1: number,
      steps: number,
    ) => {
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = a0 + (a1 - a0) * t;
        pts.push(new THREE.Vector3(cx + CORNER_R * Math.cos(a), 0, cz + CORNER_R * Math.sin(a)));
      }
    };

    // Start at s = 0: Battery (+) terminal at (x = +4, y = 0, z = +11)
    // 1. Bottom edge from x = +4 to x = -12.5 along z = +11
    pushLine(new THREE.Vector3(4, 0, LOOP_HALF_D), new THREE.Vector3(-xStraight, 0, LOOP_HALF_D), 120);

    // 2. Corner 1 (bottom-left): center (-12.5, +7.5), angle +PI/2 -> +PI
    pushArc(-xStraight, zStraight, Math.PI * 0.5, Math.PI, 48);

    // 3. Left edge: (-16, 0, +7.5) -> (-16, 0, -7.5)
    if (!hasHelix) {
      pushLine(new THREE.Vector3(-LOOP_HALF_W, 0, zStraight), new THREE.Vector3(-LOOP_HALF_W, 0, -zStraight), 120);
    } else {
      const leadLen = (STRAIGHT_Z - HELIX_SPAN) * 0.5; // 1.25
      const zStartCoil = zStraight - leadLen; // +6.25
      const zEndCoil = -zStraight + leadLen; // -6.25

      pushLine(
        new THREE.Vector3(-LOOP_HALF_W, 0, zStraight),
        new THREE.Vector3(-LOOP_HALF_W, 0, zStartCoil),
        20,
      );

      const helixSteps = 320;
      const rampFrac = 0.14;
      for (let i = 0; i < helixSteps; i++) {
        const u = i / helixSteps;
        let env = 1;
        if (u < rampFrac) {
          env = quinticEnvelope(u / rampFrac);
        } else if (u > 1 - rampFrac) {
          env = quinticEnvelope((1 - u) / rampFrac);
        }
        const r = HELIX_RADIUS * env;
        const theta = 2 * Math.PI * HELIX_TURNS * u;
        const z = zStartCoil + (zEndCoil - zStartCoil) * u;
        pts.push(
          new THREE.Vector3(
            -LOOP_HALF_W + r * Math.cos(theta),
            r * Math.sin(theta),
            z,
          ),
        );
      }

      pushLine(
        new THREE.Vector3(-LOOP_HALF_W, 0, zEndCoil),
        new THREE.Vector3(-LOOP_HALF_W, 0, -zStraight),
        20,
      );
    }

    // 4. Corner 2 (top-left): center (-12.5, -7.5), angle +PI -> +1.5*PI
    pushArc(-xStraight, -zStraight, Math.PI, Math.PI * 1.5, 48);

    // 5. Top edge: (-12.5, 0, -11) -> (+12.5, 0, -11)
    pushLine(new THREE.Vector3(-xStraight, 0, -LOOP_HALF_D), new THREE.Vector3(xStraight, 0, -LOOP_HALF_D), 160);

    // 6. Corner 3 (top-right): center (+12.5, -7.5), angle -PI/2 -> 0
    pushArc(xStraight, -zStraight, -Math.PI * 0.5, 0, 48);

    // 7. Right edge: (+16, 0, -7.5) -> (+16, 0, +7.5)
    pushLine(new THREE.Vector3(LOOP_HALF_W, 0, -zStraight), new THREE.Vector3(LOOP_HALF_W, 0, zStraight), 120);

    // 8. Corner 4 (bottom-right): center (+12.5, +7.5), angle 0 -> +PI/2
    pushArc(xStraight, zStraight, 0, Math.PI * 0.5, 48);

    // 9. Remainder of bottom edge: (+12.5, 0, +11) -> (+4, 0, +11)
    pushLine(new THREE.Vector3(xStraight, 0, LOOP_HALF_D), new THREE.Vector3(4, 0, LOOP_HALF_D), 60);

    // Close explicitly back to first point
    pts.push(pts[0].clone());
    return pts;
  }

  private findClosestSByPoint(target: THREE.Vector3, pts: THREE.Vector3[], cumLen: number[], minS = 0): number {
    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (cumLen[i] < minS) continue;
      const d2 = pts[i].distanceToSquared(target);
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
    return cumLen[bestIdx];
  }

  private computeAnchors(
    topology: TopologyId,
    pts: THREE.Vector3[],
    cumLen: number[],
  ): GeometryAnchors {
    const totalLength = cumLen[cumLen.length - 1];

    // Battery: bottom edge x = +4 -> x = -4 (length 8.0)
    const batteryStart = 0;
    const batteryEnd = 8.0;

    // Inductor (RLC only): along left edge helix
    let inductorStart: number | null = null;
    let inductorEnd: number | null = null;
    if (topology === 'rlc') {
      const baseLeftStart = 16.5 + CORNER_ARC;
      inductorStart = this.findClosestSByPoint(new THREE.Vector3(-LOOP_HALF_W, 0, 6.25), pts, cumLen, baseLeftStart - 0.5);
      inductorEnd = this.findClosestSByPoint(new THREE.Vector3(-LOOP_HALF_W, 0, -6.25), pts, cumLen, inductorStart + 2.0);
    }

    // Top edge center is (0, 0, -LOOP_HALF_D). Find exact s at top-edge center:
    const topCenterS = this.findClosestSByPoint(new THREE.Vector3(0, 0, -LOOP_HALF_D), pts, cumLen, 20);
    const res1Start = topCenterS - 4.5;
    const res1End = topCenterS + 4.5;

    // Right edge center is (+LOOP_HALF_W, 0, 0).
    const rightCenterS = this.findClosestSByPoint(new THREE.Vector3(LOOP_HALF_W, 0, 0), pts, cumLen, res1End);

    let res2Start: number | null = null;
    let res2End: number | null = null;
    if (topology === 'divider') {
      res2Start = rightCenterS - 4.0;
      res2End = rightCenterS + 4.0;
    }

    let capStart: number | null = null;
    let capEnd: number | null = null;
    let capGapStart: number | null = null;
    let capGapEnd: number | null = null;
    if (topology === 'rc' || topology === 'rlc') {
      capStart = rightCenterS - 1.6;
      capEnd = rightCenterS + 1.6;
      capGapStart = rightCenterS - 0.9;
      capGapEnd = rightCenterS + 0.9;
    }

    return {
      totalLength,
      batteryStart,
      batteryEnd,
      inductorStart,
      inductorEnd,
      res1Start,
      res1End,
      res2Start,
      res2End,
      capStart,
      capEnd,
      capGapStart,
      capGapEnd,
    };
  }

  private sampleRawPosition(s: number): THREE.Vector3 {
    const wrapped = wrapS(s, this.totalLength);
    // Binary search in rawCumLen
    let lo = 0;
    let hi = this.rawCumLen.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.rawCumLen[mid] <= wrapped) lo = mid;
      else hi = mid;
    }
    const s0 = this.rawCumLen[lo];
    const s1 = this.rawCumLen[hi];
    const alpha = s1 > s0 ? (wrapped - s0) / (s1 - s0) : 0;
    return new THREE.Vector3().lerpVectors(this.rawPoints[lo], this.rawPoints[hi], alpha);
  }

  private computeTubeRadiusAtS(s: number): number {
    const blend = 0.8;
    const { res1Start, res1End, res2Start, res2End } = this.anchors;

    const factorForSpan = (start: number, end: number): number => {
      if (s <= start - blend || s >= end + blend) return 0;
      if (s >= start && s <= end) return 1;
      if (s < start) return smoothstep(start - blend, start, s);
      return 1 - smoothstep(end, end + blend, s);
    };

    let constrict = factorForSpan(res1Start, res1End);
    if (res2Start !== null && res2End !== null) {
      constrict = Math.max(constrict, factorForSpan(res2Start, res2End));
    }

    return WIRE_TUBE_RADIUS + (RES_TUBE_RADIUS - WIRE_TUBE_RADIUS) * constrict;
  }

  private buildUniformFrames(): void {
    const ds = this.totalLength / NUM_SAMPLES;
    const positions: THREE.Vector3[] = new Array(NUM_SAMPLES);
    const tangents: THREE.Vector3[] = new Array(NUM_SAMPLES);

    for (let i = 0; i < NUM_SAMPLES; i++) {
      positions[i] = this.sampleRawPosition(i * ds);
    }

    for (let i = 0; i < NUM_SAMPLES; i++) {
      const prev = positions[(i - 1 + NUM_SAMPLES) % NUM_SAMPLES];
      const next = positions[(i + 1) % NUM_SAMPLES];
      tangents[i] = new THREE.Vector3().subVectors(next, prev).normalize();
    }

    // Parallel transport (Bishop) frame starting with planar reference at s = 0
    // At s = 0: T = (-1, 0, 0), B = (0, 1, 0), N = B x T = (0, 0, +1) -> det([N, B, T]) = +1
    const normals: THREE.Vector3[] = new Array(NUM_SAMPLES);
    const binormals: THREE.Vector3[] = new Array(NUM_SAMPLES);

    const b0 = new THREE.Vector3(0, 1, 0);
    let nCur = new THREE.Vector3().crossVectors(b0, tangents[0]).normalize();
    let bCur = new THREE.Vector3().crossVectors(tangents[0], nCur).normalize();
    normals[0] = nCur.clone();
    binormals[0] = bCur.clone();

    const rotAxis = new THREE.Vector3();
    const rotQuat = new THREE.Quaternion();

    for (let i = 1; i < NUM_SAMPLES; i++) {
      const tPrev = tangents[i - 1];
      const tCurr = tangents[i];
      nCur = nCur.clone();
      rotAxis.crossVectors(tPrev, tCurr);
      const axisLen = rotAxis.length();
      if (axisLen > 1e-8) {
        rotAxis.divideScalar(axisLen);
        const dot = Math.max(-1, Math.min(1, tPrev.dot(tCurr)));
        const angle = Math.acos(dot);
        rotQuat.setFromAxisAngle(rotAxis, angle);
        nCur.applyQuaternion(rotQuat);
      }
      // Re-orthogonalize strictly against tCurr
      nCur.addScaledVector(tCurr, -nCur.dot(tCurr)).normalize();
      bCur = new THREE.Vector3().crossVectors(tCurr, nCur).normalize();
      normals[i] = nCur;
      binormals[i] = bCur;
    }

    // Measure closure holonomy between transported frame at end (closing back to i=0) and initial frame
    // Transport one more step from NUM_SAMPLES-1 to 0
    const tLast = tangents[NUM_SAMPLES - 1];
    const tFirst = tangents[0];
    let nEnd = normals[NUM_SAMPLES - 1].clone();
    rotAxis.crossVectors(tLast, tFirst);
    if (rotAxis.length() > 1e-8) {
      rotAxis.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, tLast.dot(tFirst))));
      rotQuat.setFromAxisAngle(rotAxis, angle);
      nEnd.applyQuaternion(rotQuat);
    }
    nEnd.addScaledVector(tFirst, -nEnd.dot(tFirst)).normalize();

    const cosErr = Math.max(-1, Math.min(1, nEnd.dot(normals[0])));
    const sinErr = tFirst.dot(new THREE.Vector3().crossVectors(nEnd, normals[0]));
    const totalTwistErr = Math.atan2(sinErr, cosErr);

    // Distribute closure twist smoothly around the loop (or concentrated on the helix if present)
    const twistStart = this.anchors.inductorStart ?? 0;
    const twistEnd = this.anchors.inductorEnd ?? this.totalLength;
    const twistSpan = Math.max(1e-6, twistEnd - twistStart);

    for (let i = 0; i < NUM_SAMPLES; i++) {
      const s = i * ds;
      let frac = 0;
      if (s <= twistStart) frac = 0;
      else if (s >= twistEnd) frac = 1;
      else frac = (s - twistStart) / twistSpan;

      const corrAngle = totalTwistErr * frac;
      if (Math.abs(corrAngle) > 1e-10) {
        rotQuat.setFromAxisAngle(tangents[i], corrAngle);
        normals[i].applyQuaternion(rotQuat).normalize();
        binormals[i].crossVectors(tangents[i], normals[i]).normalize();
      }
    }

    // Compute curvature magnitude |dT/ds|
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const s = i * ds;
      const tPrev = tangents[(i - 1 + NUM_SAMPLES) % NUM_SAMPLES];
      const tNext = tangents[(i + 1) % NUM_SAMPLES];
      const curvature = tNext.distanceTo(tPrev) / (2 * ds);
      this.samples.push({
        s,
        pos: positions[i],
        tangent: tangents[i],
        normal: normals[i],
        binormal: binormals[i],
        curvature,
        tubeRadius: this.computeTubeRadiusAtS(s),
      });
    }
  }

  public sampleFrame(s: number, out?: FrameSample): FrameSample {
    const wrapped = wrapS(s, this.totalLength);
    const ds = this.totalLength / NUM_SAMPLES;
    const exactIdx = wrapped / ds;
    const i0 = Math.floor(exactIdx) % NUM_SAMPLES;
    const i1 = (i0 + 1) % NUM_SAMPLES;
    const alpha = exactIdx - Math.floor(exactIdx);

    const a = this.samples[i0];
    const b = this.samples[i1];

    const res: FrameSample = out ?? {
      s: wrapped,
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      binormal: new THREE.Vector3(),
      curvature: 0,
      tubeRadius: WIRE_TUBE_RADIUS,
    };

    res.s = wrapped;
    res.pos.lerpVectors(a.pos, b.pos, alpha);
    res.tangent.lerpVectors(a.tangent, b.tangent, alpha).normalize();
    res.normal.lerpVectors(a.normal, b.normal, alpha);
    res.normal.addScaledVector(res.tangent, -res.normal.dot(res.tangent)).normalize();
    res.binormal.crossVectors(res.tangent, res.normal).normalize();
    res.curvature = a.curvature + (b.curvature - a.curvature) * alpha;
    res.tubeRadius = a.tubeRadius + (b.tubeRadius - a.tubeRadius) * alpha;
    return res;
  }

  public localToWorld(
    s: number,
    u: number,
    v: number,
    target = new THREE.Vector3(),
    scratchFrame?: FrameSample,
  ): THREE.Vector3 {
    const frame = this.sampleFrame(s, scratchFrame);
    return target
      .copy(frame.pos)
      .addScaledVector(frame.normal, u)
      .addScaledVector(frame.binormal, v);
  }

  public findNearestS(worldPos: THREE.Vector3): number {
    let bestS = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const d2 = this.samples[i].pos.distanceToSquared(worldPos);
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestS = this.samples[i].s;
      }
    }
    return bestS;
  }

  public getUniformSamples(): readonly FrameSample[] {
    return this.samples;
  }
}

export { STRAIGHT_X, STRAIGHT_Z, CORNER_ARC };
