export interface SnellResult {
  thetaTransRad: number | null;
  criticalAngleRad: number | null;
  isTIR: boolean;
  reflectance: number;
}

export function computeSnellRefraction(
  thetaIncRad: number,
  n1: number,
  n2: number,
): SnellResult {
  const clampedInc = Math.max(0, Math.min(Math.PI * 0.499, Math.abs(thetaIncRad)));
  const sinInc = Math.sin(clampedInc);
  const cosInc = Math.cos(clampedInc);
  const safeN2 = Math.max(1e-6, n2);
  const sinT = (n1 / safeN2) * sinInc;
  const criticalAngleRad = n1 > safeN2 ? Math.asin(safeN2 / n1) : null;

  if (Math.abs(sinT) >= 1) {
    return {
      thetaTransRad: null,
      criticalAngleRad,
      isTIR: true,
      reflectance: 1,
    };
  }

  const thetaTransRad = Math.asin(sinT);
  const cosT = Math.cos(thetaTransRad);
  const rs = (n1 * cosInc - safeN2 * cosT) / Math.max(1e-9, n1 * cosInc + safeN2 * cosT);
  const rp = (n1 * cosT - safeN2 * cosInc) / Math.max(1e-9, n1 * cosT + safeN2 * cosInc);

  return {
    thetaTransRad,
    criticalAngleRad,
    isTIR: false,
    reflectance: 0.5 * (rs * rs + rp * rp),
  };
}

/**
 * Cauchy optical dispersion index n(lambda_nm) = A + B / lambda^2.
 */
export function cauchyIndex(wavelengthNm: number, a = 1.504, b = 42000): number {
  const wl = Math.max(200, wavelengthNm);
  return a + b / (wl * wl);
}

export interface ThinLensSolution {
  imageDist: number;
  magnification: number;
  isReal: boolean;
}

export function solveThinLens(objectDist: number, focalLength: number): ThinLensSolution {
  const safeDo = Math.max(0.1, objectDist);
  const denom = safeDo - focalLength;
  const imageDist = Math.abs(denom) < 1e-6 ? 1e6 : (safeDo * focalLength) / denom;
  const magnification = -imageDist / safeDo;
  return {
    imageDist,
    magnification,
    isReal: imageDist > 0,
  };
}

export interface MalusStackResult {
  i1: number;
  i2: number;
  i3: number;
}

export function evaluateMalusStack(
  theta1Deg: number,
  theta2Deg: number,
  theta3Deg: number,
  useMiddle: boolean,
): MalusStackResult {
  const d2r = Math.PI / 180;
  const i1 = 0.5;
  if (!useMiddle) {
    const c13 = Math.cos((theta3Deg - theta1Deg) * d2r);
    return {
      i1,
      i2: i1,
      i3: i1 * c13 * c13,
    };
  }
  const c12 = Math.cos((theta2Deg - theta1Deg) * d2r);
  const i2 = i1 * c12 * c12;
  const c23 = Math.cos((theta3Deg - theta2Deg) * d2r);
  const i3 = i2 * c23 * c23;
  return { i1, i2, i3 };
}
