import { describe, expect, it } from 'vitest';
import {
  computeIcfYield,
  computeLawsonMetrics,
  computeStellarCore,
  gamowTunnelingFactor,
} from '../src/physics/fusionPhysics';
import { FusionLab } from '../src/labs/fusionLab';
import { buildSoloVolumeShareUrl } from '../src/ui/shareVolumeModal';

describe('Volume XI: Stellar Fusion & Tokamak Plasma + Solo Share URLs', () => {
  it('computes Gamow tunneling and Lawson ignition metrics accurately', () => {
    expect(gamowTunnelingFactor(20)).toBeLessThan(gamowTunnelingFactor(160));
    const low = computeLawsonMetrics(4.0, 60, 0.8);
    const high = computeLawsonMetrics(12.0, 160, 4.5);
    expect(high.fusionGainQ).toBeGreaterThan(low.fusionGainQ);
    expect(high.ignited).toBe(true);
    expect(high.magneticPressureAtm).toBeGreaterThan(500);
  });

  it('models NIF-style ICF ignition cliff around 2.0 MJ and solar L ∝ M^3.5 scaling', () => {
    const sub = computeIcfYield(1.0);
    const ign = computeIcfYield(2.4);
    expect(sub.ignited).toBe(false);
    expect(ign.ignited).toBe(true);
    expect(ign.gainQ).toBeGreaterThan(1.0);

    const sun = computeStellarCore(1.0);
    const giant = computeStellarCore(2.0);
    expect(sun.luminositySolar).toBeCloseTo(1.0, 5);
    expect(giant.luminositySolar).toBeCloseTo(Math.pow(2.0, 3.5), 4);
  });

  it('builds clean single-volume Solo Screen-in-Screen share URLs for any volume', () => {
    const url = buildSoloVolumeShareUrl('fusion', 'fus-tokamak', 'https://yanidv-lab.github.io/physics-project-book/');
    expect(url).toContain('volume=fusion');
    expect(url).toContain('chapter=fus-tokamak');
    expect(url).toContain('solo=1');
  });

  it('instantiates FusionLab and steps all 4 chapters cleanly', () => {
    const lab = new FusionLab();
    for (const ch of ['fus-tokamak', 'fus-tunnel', 'fus-icf', 'fus-stellar']) {
      lab.activate(ch);
      lab.update(0.05);
      expect(lab.getTelemetry().length).toBe(4);
      expect(lab.getFormula().tex.length).toBeGreaterThan(5);
    }
    lab.dispose();
  });
});
