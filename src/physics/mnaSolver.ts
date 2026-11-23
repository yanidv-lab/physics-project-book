export interface MNAResistor {
  n1: number;
  n2: number;
  resistance: number;
}

export interface MNAVoltageSource {
  nPos: number;
  nNeg: number;
  voltage: number;
}

export interface MNACapacitor {
  id: string;
  nPos: number;
  nNeg: number;
  capacitance: number;
  prevV: number;
  prevI: number;
}

export interface MNAInductor {
  id: string;
  nPos: number;
  nNeg: number;
  inductance: number;
  prevV: number;
  prevI: number;
}

export interface MNANetlist {
  numNodes: number; // Highest node index (nodes 0..numNodes, where 0 is ground)
  resistors: MNAResistor[];
  voltageSources: MNAVoltageSource[];
  capacitors: MNACapacitor[];
  inductors: MNAInductor[];
}

export interface MNASolution {
  nodeVoltages: number[];
  sourceCurrents: number[];
  capacitorStates: Record<string, { v: number; i: number }>;
  inductorStates: Record<string, { v: number; i: number }>;
}

/**
 * General linear Modified Nodal Analysis (MNA) solver supporting Resistors,
 * Independent Voltage Sources, and Trapezoidal / Backward-Euler reactive
 * companion models for Capacitors and Inductors.
 */
export class MNASolver {
  static solve(
    netlist: MNANetlist,
    dt: number,
    useBackwardEuler = false,
  ): MNASolution {
    const N = netlist.numNodes; // Unknown node voltages: 1..N (node 0 is ground = 0 V)
    const M_v = netlist.voltageSources.length;
    const M_l = netlist.inductors.length;
    const size = N + M_v + M_l;

    const A: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const b: number[] = new Array<number>(size).fill(0);

    const addConductance = (n1: number, n2: number, g: number) => {
      if (n1 > 0) A[n1 - 1][n1 - 1] += g;
      if (n2 > 0) A[n2 - 1][n2 - 1] += g;
      if (n1 > 0 && n2 > 0) {
        A[n1 - 1][n2 - 1] -= g;
        A[n2 - 1][n1 - 1] -= g;
      }
    };

    const addCurrentSource = (nFrom: number, nTo: number, iVal: number) => {
      // Current iVal leaves nFrom and enters nTo
      if (nFrom > 0) b[nFrom - 1] -= iVal;
      if (nTo > 0) b[nTo - 1] += iVal;
    };

    // 1. Stamp resistors
    for (const r of netlist.resistors) {
      const safeR = Math.max(1e-12, r.resistance);
      addConductance(r.n1, r.n2, 1 / safeR);
    }

    // 2. Stamp capacitors (Trapezoidal companion or Backward Euler for step startup)
    const capCompanion: Array<{ cap: MNACapacitor; gEq: number; iEq: number }> = [];
    for (const c of netlist.capacitors) {
      if (dt <= 0) {
        throw new Error('MNASolver: dt must be positive when capacitors are present.');
      }
      const gEq = useBackwardEuler ? c.capacitance / dt : (2 * c.capacitance) / dt;
      const iEq = useBackwardEuler ? gEq * c.prevV : gEq * c.prevV + c.prevI;
      addConductance(c.nPos, c.nNeg, gEq);
      // Companion current source I_eq points from nNeg to nPos (leaves nNeg, enters nPos)
      addCurrentSource(c.nNeg, c.nPos, iEq);
      capCompanion.push({ cap: c, gEq, iEq });
    }

    // 3. Stamp independent voltage sources
    // Convention: branch current I_src leaves nPos into external circuit, enters nNeg inside circuit?
    // Wait: standard MNA KCL sums currents LEAVING node (+i_src at nPos, -i_src at nNeg).
    // That means i_src > 0 flows from nNeg to nPos through the source (conventional current leaving + terminal!).
    for (let k = 0; k < M_v; k++) {
      const vs = netlist.voltageSources[k];
      const row = N + k;
      if (vs.nPos > 0) {
        A[vs.nPos - 1][row] += 1;
        A[row][vs.nPos - 1] += 1;
      }
      if (vs.nNeg > 0) {
        A[vs.nNeg - 1][row] -= 1;
        A[row][vs.nNeg - 1] -= 1;
      }
      b[row] += vs.voltage;
    }

    // 4. Stamp inductors as extended MNA branch currents (i_L flowing from nPos to nNeg)
    // KCL leaving nPos: +i_L; leaving nNeg: -i_L
    // Branch constitutive equation:
    // Trapezoidal: v_nPos - v_nNeg - (2L/dt) * i_L = -(prevV + (2L/dt) * prevI)
    // Backward Euler: v_nPos - v_nNeg - (L/dt) * i_L = -(L/dt) * prevI
    const indCompanion: Array<{ ind: MNAInductor; rEq: number }> = [];
    for (let k = 0; k < M_l; k++) {
      const ind = netlist.inductors[k];
      if (dt <= 0) {
        throw new Error('MNASolver: dt must be positive when inductors are present.');
      }
      const row = N + M_v + k;
      const rEq = useBackwardEuler ? ind.inductance / dt : (2 * ind.inductance) / dt;
      if (ind.nPos > 0) {
        A[ind.nPos - 1][row] += 1;
        A[row][ind.nPos - 1] += 1;
      }
      if (ind.nNeg > 0) {
        A[ind.nNeg - 1][row] -= 1;
        A[row][ind.nNeg - 1] -= 1;
      }
      A[row][row] -= rEq;
      b[row] += useBackwardEuler ? -rEq * ind.prevI : -(ind.prevV + rEq * ind.prevI);
      indCompanion.push({ ind, rEq });
    }

    const x = size > 0 ? solveLinearSystem(A, b) : [];

    const nodeVoltages = new Array<number>(N + 1).fill(0);
    for (let i = 1; i <= N; i++) {
      nodeVoltages[i] = x[i - 1];
    }

    const sourceCurrents = new Array<number>(M_v);
    for (let k = 0; k < M_v; k++) {
      sourceCurrents[k] = x[N + k];
    }

    const capacitorStates: Record<string, { v: number; i: number }> = {};
    for (const item of capCompanion) {
      const v = nodeVoltages[item.cap.nPos] - nodeVoltages[item.cap.nNeg];
      const i = useBackwardEuler
        ? item.gEq * (v - item.cap.prevV)
        : item.gEq * (v - item.cap.prevV) - item.cap.prevI;
      capacitorStates[item.cap.id] = { v, i };
    }

    const inductorStates: Record<string, { v: number; i: number }> = {};
    for (let k = 0; k < M_l; k++) {
      const { ind } = indCompanion[k];
      const v = nodeVoltages[ind.nPos] - nodeVoltages[ind.nNeg];
      const i = x[N + M_v + k];
      inductorStates[ind.id] = { v, i };
    }

    return {
      nodeVoltages,
      sourceCurrents,
      capacitorStates,
      inductorStates,
    };
  }
}

/**
 * Exact Gaussian elimination with partial pivoting for small dense MNA matrices.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const mat = A.map((row, idx) => [...row, b[idx]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(mat[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(mat[row][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }

    if (maxVal < 1e-14) {
      throw new Error(`MNASolver: singular matrix at pivot ${col}`);
    }

    if (pivotRow !== col) {
      const tmp = mat[col];
      mat[col] = mat[pivotRow];
      mat[pivotRow] = tmp;
    }

    const pivot = mat[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = mat[row][col] / pivot;
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        mat[row][j] -= factor * mat[col][j];
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = mat[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= mat[i][j] * x[j];
    }
    x[i] = sum / mat[i][i];
  }

  return x;
}
