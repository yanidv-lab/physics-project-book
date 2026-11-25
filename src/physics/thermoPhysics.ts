export function carnotEfficiency(tHotK: number, tColdK: number): number {
  if (tHotK <= 0 || tColdK < 0 || tColdK >= tHotK) return 0;
  return 1 - tColdK / tHotK;
}

export function idealGasPressure(nParticles: number, tempK: number, volume: number): number {
  const safeV = Math.max(1e-6, volume);
  const kSim = 0.0138;
  return (nParticles * kSim * Math.max(0, tempK)) / safeV;
}

function sideMixingEntropy(redCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  const pRed = redCount / totalCount;
  const pBlue = 1 - pRed;
  let s = 0;
  if (pRed > 0 && pRed < 1) s -= pRed * Math.log(pRed);
  if (pBlue > 0 && pBlue < 1) s -= pBlue * Math.log(pBlue);
  return s;
}

/**
 * Computes average dimensionless Boltzmann/Shannon mixing entropy per particle (max ln 2 for 50/50).
 */
export function shannonMixingEntropy(
  leftRed: number,
  leftTotal: number,
  rightRed: number,
  rightTotal: number,
): number {
  const total = leftTotal + rightTotal;
  if (total <= 0) return 0;
  const sL = sideMixingEntropy(leftRed, leftTotal);
  const sR = sideMixingEntropy(rightRed, rightTotal);
  return (leftTotal * sL + rightTotal * sR) / total;
}

/**
 * Advances 3D gas particles with elastic specular reflections inside [-halfX, +halfX] x [-halfY, +halfY] x [-halfZ, +halfZ].
 * Returns accumulated scalar wall momentum transfer impulse for pressure estimation.
 */
export function stepGasParticles(
  pos: Float32Array,
  vel: Float32Array,
  halfX: number,
  halfY: number,
  halfZ: number,
  dt: number,
  speedScale: number,
): number {
  const count = Math.floor(pos.length / 3);
  let impulseSum = 0;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const iy = ix + 1;
    const iz = ix + 2;

    let x = pos[ix] + vel[ix] * speedScale * dt;
    let y = pos[iy] + vel[iy] * speedScale * dt;
    let z = pos[iz] + vel[iz] * speedScale * dt;

    if (x > halfX) {
      x = halfX - (x - halfX);
      vel[ix] = -Math.abs(vel[ix]);
      impulseSum += 2 * Math.abs(vel[ix]) * speedScale;
    } else if (x < -halfX) {
      x = -halfX + (-halfX - x);
      vel[ix] = Math.abs(vel[ix]);
      impulseSum += 2 * Math.abs(vel[ix]) * speedScale;
    }

    if (y > halfY) {
      y = halfY - (y - halfY);
      vel[iy] = -Math.abs(vel[iy]);
      impulseSum += 2 * Math.abs(vel[iy]) * speedScale;
    } else if (y < -halfY) {
      y = -halfY + (-halfY - y);
      vel[iy] = Math.abs(vel[iy]);
      impulseSum += 2 * Math.abs(vel[iy]) * speedScale;
    }

    if (z > halfZ) {
      z = halfZ - (z - halfZ);
      vel[iz] = -Math.abs(vel[iz]);
      impulseSum += 2 * Math.abs(vel[iz]) * speedScale;
    } else if (z < -halfZ) {
      z = -halfZ + (-halfZ - z);
      vel[iz] = Math.abs(vel[iz]);
      impulseSum += 2 * Math.abs(vel[iz]) * speedScale;
    }

    pos[ix] = x;
    pos[iy] = y;
    pos[iz] = z;
  }

  return impulseSum;
}
