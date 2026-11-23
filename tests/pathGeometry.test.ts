import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { TopologyId } from '../src/types/simulation';
import { PathGeometry } from '../src/physics/pathGeometry';

const TOPOLOGIES: TopologyId[] = ['simple-r', 'rc', 'rlc', 'divider'];

describe('PathGeometry Closed Spline & Twist-Free Bishop Frame', () => {
  for (const topology of TOPOLOGIES) {
    it(`closes smoothly with orthonormal right-handed twist-free frames for ${topology}`, () => {
      const path = new PathGeometry(topology);
      const L = path.totalLength;
      expect(L).toBeGreaterThan(95);

      const f0 = path.sampleFrame(0);
      const fEnd = path.sampleFrame(L - 1e-6);

      // Position closure
      expect(f0.pos.distanceTo(fEnd.pos)).toBeLessThan(1e-3);

      // Twist-free seam closure
      expect(f0.normal.dot(fEnd.normal)).toBeGreaterThan(0.999);
      expect(f0.binormal.dot(fEnd.binormal)).toBeGreaterThan(0.999);
      expect(f0.tangent.dot(fEnd.tangent)).toBeGreaterThan(0.999);

      // Check orthonormality and det([N, B, T]) = +1 across dense samples
      const samples = path.getUniformSamples();
      for (let i = 0; i < samples.length; i += 25) {
        const s = samples[i];
        expect(s.tangent.length()).toBeCloseTo(1, 5);
        expect(s.normal.length()).toBeCloseTo(1, 5);
        expect(s.binormal.length()).toBeCloseTo(1, 5);

        expect(Math.abs(s.tangent.dot(s.normal))).toBeLessThan(1e-6);
        expect(Math.abs(s.tangent.dot(s.binormal))).toBeLessThan(1e-6);
        expect(Math.abs(s.normal.dot(s.binormal))).toBeLessThan(1e-6);

        const crossBT = new THREE.Vector3().crossVectors(s.binormal, s.tangent);
        const det = s.normal.dot(crossBT);
        expect(det).toBeCloseTo(1, 5);
      }
    });
  }
});
