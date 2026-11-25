export interface DoublePendulumState {
  theta1: number;
  omega1: number;
  theta2: number;
  omega2: number;
}

function pendulumDerivs(
  s: DoublePendulumState,
  m1: number,
  m2: number,
  l1: number,
  l2: number,
  g: number,
): DoublePendulumState {
  const delta = s.theta1 - s.theta2;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);
  const denomBase = 2 * m1 + m2 - m2 * Math.cos(2 * delta);

  const num1 =
    -g * (2 * m1 + m2) * Math.sin(s.theta1) -
    m2 * g * Math.sin(s.theta1 - 2 * s.theta2) -
    2 * sinD * m2 * (s.omega2 * s.omega2 * l2 + s.omega1 * s.omega1 * l1 * cosD);
  const alpha1 = num1 / (l1 * denomBase);

  const num2 =
    2 *
    sinD *
    (s.omega1 * s.omega1 * l1 * (m1 + m2) +
      g * (m1 + m2) * Math.cos(s.theta1) +
      s.omega2 * s.omega2 * l2 * m2 * cosD);
  const alpha2 = num2 / (l2 * denomBase);

  return {
    theta1: s.omega1,
    omega1: alpha1,
    theta2: s.omega2,
    omega2: alpha2,
  };
}

export function stepDoublePendulumRK4(
  state: DoublePendulumState,
  m1: number,
  m2: number,
  l1: number,
  l2: number,
  g: number,
  dt: number,
): void {
  const k1 = pendulumDerivs(state, m1, m2, l1, l2, g);
  const k2 = pendulumDerivs(
    {
      theta1: state.theta1 + 0.5 * dt * k1.theta1,
      omega1: state.omega1 + 0.5 * dt * k1.omega1,
      theta2: state.theta2 + 0.5 * dt * k1.theta2,
      omega2: state.omega2 + 0.5 * dt * k1.omega2,
    },
    m1,
    m2,
    l1,
    l2,
    g,
  );
  const k3 = pendulumDerivs(
    {
      theta1: state.theta1 + 0.5 * dt * k2.theta1,
      omega1: state.omega1 + 0.5 * dt * k2.omega1,
      theta2: state.theta2 + 0.5 * dt * k2.theta2,
      omega2: state.omega2 + 0.5 * dt * k2.omega2,
    },
    m1,
    m2,
    l1,
    l2,
    g,
  );
  const k4 = pendulumDerivs(
    {
      theta1: state.theta1 + dt * k3.theta1,
      omega1: state.omega1 + dt * k3.omega1,
      theta2: state.theta2 + dt * k3.theta2,
      omega2: state.omega2 + dt * k3.omega2,
    },
    m1,
    m2,
    l1,
    l2,
    g,
  );

  const dt6 = dt / 6;
  state.theta1 += dt6 * (k1.theta1 + 2 * k2.theta1 + 2 * k3.theta1 + k4.theta1);
  state.omega1 += dt6 * (k1.omega1 + 2 * k2.omega1 + 2 * k3.omega1 + k4.omega1);
  state.theta2 += dt6 * (k1.theta2 + 2 * k2.theta2 + 2 * k3.theta2 + k4.theta2);
  state.omega2 += dt6 * (k1.omega2 + 2 * k2.omega2 + 2 * k3.omega2 + k4.omega2);
}

export function doublePendulumEnergy(
  state: DoublePendulumState,
  m1: number,
  m2: number,
  l1: number,
  l2: number,
  g: number,
): number {
  const y1 = -l1 * Math.cos(state.theta1);
  const y2 = y1 - l2 * Math.cos(state.theta2);
  const v1Sq = l1 * l1 * state.omega1 * state.omega1;
  const v2Sq =
    v1Sq +
    l2 * l2 * state.omega2 * state.omega2 +
    2 * l1 * l2 * state.omega1 * state.omega2 * Math.cos(state.theta1 - state.theta2);
  const kinetic = 0.5 * m1 * v1Sq + 0.5 * m2 * v2Sq;
  const potential = m1 * g * y1 + m2 * g * y2;
  return kinetic + potential;
}

export type CoupledModeKind = 'symmetric' | 'antisymmetric' | 'beat';

export function evaluateCoupledModes(
  t: number,
  kWall: number,
  kCouple: number,
  mass: number,
  mode: CoupledModeKind,
): { x1: number; x2: number; omega1: number; omega2: number } {
  const safeM = Math.max(0.1, mass);
  const omega1 = Math.sqrt(Math.max(0.1, kWall) / safeM);
  const omega2 = Math.sqrt((Math.max(0.1, kWall) + 2 * Math.max(0, kCouple)) / safeM);

  if (mode === 'symmetric') {
    const x = 1.45 * Math.cos(omega1 * t);
    return { x1: x, x2: x, omega1, omega2 };
  }
  if (mode === 'antisymmetric') {
    const x = 1.45 * Math.cos(omega2 * t);
    return { x1: x, x2: -x, omega1, omega2 };
  }
  const c1 = Math.cos(omega1 * t);
  const c2 = Math.cos(omega2 * t);
  return {
    x1: 0.85 * (c1 + c2),
    x2: 0.85 * (c1 - c2),
    omega1,
    omega2,
  };
}

export function gyroPrecessionRate(
  mass: number,
  g: number,
  pivotR: number,
  inertia: number,
  spinOmega: number,
): number {
  return (mass * g * pivotR) / Math.max(1e-4, inertia * Math.max(0.5, Math.abs(spinOmega)));
}

export function rotatingFramePosition(
  x0: number,
  z0: number,
  vx: number,
  vz: number,
  omega: number,
  t: number,
): { xInertial: number; zInertial: number; xRot: number; zRot: number } {
  const xInertial = x0 + vx * t;
  const zInertial = z0 + vz * t;
  const cosA = Math.cos(omega * t);
  const sinA = Math.sin(omega * t);
  return {
    xInertial,
    zInertial,
    xRot: xInertial * cosA + zInertial * sinA,
    zRot: -xInertial * sinA + zInertial * cosA,
  };
}
