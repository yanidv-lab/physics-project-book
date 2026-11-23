export interface DoubleSlitSample {
  height: number;
  envelope: number;
}

export function evaluateDoubleSlit(
  x: number,
  z: number,
  t: number,
  k: number,
  omega: number,
  slitSep: number,
  singleSource = false,
): DoubleSlitSample {
  const srcX = -8.5;
  if (singleSource) {
    const r = Math.sqrt((x - srcX) ** 2 + z * z + 0.65);
    const amp = 1.4 / Math.sqrt(r);
    return {
      height: amp * Math.sin(k * r - omega * t),
      envelope: amp,
    };
  }

  const halfD = slitSep * 0.5;
  const r1 = Math.sqrt((x - srcX) ** 2 + (z - halfD) ** 2 + 0.65);
  const r2 = Math.sqrt((x - srcX) ** 2 + (z + halfD) ** 2 + 0.65);
  const a1 = 1.05 / Math.sqrt(r1);
  const a2 = 1.05 / Math.sqrt(r2);
  const h = a1 * Math.sin(k * r1 - omega * t) + a2 * Math.sin(k * r2 - omega * t);
  const dPhi = k * (r1 - r2);
  const env = Math.sqrt(a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(dPhi));
  return { height: h, envelope: env };
}

export type VectorFieldMode = 'gradient' | 'divergence' | 'curl';

export function evaluateVectorField(
  x: number,
  z: number,
  mode: VectorFieldMode,
): { terrainHeight: number; fx: number; fz: number } {
  if (mode === 'gradient') {
    // Gaussian hill + secondary peak; analytic gradient points uphill
    const g1 = 3.2 * Math.exp(-(x * x + z * z) / 26);
    const dx2 = x - 3.6;
    const dz2 = z - 2.4;
    const g2 = -2.2 * Math.exp(-(dx2 * dx2 + dz2 * dz2) / 16);
    const fx = g1 * ((-2 * x) / 26) + g2 * ((-2 * dx2) / 16);
    const fz = g1 * ((-2 * z) / 26) + g2 * ((-2 * dz2) / 16);
    return { terrainHeight: g1 + g2, fx: fx * 5.5, fz: fz * 5.5 };
  }

  if (mode === 'divergence') {
    // Positive source at (-4, 0) and negative sink at (+4, 0)
    const eps2 = 1.1;
    const dx1 = x + 4;
    const r1Sq = dx1 * dx1 + z * z + eps2;
    const dx2 = x - 4;
    const r2Sq = dx2 * dx2 + z * z + eps2;

    const p1 = 4.2 / Math.sqrt(r1Sq);
    const p2 = -4.2 / Math.sqrt(r2Sq);
    const fx = (4.2 * dx1) / (r1Sq * Math.sqrt(r1Sq)) - (4.2 * dx2) / (r2Sq * Math.sqrt(r2Sq));
    const fz = (4.2 * z) / (r1Sq * Math.sqrt(r1Sq)) - (4.2 * z) / (r2Sq * Math.sqrt(r2Sq));
    return { terrainHeight: p1 + p2, fx: fx * 4.5, fz: fz * 4.5 };
  }

  // Vortex curl field rotating counter-clockwise around origin
  const r2 = x * x + z * z + 1.8;
  const terrainHeight = -3.4 / Math.sqrt(r2);
  const scale = 6.5 / r2;
  return {
    terrainHeight,
    fx: -z * scale,
    fz: x * scale,
  };
}

/**
 * Exact unitary 1D Crank-Nicolson Time-Dependent Schrödinger Equation solver:
 * i * d(psi)/dt = (-0.5 * d^2/dx^2 + V(x)) * psi
 */
export class QuantumTunnelingSolver {
  public readonly n: number;
  public readonly dx: number;
  public readonly xMin: number;

  public readonly psiRe: Float64Array;
  public readonly psiIm: Float64Array;
  public readonly potential: Float64Array;

  private readonly cPrimeRe: Float64Array;
  private readonly cPrimeIm: Float64Array;
  private readonly dPrimeRe: Float64Array;
  private readonly dPrimeIm: Float64Array;
  private readonly rhsRe: Float64Array;
  private readonly rhsIm: Float64Array;

  public barrierCenter = 0;
  public barrierWidth = 1.6;
  public barrierHeight = 1.8;

  constructor(n = 180, dx = 0.25) {
    this.n = n;
    this.dx = dx;
    this.xMin = -0.5 * n * dx;

    this.psiRe = new Float64Array(n);
    this.psiIm = new Float64Array(n);
    this.potential = new Float64Array(n);

    this.cPrimeRe = new Float64Array(n);
    this.cPrimeIm = new Float64Array(n);
    this.dPrimeRe = new Float64Array(n);
    this.dPrimeIm = new Float64Array(n);
    this.rhsRe = new Float64Array(n);
    this.rhsIm = new Float64Array(n);

    this.reset(1.8, 1.6, 2.0);
  }

  public getX(index: number): number {
    return this.xMin + index * this.dx;
  }

  public updateBarrier(barrierHeight: number, barrierWidth = 1.6): void {
    this.barrierHeight = barrierHeight;
    this.barrierWidth = barrierWidth;
    const halfW = barrierWidth * 0.5;
    for (let j = 0; j < this.n; j++) {
      const x = this.getX(j);
      this.potential[j] = Math.abs(x - this.barrierCenter) <= halfW ? barrierHeight : 0;
    }
  }

  public reset(barrierHeight = 1.8, barrierWidth = 1.6, k0 = 2.0): void {
    this.updateBarrier(barrierHeight, barrierWidth);
    const x0 = -9.5;
    const sigma = 2.0;

    let norm = 0;
    for (let j = 0; j < this.n; j++) {
      const x = this.getX(j);
      const env = Math.exp(-((x - x0) * (x - x0)) / (2 * sigma * sigma));
      const re = env * Math.cos(k0 * x);
      const im = env * Math.sin(k0 * x);
      this.psiRe[j] = re;
      this.psiIm[j] = im;
      norm += (re * re + im * im) * this.dx;
    }
    const invSqrt = 1 / Math.sqrt(Math.max(1e-12, norm));
    for (let j = 0; j < this.n; j++) {
      this.psiRe[j] *= invSqrt;
      this.psiIm[j] *= invSqrt;
    }
  }

  public step(dt = 0.045): void {
    const n = this.n;
    const alpha = dt / (4 * this.dx * this.dx); // i * alpha on off-diagonals
    const halfDt = 0.5 * dt;

    // Build RHS r = (I - i * dt/2 * H) psi
    // Off-diagonal coupling is +i*alpha*psi_{j-1} + i*alpha*psi_{j+1}
    for (let j = 0; j < n; j++) {
      const pRe = this.psiRe[j];
      const pIm = this.psiIm[j];
      const diagIm = -2 * alpha - halfDt * this.potential[j];

      const leftRe = j > 0 ? this.psiRe[j - 1] : 0;
      const leftIm = j > 0 ? this.psiIm[j - 1] : 0;
      const rightRe = j < n - 1 ? this.psiRe[j + 1] : 0;
      const rightIm = j < n - 1 ? this.psiIm[j + 1] : 0;

      // (1 + i*diagIm)(pRe + i*pIm) + i*alpha*(left + right)
      this.rhsRe[j] = pRe - diagIm * pIm - alpha * (leftIm + rightIm);
      this.rhsIm[j] = pIm + diagIm * pRe + alpha * (leftRe + rightRe);
    }

    // Solve tridiagonal system A * psi_next = rhs using complex Thomas algorithm
    // Sub/super diagonal: a = c = -i * alpha -> (0, -alpha)
    // Diagonal b_j = 1 + i * (2 * alpha + halfDt * V_j)
    const cRe = 0;
    const cIm = -alpha;
    const aRe = 0;
    const aIm = -alpha;

    // j = 0
    const b0Re = 1;
    const b0Im = 2 * alpha + halfDt * this.potential[0];
    const den0 = b0Re * b0Re + b0Im * b0Im;
    this.cPrimeRe[0] = (cRe * b0Re + cIm * b0Im) / den0;
    this.cPrimeIm[0] = (cIm * b0Re - cRe * b0Im) / den0;
    this.dPrimeRe[0] = (this.rhsRe[0] * b0Re + this.rhsIm[0] * b0Im) / den0;
    this.dPrimeIm[0] = (this.rhsIm[0] * b0Re - this.rhsRe[0] * b0Im) / den0;

    for (let j = 1; j < n; j++) {
      const bjRe = 1;
      const bjIm = 2 * alpha + halfDt * this.potential[j];
      const prevCRe = this.cPrimeRe[j - 1];
      const prevCIm = this.cPrimeIm[j - 1];
      const prevDRe = this.dPrimeRe[j - 1];
      const prevDIm = this.dPrimeIm[j - 1];

      // denom = b_j - a * c'_{j-1}
      const acRe = aRe * prevCRe - aIm * prevCIm;
      const acIm = aRe * prevCIm + aIm * prevCRe;
      const dRe = bjRe - acRe;
      const dIm = bjIm - acIm;
      const dSq = dRe * dRe + dIm * dIm;

      if (j < n - 1) {
        this.cPrimeRe[j] = (cRe * dRe + cIm * dIm) / dSq;
        this.cPrimeIm[j] = (cIm * dRe - cRe * dIm) / dSq;
      }

      // num = rhs_j - a * d'_{j-1}
      const adRe = aRe * prevDRe - aIm * prevDIm;
      const adIm = aRe * prevDIm + aIm * prevDRe;
      const numRe = this.rhsRe[j] - adRe;
      const numIm = this.rhsIm[j] - adIm;
      this.dPrimeRe[j] = (numRe * dRe + numIm * dIm) / dSq;
      this.dPrimeIm[j] = (numIm * dRe - numRe * dIm) / dSq;
    }

    // Back substitution
    this.psiRe[n - 1] = this.dPrimeRe[n - 1];
    this.psiIm[n - 1] = this.dPrimeIm[n - 1];
    for (let j = n - 2; j >= 0; j--) {
      const nextRe = this.psiRe[j + 1];
      const nextIm = this.psiIm[j + 1];
      const cpRe = this.cPrimeRe[j];
      const cpIm = this.cPrimeIm[j];
      this.psiRe[j] = this.dPrimeRe[j] - (cpRe * nextRe - cpIm * nextIm);
      this.psiIm[j] = this.dPrimeIm[j] - (cpRe * nextIm + cpIm * nextRe);
    }
  }

  public getNorm(): number {
    let sum = 0;
    for (let j = 0; j < this.n; j++) {
      sum += (this.psiRe[j] * this.psiRe[j] + this.psiIm[j] * this.psiIm[j]) * this.dx;
    }
    return sum;
  }

  public getProbabilities(): { reflected: number; barrier: number; transmitted: number } {
    const halfW = this.barrierWidth * 0.5;
    let reflected = 0;
    let barrier = 0;
    let transmitted = 0;
    for (let j = 0; j < this.n; j++) {
      const x = this.getX(j);
      const p = (this.psiRe[j] * this.psiRe[j] + this.psiIm[j] * this.psiIm[j]) * this.dx;
      if (x < this.barrierCenter - halfW) reflected += p;
      else if (x > this.barrierCenter + halfW) transmitted += p;
      else barrier += p;
    }
    return { reflected, barrier, transmitted };
  }
}
