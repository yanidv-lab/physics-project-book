import * as THREE from 'three';
import {
  QuantumTunnelingSolver,
  evaluateDoubleSlit,
  evaluateVectorField,
  type VectorFieldMode,
} from '../physics/quantumWavePhysics';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type WavesChapterId = 'wave-interference' | 'wave-standing' | 'wave-tunneling' | 'wave-vectorfield';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

const SLIT_SEGS = 72;
const STANDING_PTS = 120;
const VF_GRID = 13;
const VF_TRACERS = 220;

export class WavesLab implements LabModule {
  public readonly topicId = 'waves' as const;
  public readonly group = new THREE.Group();

  private chapterId: WavesChapterId = 'wave-interference';
  private simTime = 0;

  // 1. Double Slit
  private wavelength = 3.2;
  private slitSep = 5.4;
  private singleSource = false;
  private slitGeom: THREE.PlaneGeometry | null = null;
  private slitMesh: THREE.Mesh | null = null;

  // 2. Standing Wave
  private harmonic = 3;
  private waveAmp = 2.6;
  private standingLine: THREE.Line | null = null;
  private standingEnvPos: THREE.Line | null = null;
  private standingEnvNeg: THREE.Line | null = null;
  private nodeSpheres: THREE.Mesh[] = [];
  private antiSpheres: THREE.Mesh[] = [];

  // 3. Quantum Tunneling
  private barrierHeight = 1.8;
  private packetK = 2.0;
  private qSolver = new QuantumTunnelingSolver(180, 0.25);
  private barrierMesh: THREE.Mesh | null = null;
  private probCurtain: THREE.Mesh | null = null;
  private phaseHelixLine: THREE.Line | null = null;
  private realShadowLine: THREE.Line | null = null;
  private lastProbs = { reflected: 0, barrier: 0, transmitted: 0 };

  // 4. Vector Field Explorer
  private fieldMode: VectorFieldMode = 'curl';
  private showTerrain = true;
  private vfTerrainMesh: THREE.Mesh | null = null;
  private vfArrowShafts: THREE.InstancedMesh | null = null;
  private vfArrowHeads: THREE.InstancedMesh | null = null;
  private vfTracerMesh: THREE.InstancedMesh | null = null;
  private vfTracerPos = new Float32Array(VF_TRACERS * 2);

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private readonly cTrough = new THREE.Color(0xec4899);
  private readonly cNeutral = new THREE.Color(0x0b1326);
  private readonly cCrest = new THREE.Color(0x00f0ff);
  private readonly tmpCol = new THREE.Color();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  public activate(chapterId: string): void {
    const valid: WavesChapterId[] = [
      'wave-interference',
      'wave-standing',
      'wave-tunneling',
      'wave-vectorfield',
    ];
    this.chapterId = valid.includes(chapterId as WavesChapterId)
      ? (chapterId as WavesChapterId)
      : 'wave-interference';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'relaunchPacket') {
      this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
      return;
    }
    if (typeof apply.singleSource === 'boolean') {
      this.singleSource = apply.singleSource;
      this.rebuildScene();
    }
    if (typeof apply.harmonic === 'number') {
      this.harmonic = apply.harmonic;
      this.rebuildScene();
    }
    if (typeof apply.barrierHeight === 'number') {
      this.barrierHeight = apply.barrierHeight;
      this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
      this.rebuildScene();
    }
    if (typeof apply.fieldMode === 'string') {
      this.fieldMode = apply.fieldMode as VectorFieldMode;
      this.rebuildScene();
    }
  }

  public reset(): void {
    this.simTime = 0;
    this.rebuildScene();
  }

  private track<T extends { dispose: () => void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private clearScene(): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.hitTargets = [];
    this.nodeSpheres = [];
    this.antiSpheres = [];
    this.slitGeom = null;
    this.slitMesh = null;
    this.standingLine = null;
    this.standingEnvPos = null;
    this.standingEnvNeg = null;
    this.barrierMesh = null;
    this.probCurtain = null;
    this.phaseHelixLine = null;
    this.realShadowLine = null;
    this.vfTerrainMesh = null;
    this.vfArrowShafts = null;
    this.vfArrowHeads = null;
    this.vfTracerMesh = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;

    if (this.chapterId === 'wave-interference') this.buildInterferenceScene();
    else if (this.chapterId === 'wave-standing') this.buildStandingScene();
    else if (this.chapterId === 'wave-tunneling') this.buildTunnelingScene();
    else this.buildVectorFieldScene();
  }

  // ---------------- 1. DOUBLE SLIT INTERFERENCE ----------------
  private buildInterferenceScene(): void {
    const geom = this.track(new THREE.PlaneGeometry(26, 26, SLIT_SEGS, SLIT_SEGS));
    geom.rotateX(-Math.PI * 0.5);
    const vCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    this.slitGeom = geom;

    const mat = this.track(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    );
    this.slitMesh = new THREE.Mesh(geom, mat);
    this.attachStudy(this.slitMesh, {
      key: 'interference-surface',
      title: '2D Wave Superposition Surface',
      badge: 'INTERFERENCE',
      accent: '#10b981',
      simple: 'Cyan bands are double-tall crests where waves reinforce; dark bands are calm lines where crests cancel troughs!',
      deeper: 'Constructive fringes satisfy path difference Δr = mλ; destructive nodal lines satisfy Δr = (m + ½)λ.',
    });
    this.group.add(this.slitMesh);

    const srcGeom = this.track(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 16));
    const srcMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.9,
      }),
    );

    const zPositions = this.singleSource ? [0] : [-this.slitSep * 0.5, this.slitSep * 0.5];
    for (let i = 0; i < zPositions.length; i++) {
      const m = new THREE.Mesh(srcGeom, srcMat);
      m.position.set(-8.5, 0.8, zPositions[i]);
      this.attachStudy(m, {
        key: `slit-src-${i}`,
        title: this.singleSource ? 'Single Wave Source' : `Coherent Slit Source ${i + 1}`,
        badge: 'EMITTER',
        accent: '#fbbf24',
        simple: 'Radiates concentric circular ripples synchronized in phase with its partner slit.',
        deeper: 'Huygens-Fresnel coherent point radiator.',
      });
      this.group.add(m);
    }
  }

  // ---------------- 2. STANDING WAVE ----------------
  private buildStandingScene(): void {
    const L = 22;
    const halfL = L * 0.5;

    // Fixed end boundary walls
    const wallG = this.track(new THREE.BoxGeometry(0.45, 7, 3.2));
    const wallM = this.track(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 }));
    for (const x of [-halfL - 0.22, halfL + 0.22]) {
      const w = new THREE.Mesh(wallG, wallM);
      w.position.set(x, 0, 0);
      this.attachStudy(w, {
        key: 'boundary-wall',
        title: 'Fixed Boundary Wall',
        badge: 'QUANTIZATION',
        accent: '#94a3b8',
        simple: 'Pins the wave amplitude to zero at the walls—forcing only whole-number half-wavelengths to fit!',
        deeper: 'Dirichlet boundary condition ψ(0) = ψ(L) = 0 quantizes k_n = nπ/L.',
      });
      this.group.add(w);
    }

    const lineG = this.track(new THREE.BufferGeometry());
    lineG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STANDING_PTS * 3), 3));
    this.standingLine = new THREE.Line(
      lineG,
      this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff })),
    );
    this.group.add(this.standingLine);

    // Envelopes
    const envPosPts = new Float32Array(STANDING_PTS * 3);
    const envNegPts = new Float32Array(STANDING_PTS * 3);
    for (let i = 0; i < STANDING_PTS; i++) {
      const u = i / (STANDING_PTS - 1);
      const x = -halfL + u * L;
      const env = this.waveAmp * Math.abs(Math.sin(this.harmonic * Math.PI * u));
      envPosPts[i * 3] = x;
      envPosPts[i * 3 + 1] = env;
      envNegPts[i * 3] = x;
      envNegPts[i * 3 + 1] = -env;
    }
    const envPosG = this.track(new THREE.BufferGeometry());
    envPosG.setAttribute('position', new THREE.BufferAttribute(envPosPts, 3));
    const envNegG = this.track(new THREE.BufferGeometry());
    envNegG.setAttribute('position', new THREE.BufferAttribute(envNegPts, 3));
    const envMat = this.track(
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 }),
    );
    this.standingEnvPos = new THREE.Line(envPosG, envMat);
    this.standingEnvNeg = new THREE.Line(envNegG, envMat);
    this.group.add(this.standingEnvPos, this.standingEnvNeg);

    // Gold Nodes & Cyan Antinodes
    const nodeG = this.track(new THREE.SphereGeometry(0.28, 16, 16));
    const nodeM = this.track(
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.8 }),
    );
    for (let k = 0; k <= this.harmonic; k++) {
      const x = -halfL + (k / this.harmonic) * L;
      const m = new THREE.Mesh(nodeG, nodeM);
      m.position.set(x, 0, 0);
      this.attachStudy(m, {
        key: `node-${k}`,
        title: `Standing Node #${k + 1}`,
        badge: 'ZERO MOTION',
        accent: '#fbbf24',
        simple: 'A permanent calm point where opposing waves always cancel completely to zero!',
        deeper: 'Node positions x_k = k L / n stay stationary for all t.',
      });
      this.group.add(m);
      this.nodeSpheres.push(m);
    }

    const antiG = this.track(new THREE.SphereGeometry(0.32, 16, 16));
    const antiM = this.track(
      new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x06b6d4, emissiveIntensity: 0.8 }),
    );
    for (let k = 0; k < this.harmonic; k++) {
      const x = -halfL + ((k + 0.5) / this.harmonic) * L;
      const m = new THREE.Mesh(antiG, antiM);
      m.position.set(x, 0, 0);
      this.attachStudy(m, {
        key: `antinode-${k}`,
        title: `Antinode Peak #${k + 1}`,
        badge: 'MAX OSCILLATION',
        accent: '#00f0ff',
        simple: 'Swings up and down with maximum energy—halfway between two calm nodes.',
        deeper: 'Peak local energy density at sin(k x) = ±1.',
      });
      this.group.add(m);
      this.antiSpheres.push(m);
    }
  }

  // ---------------- 3. QUANTUM TUNNELING ----------------
  private buildTunnelingScene(): void {
    this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
    const n = this.qSolver.n;

    // Potential barrier translucent slab
    const bH = Math.max(0.6, this.barrierHeight * 2.2);
    this.barrierMesh = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(this.qSolver.barrierWidth, bH, 6.5)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0xa855f7,
          emissive: 0x7e22ce,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.36,
        }),
      ),
    );
    this.barrierMesh.position.set(0, bH * 0.5, 0);
    this.attachStudy(this.barrierMesh, {
      key: 'q-barrier',
      title: 'Quantum Potential Barrier V₀',
      badge: 'FORBIDDEN ZONE',
      accent: '#a855f7',
      simple: 'A classical ball without enough energy bounces back 100%. A quantum wave decays exponentially inside—and leaks out the far side!',
      deeper: 'Inside V₀ > E, wavevector becomes imaginary (κ = √(2m(V₀−E))/ℏ), giving exponential decay ψ ~ e^(−κx).',
    });
    this.group.add(this.barrierMesh);

    // Probability density |psi|^2 curtain ribbon
    const curtainG = this.track(new THREE.BufferGeometry());
    const posArr = new Float32Array(n * 2 * 3);
    const colArr = new Float32Array(n * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
    curtainG.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    curtainG.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    curtainG.setIndex(indices);
    this.probCurtain = new THREE.Mesh(
      curtainG,
      this.track(
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    this.attachStudy(this.probCurtain, {
      key: 'q-prob',
      title: 'Probability Density |ψ(x, t)|²',
      badge: 'QUANTUM WAVE',
      accent: '#00f0ff',
      simple: 'Curtain height shows how likely you are to find the electron at each location!',
      deeper: 'Exact unitary Crank-Nicolson evolution conserving ∫|ψ|² dx = 1.',
    });
    this.group.add(this.probCurtain);

    // 3D complex phase helix (x, 2.5 + Re, Im)
    const helixG = this.track(new THREE.BufferGeometry());
    helixG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.phaseHelixLine = new THREE.Line(
      helixG,
      this.track(new THREE.LineBasicMaterial({ color: 0xfbbf24 })),
    );
    this.group.add(this.phaseHelixLine);

    const shadowG = this.track(new THREE.BufferGeometry());
    shadowG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.realShadowLine = new THREE.Line(
      shadowG,
      this.track(new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 })),
    );
    this.group.add(this.realShadowLine);
  }

  // ---------------- 4. VECTOR FIELD EXPLORER ----------------
  private buildVectorFieldScene(): void {
    // Terrain mesh
    const segs = 44;
    const tG = this.track(new THREE.PlaneGeometry(24, 24, segs, segs));
    tG.rotateX(-Math.PI * 0.5);
    const vCount = tG.attributes.position.count;
    tG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    for (let i = 0; i < vCount; i++) {
      const x = tG.attributes.position.getX(i);
      const z = tG.attributes.position.getZ(i);
      const { terrainHeight } = evaluateVectorField(x, z, this.fieldMode);
      tG.attributes.position.setY(i, terrainHeight - 1.4);
      const norm = Math.max(0, Math.min(1, (terrainHeight + 3.5) / 7.0));
      this.tmpCol.copy(this.cTrough).lerp(this.cCrest, norm);
      tG.attributes.color.setXYZ(i, this.tmpCol.r * 0.5, this.tmpCol.g * 0.5, this.tmpCol.b * 0.5);
    }
    this.vfTerrainMesh = new THREE.Mesh(
      tG,
      this.track(
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
        }),
      ),
    );
    this.vfTerrainMesh.visible = this.showTerrain;
    this.attachStudy(this.vfTerrainMesh, {
      key: 'vf-terrain',
      title:
        this.fieldMode === 'gradient'
          ? 'Scalar Potential Terrain f(x, z)'
          : this.fieldMode === 'divergence'
            ? 'Source (+) & Sink (−) Potential'
            : 'Vortex Curl Basin',
      badge: this.fieldMode.toUpperCase(),
      accent: '#38bdf8',
      simple:
        this.fieldMode === 'gradient'
          ? 'Gradient arrows always point uphill along the steepest slope of this terrain!'
          : this.fieldMode === 'divergence'
            ? 'Particles burst radially out of the red Source peak and drain into the blue Sink valley.'
            : 'Vortex curl swirls particles in endless loops with zero outward spread!',
      deeper:
        this.fieldMode === 'gradient'
          ? 'F = ∇f (conservative curl-free field)'
          : this.fieldMode === 'divergence'
            ? '∇·F > 0 at sources, ∇·F < 0 at sinks'
            : '∇×F ≠ 0 nonzero vorticity around the center',
    });
    this.group.add(this.vfTerrainMesh);

    // 13x13 instanced directional arrows
    const arrowCount = VF_GRID * VF_GRID;
    const shaftG = this.track(new THREE.CylinderGeometry(0.032, 0.032, 1, 8));
    shaftG.rotateX(Math.PI * 0.5);
    shaftG.translate(0, 0, 0.5);
    const headG = this.track(new THREE.ConeGeometry(0.1, 0.26, 10));
    headG.rotateX(Math.PI * 0.5);
    const aMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.vfArrowShafts = new THREE.InstancedMesh(shaftG, aMat, arrowCount);
    this.vfArrowHeads = new THREE.InstancedMesh(headG, aMat, arrowCount);

    let idx = 0;
    for (let ix = 0; ix < VF_GRID; ix++) {
      for (let iz = 0; iz < VF_GRID; iz++) {
        const x = -10.5 + (ix / (VF_GRID - 1)) * 21;
        const z = -10.5 + (iz / (VF_GRID - 1)) * 21;
        const { terrainHeight, fx, fz } = evaluateVectorField(x, z, this.fieldMode);
        const mag = Math.hypot(fx, fz);
        const len = Math.min(1.45, 0.25 + mag * 0.24);
        const y = (this.showTerrain ? terrainHeight - 1.1 : 0.2);

        if (mag < 1e-4) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpPos.set(x, y, z), this.tmpQuat.identity(), this.tmpScale);
          this.vfArrowShafts.setMatrixAt(idx, this.tmpMat);
          this.vfArrowHeads.setMatrixAt(idx, this.tmpMat);
        } else {
          this.tmpDir.set(fx / mag, 0, fz / mag);
          this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
          this.tmpPos.set(x, y, z).addScaledVector(this.tmpDir, -len * 0.5);
          this.tmpScale.set(1, 1, len);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.vfArrowShafts.setMatrixAt(idx, this.tmpMat);

          this.tmpPos.addScaledVector(this.tmpDir, len + 0.06);
          this.tmpScale.set(1, 1, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.vfArrowHeads.setMatrixAt(idx, this.tmpMat);

          this.tmpCol.copy(this.cNeutral).lerp(this.cCrest, Math.min(1, mag / 3.5));
          this.vfArrowShafts.setColorAt(idx, this.tmpCol);
          this.vfArrowHeads.setColorAt(idx, this.tmpCol);
        }
        idx++;
      }
    }
    this.group.add(this.vfArrowShafts, this.vfArrowHeads);

    // 220 flowing field tracers
    const tGeom = this.track(new THREE.SphereGeometry(0.11, 8, 8));
    const tMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    this.vfTracerMesh = new THREE.InstancedMesh(tGeom, tMat, VF_TRACERS);
    this.vfTracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < VF_TRACERS; i++) {
      this.respawnTracer(i);
    }
    this.group.add(this.vfTracerMesh);
  }

  private respawnTracer(i: number): void {
    if (this.fieldMode === 'divergence') {
      const a = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.9;
      this.vfTracerPos[i * 2] = -4 + r * Math.cos(a);
      this.vfTracerPos[i * 2 + 1] = r * Math.sin(a);
    } else {
      this.vfTracerPos[i * 2] = (Math.random() - 0.5) * 20;
      this.vfTracerPos[i * 2 + 1] = (Math.random() - 0.5) * 20;
    }
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'wave-interference' && this.slitGeom) {
      const posAttr = this.slitGeom.attributes.position as THREE.BufferAttribute;
      const colAttr = this.slitGeom.attributes.color as THREE.BufferAttribute;
      const k = (2 * Math.PI) / this.wavelength;
      const omega = 4.2;

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const { height } = evaluateDoubleSlit(
          x,
          z,
          this.simTime,
          k,
          omega,
          this.slitSep,
          this.singleSource,
        );
        posAttr.setY(i, height);
        const t = Math.max(-1, Math.min(1, height / 1.4));
        if (t >= 0) this.tmpCol.copy(this.cNeutral).lerp(this.cCrest, t);
        else this.tmpCol.copy(this.cNeutral).lerp(this.cTrough, -t);
        colAttr.setXYZ(i, this.tmpCol.r, this.tmpCol.g, this.tmpCol.b);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      return;
    }

    if (this.chapterId === 'wave-standing' && this.standingLine) {
      const L = 22;
      const halfL = L * 0.5;
      const cosT = Math.cos(this.simTime * (1.8 + this.harmonic * 0.8));
      const attr = this.standingLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < STANDING_PTS; i++) {
        const u = i / (STANDING_PTS - 1);
        const x = -halfL + u * L;
        const y = this.waveAmp * Math.sin(this.harmonic * Math.PI * u) * cosT;
        attr.setXYZ(i, x, y, 0);
      }
      attr.needsUpdate = true;

      for (let k = 0; k < this.antiSpheres.length; k++) {
        const sign = k % 2 === 0 ? 1 : -1;
        this.antiSpheres[k].position.y = this.waveAmp * sign * cosT;
      }
      return;
    }

    if (this.chapterId === 'wave-tunneling' && this.probCurtain && this.phaseHelixLine && this.realShadowLine) {
      const substeps = dt > 0 ? 4 : 0;
      for (let s = 0; s < substeps; s++) {
        this.qSolver.step(0.042);
      }
      this.lastProbs = this.qSolver.getProbabilities();

      // Auto-relaunch if wavepacket reaches edge
      if (this.lastProbs.reflected + this.lastProbs.transmitted > 0.99 && this.simTime > 11) {
        this.simTime = 0;
        this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
      }

      const n = this.qSolver.n;
      const cPos = this.probCurtain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const cCol = this.probCurtain.geometry.getAttribute('color') as THREE.BufferAttribute;
      const hAttr = this.phaseHelixLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const sAttr = this.realShadowLine.geometry.getAttribute('position') as THREE.BufferAttribute;

      for (let j = 0; j < n; j++) {
        const x = this.qSolver.getX(j);
        const re = this.qSolver.psiRe[j];
        const im = this.qSolver.psiIm[j];
        const prob = re * re + im * im;
        const h = Math.min(7.5, prob * 14.5);

        cPos.setXYZ(j * 2, x, 0, 0);
        cPos.setXYZ(j * 2 + 1, x, h, 0);

        const rightSide = x > 0;
        this.tmpCol.setHex(rightSide ? 0x10b981 : 0x00f0ff);
        cCol.setXYZ(j * 2, this.tmpCol.r * 0.2, this.tmpCol.g * 0.2, this.tmpCol.b * 0.2);
        cCol.setXYZ(j * 2 + 1, this.tmpCol.r, this.tmpCol.g, this.tmpCol.b);

        hAttr.setXYZ(j, x, 2.5 + re * 5.2, im * 5.2);
        sAttr.setXYZ(j, x, 0.05, re * 4.5);
      }
      cPos.needsUpdate = true;
      cCol.needsUpdate = true;
      hAttr.needsUpdate = true;
      sAttr.needsUpdate = true;
      return;
    }

    if (this.chapterId === 'wave-vectorfield' && this.vfTracerMesh) {
      this.tmpQuat.identity();
      this.tmpScale.set(1, 1, 1);
      for (let i = 0; i < VF_TRACERS; i++) {
        let x = this.vfTracerPos[i * 2];
        let z = this.vfTracerPos[i * 2 + 1];
        const { terrainHeight, fx, fz } = evaluateVectorField(x, z, this.fieldMode);
        x += fx * dt * 1.15;
        z += fz * dt * 1.15;

        const outBounds = Math.abs(x) > 11.5 || Math.abs(z) > 11.5;
        const atSink = this.fieldMode === 'divergence' && Math.hypot(x - 4, z) < 0.75;
        const stalled = Math.hypot(fx, fz) < 0.06 && Math.random() < 0.04;

        if (outBounds || atSink || stalled) {
          this.respawnTracer(i);
          x = this.vfTracerPos[i * 2];
          z = this.vfTracerPos[i * 2 + 1];
        } else {
          this.vfTracerPos[i * 2] = x;
          this.vfTracerPos[i * 2 + 1] = z;
        }

        const y = this.showTerrain ? terrainHeight - 0.9 : 0.4;
        this.tmpPos.set(x, y, z);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.vfTracerMesh.setMatrixAt(i, this.tmpMat);
      }
      this.vfTracerMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'wave-interference') {
      return {
        sliders: [
          {
            key: 'wavelength',
            label: 'Wavelength λ',
            min: 1.6,
            max: 6.0,
            step: 0.2,
            value: this.wavelength,
            unit: 'm',
            noteTitle: 'Ripple Wavelength',
            noteText: 'Shorter wavelengths pack more bright/dark interference stripes across the screen.',
          },
          {
            key: 'slitSep',
            label: 'Slit Separation d',
            min: 2.0,
            max: 10.0,
            step: 0.4,
            value: this.slitSep,
            unit: 'm',
            noteTitle: 'Slit Spacing',
            noteText: 'Wider slits pack interference fringes closer together.',
          },
        ],
        toggles: [
          {
            key: 'singleSource',
            label: 'Single Source Only',
            checked: this.singleSource,
            swatchColor: '#fbbf24',
            noteTitle: 'Compare 1 vs 2 Sources',
            noteText: 'Turn ON to confirm interference fringes vanish with only one slit!',
          },
        ],
        actions: [],
      };
    }

    if (this.chapterId === 'wave-standing') {
      return {
        sliders: [
          {
            key: 'harmonic',
            label: 'Harmonic Mode (n)',
            min: 1,
            max: 6,
            step: 1,
            value: this.harmonic,
            unit: '',
            noteTitle: 'Quantized Harmonic',
            noteText: 'Whole-number modes that fit cleanly between the two fixed walls.',
          },
          {
            key: 'waveAmp',
            label: 'Amplitude A',
            min: 0.8,
            max: 4.0,
            step: 0.2,
            value: this.waveAmp,
            unit: 'm',
            noteTitle: 'Wave Amplitude',
            noteText: 'Controls peak swing height at the antinodes.',
          },
        ],
        toggles: [],
        actions: [],
      };
    }

    if (this.chapterId === 'wave-tunneling') {
      return {
        sliders: [
          {
            key: 'barrierHeight',
            label: 'Barrier Height V₀',
            min: 0.5,
            max: 4.0,
            step: 0.1,
            value: this.barrierHeight,
            unit: 'eV',
            noteTitle: 'Wall Height',
            noteText: 'Higher potential barriers block more of the quantum wavepacket.',
          },
          {
            key: 'packetK',
            label: 'Wave Momentum k₀',
            min: 1.0,
            max: 3.5,
            step: 0.1,
            value: this.packetK,
            unit: 'ℏ/m',
            noteTitle: 'Incoming Momentum',
            noteText: 'Higher incoming kinetic energy (½k₀²) boosts quantum tunneling probability!',
          },
        ],
        toggles: [],
        actions: [{ id: 'relaunchPacket', label: 'Relaunch Wavepacket' }],
      };
    }

    return {
      sliders: [],
      toggles: [
        {
          key: 'showTerrain',
          label: 'Scalar Potential Terrain',
          checked: this.showTerrain,
          swatchColor: '#38bdf8',
          noteTitle: 'Terrain Heightfield',
          noteText: 'Shows the underlying scalar landscape f(x, z).',
        },
      ],
      actions: [
        { id: 'mode-gradient', label: 'Gradient ∇f' },
        { id: 'mode-divergence', label: 'Source / Sink ∇·F' },
        { id: 'mode-curl', label: 'Vortex Curl ∇×F' },
      ],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'wavelength' && typeof value === 'number') this.wavelength = value;
    else if (key === 'slitSep' && typeof value === 'number') {
      this.slitSep = value;
      this.rebuildScene();
    } else if (key === 'singleSource' && typeof value === 'boolean') {
      this.singleSource = value;
      this.rebuildScene();
    } else if (key === 'harmonic' && typeof value === 'number') {
      this.harmonic = Math.round(value);
      this.rebuildScene();
    } else if (key === 'waveAmp' && typeof value === 'number') {
      this.waveAmp = value;
      this.rebuildScene();
    } else if (key === 'barrierHeight' && typeof value === 'number') {
      this.barrierHeight = value;
      this.simTime = 0;
      this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
      this.rebuildScene();
    } else if (key === 'packetK' && typeof value === 'number') {
      this.packetK = value;
      this.simTime = 0;
      this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
    } else if (key === 'showTerrain' && typeof value === 'boolean') {
      this.showTerrain = value;
      this.rebuildScene();
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'relaunchPacket') {
      this.simTime = 0;
      this.qSolver.reset(this.barrierHeight, 1.6, this.packetK);
    } else if (actionId === 'mode-gradient') {
      this.fieldMode = 'gradient';
      this.rebuildScene();
    } else if (actionId === 'mode-divergence') {
      this.fieldMode = 'divergence';
      this.rebuildScene();
    } else if (actionId === 'mode-curl') {
      this.fieldMode = 'curl';
      this.rebuildScene();
    }
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'wave-interference') {
      const k = (2 * Math.PI) / this.wavelength;
      const center = evaluateDoubleSlit(8, 0, this.simTime, k, 4.2, this.slitSep, this.singleSource);
      return [
        {
          labelSimple: 'Center Ripple',
          labelPhysics: 'Amplitude y(8,0)',
          value: `${center.height.toFixed(2)} m`,
          noteTitle: 'Central Fringe Height',
          noteText: 'Always hits constructive maximum when both slits are equal distance away!',
        },
        {
          labelSimple: 'Wavelength λ',
          labelPhysics: 'Wavelength λ',
          value: `${this.wavelength.toFixed(1)} m`,
          noteTitle: 'Ripple Wavelength',
          noteText: 'Distance between consecutive crests.',
        },
        {
          labelSimple: 'Slit Spacing d',
          labelPhysics: 'Separation d',
          value: `${this.slitSep.toFixed(1)} m`,
          noteTitle: 'Slit Separation',
          noteText: 'Ratio d / λ governs how many interference lanes form.',
        },
        {
          labelSimple: 'Ratio d / λ',
          labelPhysics: 'Fringe Ratio d/λ',
          value: (this.slitSep / this.wavelength).toFixed(2),
          noteTitle: 'Fringe Count Factor',
          noteText: 'Larger d / λ packs more alternating bright & dark fringes.',
        },
      ];
    }

    if (this.chapterId === 'wave-standing') {
      return [
        {
          labelSimple: 'Harmonic Mode',
          labelPhysics: 'Quantum Mode n',
          value: `n = ${this.harmonic}`,
          noteTitle: 'Harmonic Number',
          noteText: 'Counts how many half-waves fit between the walls.',
        },
        {
          labelSimple: 'Calm Nodes',
          labelPhysics: 'Total Nodes',
          value: String(this.harmonic + 1),
          noteTitle: 'Zero-Motion Nodes',
          noteText: 'Fixed points where amplitude stays permanently zero.',
        },
        {
          labelSimple: 'Swinging Peaks',
          labelPhysics: 'Antinodes',
          value: String(this.harmonic),
          noteTitle: 'Peak Antinodes',
          noteText: 'Points oscillating with full amplitude ±A.',
        },
        {
          labelSimple: 'Wavelength λ_n',
          labelPhysics: 'λ_n = 2L / n',
          value: `${(44 / this.harmonic).toFixed(1)} m`,
          noteTitle: 'Mode Wavelength',
          noteText: 'Higher harmonics correspond to shorter wavelengths and higher energy.',
        },
      ];
    }

    if (this.chapterId === 'wave-tunneling') {
      const norm = this.qSolver.getNorm();
      const eKin = 0.5 * this.packetK * this.packetK;
      return [
        {
          labelSimple: 'Tunneled Chance',
          labelPhysics: 'Transmission T',
          value: `${(this.lastProbs.transmitted * 100).toFixed(1)}%`,
          noteTitle: 'Quantum Tunneling %',
          noteText: 'Probability of finding the electron on the right side of the barrier!',
        },
        {
          labelSimple: 'Bounced Back',
          labelPhysics: 'Reflection R',
          value: `${(this.lastProbs.reflected * 100).toFixed(1)}%`,
          noteTitle: 'Reflected Probability',
          noteText: 'Portion of the wavepacket bouncing left off the barrier.',
        },
        {
          labelSimple: 'Wave Energy E',
          labelPhysics: 'Kinetic E = k₀²/2',
          value: `${eKin.toFixed(2)} eV`,
          noteTitle: 'Wavepacket Energy',
          noteText: `Compare against barrier V₀ = ${this.barrierHeight.toFixed(1)} eV!`,
        },
        {
          labelSimple: 'Total Probability',
          labelPhysics: 'Unitary Norm ∫|ψ|²',
          value: norm.toFixed(4),
          noteTitle: 'Conservation Check',
          noteText: 'Must remain 1.0000 at all times by Crank-Nicolson unitarity.',
        },
      ];
    }

    return [
      {
        labelSimple: 'Field Type',
        labelPhysics: 'Active Operator',
        value: this.fieldMode.toUpperCase(),
        noteTitle: 'Vector Field Mode',
        noteText: 'Switch between Gradient, Divergence, and Curl below.',
      },
      {
        labelSimple: 'Flow Tracers',
        labelPhysics: 'Stream Particles',
        value: String(VF_TRACERS),
        noteTitle: 'Advected Tracers',
        noteText: 'Particles carried smoothly by the 2D vector field.',
      },
      {
        labelSimple: 'Grid Arrows',
        labelPhysics: 'Sample Vectors',
        value: String(VF_GRID * VF_GRID),
        noteTitle: 'Vector Lattice',
        noteText: 'Shows local field direction & magnitude.',
      },
      {
        labelSimple: 'Curl / Divergence',
        labelPhysics: 'Field Property',
        value: this.fieldMode === 'curl' ? '∇×F ≠ 0' : this.fieldMode === 'divergence' ? '∇·F ≠ 0' : '∇×(∇f) = 0',
        noteTitle: 'Vector Identity',
        noteText: 'Every gradient field has zero curl; pure vortex curl has zero divergence!',
      },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'wave-interference') {
      return {
        captionSimple: 'Two synchronized waves add together: crests + crests double up, crests + troughs cancel flat.',
        captionPhysics: 'Two-Slit Wave Superposition & Path Difference',
        tex: String.raw`\psi = \psi_1 + \psi_2, \quad \Delta r = m\lambda \text{ (constructive)}`,
      };
    }
    if (this.chapterId === 'wave-standing') {
      return {
        captionSimple: 'Walls pin the ends to zero, allowing only quantized harmonic modes n = 1, 2, 3...',
        captionPhysics: 'Quantized Standing Wave Modes',
        tex: String.raw`y_n(x,t) = A\sin\!\left(\frac{n\pi x}{L}\right)\cos(\omega_n t)`,
      };
    }
    if (this.chapterId === 'wave-tunneling') {
      return {
        captionSimple: 'The quantum wave leaks exponentially through the barrier wall instead of stopping at zero.',
        captionPhysics: 'Time-Dependent Schrödinger Equation',
        tex: String.raw`i\hbar\frac{\partial\psi}{\partial t} = \left(-\frac{\hbar^2}{2m}\frac{\partial^2}{\partial x^2} + V(x)\right)\psi`,
      };
    }
    return {
      captionSimple: 'Gradient climbs hills, Divergence bursts out of sources, and Curl swirls in closed vortices.',
      captionPhysics: 'Vector Calculus Fundamental Operators',
      tex: String.raw`\nabla f, \quad \nabla\cdot\mathbf{F}, \quad \nabla\times\mathbf{F}`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'wave-interference') {
      const k = (2 * Math.PI) / this.wavelength;
      const s0 = evaluateDoubleSlit(6, 0, this.simTime, k, 4.2, this.slitSep, this.singleSource);
      const s1 = evaluateDoubleSlit(6, 2.2, this.simTime, k, 4.2, this.slitSep, this.singleSource);
      return {
        ch1: s0.height,
        ch2: s1.height,
        ch3: s0.envelope,
        labels: ['y_0', 'y_node', 'env'],
        units: ['m', 'm', 'm'],
      };
    }
    if (this.chapterId === 'wave-standing') {
      const cosT = Math.cos(this.simTime * (1.8 + this.harmonic * 0.8));
      return {
        ch1: this.waveAmp * cosT,
        ch2: -this.waveAmp * cosT,
        ch3: 0,
        labels: ['Peak+', 'Peak−', 'Node'],
        units: ['m', 'm', 'm'],
      };
    }
    if (this.chapterId === 'wave-tunneling') {
      return {
        ch1: this.lastProbs.transmitted * 10,
        ch2: this.lastProbs.reflected * 10,
        ch3: this.lastProbs.barrier * 10,
        labels: ['T×10', 'R×10', 'Wall'],
        units: ['', '', ''],
      };
    }
    return {
      ch1: Math.sin(this.simTime),
      ch2: Math.cos(this.simTime),
      ch3: this.fieldMode === 'curl' ? 1 : 0,
      labels: ['F_x', 'F_z', '|F|'],
      units: ['', '', ''],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<WavesChapterId, string> = {
      'wave-interference': 'Vol IV · Double-Slit Interference',
      'wave-standing': 'Vol IV · Standing Wave Harmonics',
      'wave-tunneling': 'Vol IV · Quantum Tunneling (TDSE)',
      'wave-vectorfield': `Vol IV · Vector Field (${this.fieldMode})`,
    };
    return { label: names[this.chapterId], color: '#10b981' };
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public inspectHit(hitObj: THREE.Object3D, hitPoint: THREE.Vector3): LabHoverData | null {
    let cur: THREE.Object3D | null = hitObj;
    let study: StudyMeta | undefined;
    while (cur) {
      if (cur.userData?.study) {
        study = cur.userData.study as StudyMeta;
        break;
      }
      cur = cur.parent;
    }
    if (!study) return null;

    const metrics: string[] = [];
    if (this.chapterId === 'wave-interference') {
      const k = (2 * Math.PI) / this.wavelength;
      const s = evaluateDoubleSlit(hitPoint.x, hitPoint.z, this.simTime, k, 4.2, this.slitSep, this.singleSource);
      metrics.push(`y = ${s.height.toFixed(2)} m`, `Max Amp = ${s.envelope.toFixed(2)} m`);
    } else if (this.chapterId === 'wave-tunneling') {
      metrics.push(`T = ${(this.lastProbs.transmitted * 100).toFixed(1)}%`, `V₀ = ${this.barrierHeight.toFixed(1)} eV`);
    } else if (this.chapterId === 'wave-vectorfield') {
      const vf = evaluateVectorField(hitPoint.x, hitPoint.z, this.fieldMode);
      metrics.push(`f = ${vf.terrainHeight.toFixed(2)}`, `|F| = ${Math.hypot(vf.fx, vf.fz).toFixed(2)}`);
    } else {
      metrics.push(`n = ${this.harmonic}`, `λ = ${(44 / this.harmonic).toFixed(1)} m`);
    }

    return { ...study, metrics };
  }

  public getCallouts(): LabCalloutPoint[] {
    if (this.chapterId === 'wave-tunneling') {
      return [
        {
          id: 'barrier-callout',
          label: `Barrier V₀=${this.barrierHeight.toFixed(1)}`,
          accent: '#a855f7',
          x: 0,
          y: Math.max(1.8, this.barrierHeight * 2.2) + 0.8,
          z: 0,
          hover: {
            ...(this.barrierMesh?.userData.study as StudyMeta),
            metrics: [`Tunneled = ${(this.lastProbs.transmitted * 100).toFixed(1)}%`],
          },
        },
      ];
    }
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'wave-standing') return { position: [0, 5, 19], target: [0, 0, 0] };
    if (this.chapterId === 'wave-tunneling') return { position: [0, 8, 22], target: [0, 2, 0] };
    return { position: [0, 15, 20], target: [0, -0.5, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
