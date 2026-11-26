import * as THREE from 'three';
import { attachModel } from '../render/modelLibrary';
import {
  carnotEfficiency,
  idealGasPressure,
  shannonMixingEntropy,
  stepGasParticles,
} from '../physics/thermoPhysics';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type ThermoChapterId = 'thermo-gas' | 'thermo-carnot' | 'thermo-brownian' | 'thermo-entropy';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

const GAS_COUNT = 160;

export class ThermoLab implements LabModule {
  public readonly topicId = 'thermo' as const;
  public readonly group = new THREE.Group();

  private chapterId: ThermoChapterId = 'thermo-gas';
  private simTime = 0;

  // Gas & Entropy shared particle buffers
  private gasTemp = 300;
  private pistonVol = 1.0;
  private gasPos = new Float32Array(GAS_COUNT * 3);
  private gasVel = new Float32Array(GAS_COUNT * 3);
  private gasMesh: THREE.InstancedMesh | null = null;
  private pistonMesh: THREE.Mesh | null = null;
  private wallImpulseSmooth = 0;

  // Carnot Engine
  private carnotTHot = 650;
  private carnotTCold = 300;
  private carnotCycleSpeed = 0.45;
  private carnotPistonMesh: THREE.Mesh | null = null;
  private carnotMarkerMesh: THREE.Mesh | null = null;
  private carnotPhase = 0;

  // Brownian Motion
  private brownianTemp = 340;
  private brownianPos = new THREE.Vector3(0, 0, 0);
  private brownianVel = new THREE.Vector3(0, 0, 0);
  private brownianMesh: THREE.Mesh | null = null;
  private brownianTrail: THREE.Line | null = null;
  private brownianTrailPts: THREE.Vector3[] = [];
  private brownianCollisions = 0;

  // Entropy Mixing
  private dividerRemoved = false;
  private dividerMesh: THREE.Mesh | null = null;
  private entropyIsHot = new Uint8Array(GAS_COUNT);
  private currentEntropy = 0;

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpCol = new THREE.Color();

  public activate(chapterId: string): void {
    const valid: ThermoChapterId[] = [
      'thermo-gas',
      'thermo-carnot',
      'thermo-brownian',
      'thermo-entropy',
    ];
    this.chapterId = valid.includes(chapterId as ThermoChapterId)
      ? (chapterId as ThermoChapterId)
      : 'thermo-gas';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'removeDivider') {
      this.dividerRemoved = true;
      if (this.dividerMesh) this.dividerMesh.visible = false;
      return;
    }
    if (apply.action === 'resetEntropy') {
      this.dividerRemoved = false;
      this.rebuildScene();
      return;
    }
    if (typeof apply.temp === 'number') {
      this.gasTemp = apply.temp;
      this.brownianTemp = apply.temp;
    }
    if (typeof apply.vol === 'number') this.pistonVol = apply.vol;
    if (typeof apply.tHot === 'number') this.carnotTHot = apply.tHot;
    if (typeof apply.tCold === 'number') this.carnotTCold = apply.tCold;
  }

  public reset(): void {
    this.simTime = 0;
    this.dividerRemoved = false;
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
    this.gasMesh = null;
    this.pistonMesh = null;
    this.carnotPistonMesh = null;
    this.carnotMarkerMesh = null;
    this.brownianMesh = null;
    this.brownianTrail = null;
    this.brownianTrailPts = [];
    this.dividerMesh = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private initParticles(splitHotCold: boolean): void {
    const halfX = splitHotCold ? 6.0 : 5.5;
    for (let i = 0; i < GAS_COUNT; i++) {
      const isHot = splitHotCold ? i < GAS_COUNT / 2 : true;
      this.entropyIsHot[i] = isHot ? 1 : 0;

      if (splitHotCold) {
        this.gasPos[i * 3] = isHot
          ? -0.4 - Math.random() * (halfX - 0.6)
          : 0.4 + Math.random() * (halfX - 0.6);
      } else {
        this.gasPos[i * 3] = (Math.random() - 0.5) * 9.0;
      }
      this.gasPos[i * 3 + 1] = (Math.random() - 0.5) * 5.2;
      this.gasPos[i * 3 + 2] = (Math.random() - 0.5) * 5.2;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = isHot ? 1.1 : 0.45;
      this.gasVel[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
      this.gasVel[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
      this.gasVel[i * 3 + 2] = speed * Math.cos(phi);
    }
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;

    if (this.chapterId === 'thermo-carnot') {
      this.buildCarnotScene();
      return;
    }

    if (this.chapterId === 'thermo-brownian') {
      this.buildBrownianScene();
      return;
    }

    const isEntropy = this.chapterId === 'thermo-entropy';
    this.initParticles(isEntropy);
    this.currentEntropy = isEntropy ? 0 : 1;

    // Chamber frame
    const boxW = isEntropy ? 12.6 : 11.0;
    const boxG = this.track(new THREE.BoxGeometry(boxW, 6.2, 6.2));
    const chamber = new THREE.Mesh(
      boxG,
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x334155,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        }),
      ),
    );
    this.attachStudy(chamber, {
      key: isEntropy ? 'entropy-chamber' : 'gas-chamber',
      title: isEntropy ? 'Isolated Two-Side Thermal Chamber' : 'Ideal Gas Piston Chamber',
      badge: isEntropy ? 'SECOND LAW' : 'KINETIC THEORY',
      accent: '#f97316',
      simple: isEntropy
        ? 'Once you remove the center wall, fast hot molecules and slow cold molecules mix spontaneously—and never unmix!'
        : 'Pressure comes purely from billions of tiny elastic wall collisions transferring momentum every second.',
      deeper: isEntropy
        ? 'Boltzmann Entropy S = k_B ln Ω increases overwhelmingly toward the macrostate with the most microstates.'
        : 'Ideal Gas Law P V = N k_B T emerges directly from average molecular kinetic energy ½m⟨v²⟩ = ³⁄₂ k_B T.',
    });
    this.group.add(chamber);

    const edges = new THREE.LineSegments(
      this.track(new THREE.EdgesGeometry(boxG)),
      this.track(new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.65 })),
    );
    this.group.add(edges);

    if (isEntropy) {
      const divG = this.track(new THREE.BoxGeometry(0.14, 6.1, 6.1));
      this.dividerMesh = new THREE.Mesh(
        divG,
        this.track(
          new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xd97706,
            emissiveIntensity: 0.45,
            transparent: true,
            opacity: 0.45,
          }),
        ),
      );
      this.dividerMesh.visible = !this.dividerRemoved;
      this.attachStudy(this.dividerMesh, {
        key: 'entropy-divider',
        title: 'Removable Partition Wall',
        badge: 'CONSTRAINED STATE',
        accent: '#fbbf24',
        simple: 'Keeps hot red atoms on the left and cold blue atoms on the right (Entropy S = 0). Pull it out to watch irreversible mixing!',
        deeper: 'Removing an internal constraint unlocks exponentially more accessible phase-space volume Ω.',
      });
      this.group.add(this.dividerMesh);
      void attachModel(this.dividerMesh, 'chamber_divider', { fit: 'y' });
    } else {
      // Sliding right-wall piston
      this.pistonMesh = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.28, 6.0, 6.0)),
        this.track(
          new THREE.MeshStandardMaterial({
            color: 0xf97316,
            emissive: 0xea580c,
            emissiveIntensity: 0.45,
            transparent: true,
            opacity: 0.65,
          }),
        ),
      );
      this.attachStudy(this.pistonMesh, {
        key: 'gas-piston',
        title: 'Movable Volume Piston',
        badge: 'COMPRESSION WALL',
        accent: '#f97316',
        simple: 'Compressing the piston shrinks volume V, packing molecules closer so wall impacts (pressure P) jump!',
        deeper: 'Isothermal compression doubles pressure when volume is halved (P₁V₁ = P₂V₂).',
      });
      this.group.add(this.pistonMesh);
      void attachModel(this.pistonMesh, 'piston_plate', { fit: 'y' });
    }

    const pGeom = this.track(new THREE.SphereGeometry(0.16, 10, 10));
    const pMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.gasMesh = new THREE.InstancedMesh(pGeom, pMat, GAS_COUNT);
    this.gasMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gasMesh.frustumCulled = false;

    for (let i = 0; i < GAS_COUNT; i++) {
      if (isEntropy) {
        this.tmpCol.setHex(this.entropyIsHot[i] ? 0xef4444 : 0x38bdf8);
      } else {
        this.tmpCol.setHex(0xf97316);
      }
      this.gasMesh.setColorAt(i, this.tmpCol);
    }
    if (this.gasMesh.instanceColor) this.gasMesh.instanceColor.needsUpdate = true;
    this.group.add(this.gasMesh);
  }

  private buildCarnotScene(): void {
    // Translucent vertical cylinder at x = -5
    const cylG = this.track(new THREE.CylinderGeometry(2.3, 2.3, 6.6, 28, 1, true));
    const cylM = new THREE.Mesh(
      cylG,
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    cylM.position.set(-5.0, 0, 0);
    this.attachStudy(cylM, {
      key: 'carnot-cyl',
      title: 'Carnot Heat Engine Cylinder',
      badge: 'THERMAL ENGINE',
      accent: '#f97316',
      simple: 'Cycles through 4 reversible steps: absorbs heat at T_H, expands adiabatically, dumps waste heat at T_C, and compresses back!',
      deeper: 'Maximum possible thermal efficiency allowed by the Second Law: η_Carnot = 1 − T_C / T_H.',
    });
    this.group.add(cylM);

    this.carnotPistonMesh = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(2.2, 2.2, 0.45, 28)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xd97706,
          emissiveIntensity: 0.55,
        }),
      ),
    );
    this.carnotPistonMesh.position.set(-5.0, 0, 0);
    this.group.add(this.carnotPistonMesh);
    void attachModel(this.carnotPistonMesh, 'carnot_piston', { fit: 'x' });

    // 3D P-V Diagram Loop at x in [+1, +9]
    const loopPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const s = i / 120;
      const pv = this.sampleCarnotPV(s);
      loopPts.push(new THREE.Vector3(1.2 + pv.vNorm * 7.2, -2.5 + pv.pNorm * 5.2, 0));
    }
    const pvLine = new THREE.Line(
      this.track(new THREE.BufferGeometry().setFromPoints(loopPts)),
      this.track(new THREE.LineBasicMaterial({ color: 0xf97316 })),
    );
    this.group.add(pvLine);

    this.carnotMarkerMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.32, 16, 16)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0x00f0ff,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.9,
        }),
      ),
    );
    this.attachStudy(this.carnotMarkerMesh, {
      key: 'carnot-pv',
      title: 'P–V Work Loop Indicator',
      badge: 'WORK = AREA',
      accent: '#00f0ff',
      simple: 'The enclosed area inside the P–V loop equals the useful mechanical work extracted every cycle!',
      deeper: 'W_net = ∮ P dV = Q_in − Q_out = η Q_in.',
    });
    this.group.add(this.carnotMarkerMesh);
    void attachModel(this.carnotMarkerMesh, 'pv_marker');
  }

  private sampleCarnotPV(phase01: number): { vNorm: number; pNorm: number; stage: string } {
    const s = ((phase01 % 1) + 1) % 1;
    const effRatio = Math.max(0.15, carnotEfficiency(this.carnotTHot, this.carnotTCold));
    if (s < 0.25) {
      const u = s / 0.25;
      const v = 0.15 + u * 0.45;
      const p = 0.92 / (1 + 2.2 * (v - 0.15));
      return { vNorm: v, pNorm: p, stage: 'Isothermal Expansion (Heat In)' };
    }
    if (s < 0.5) {
      const u = (s - 0.25) / 0.25;
      const v = 0.6 + u * 0.32;
      const p = 0.46 - u * (0.28 + 0.08 * effRatio);
      return { vNorm: v, pNorm: p, stage: 'Adiabatic Expansion (Cooling)' };
    }
    if (s < 0.75) {
      const u = (s - 0.5) / 0.25;
      const v = 0.92 - u * 0.47;
      const p = (0.18 - 0.05 * effRatio) + u * 0.18;
      return { vNorm: v, pNorm: p, stage: 'Isothermal Compression (Heat Out)' };
    }
    const u = (s - 0.75) / 0.25;
    const v = 0.45 - u * 0.3;
    const p = 0.36 + u * 0.56;
    return { vNorm: v, pNorm: p, stage: 'Adiabatic Compression (Heating)' };
  }

  private buildBrownianScene(): void {
    this.initParticles(false);
    this.brownianPos.set(0, 0, 0);
    this.brownianVel.set(0, 0, 0);
    this.brownianCollisions = 0;

    const boxG = this.track(new THREE.BoxGeometry(12, 7.5, 7.5));
    const edges = new THREE.LineSegments(
      this.track(new THREE.EdgesGeometry(boxG)),
      this.track(new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.5 })),
    );
    this.group.add(edges);

    const pGeom = this.track(new THREE.SphereGeometry(0.11, 8, 8));
    const pMat = this.track(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 }));
    this.gasMesh = new THREE.InstancedMesh(pGeom, pMat, GAS_COUNT);
    this.gasMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gasMesh.frustumCulled = false;
    this.group.add(this.gasMesh);

    this.brownianMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.68, 24, 24)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xd97706,
          emissiveIntensity: 0.7,
        }),
      ),
    );
    this.attachStudy(this.brownianMesh, {
      key: 'brownian-pollen',
      title: 'Heavy Pollen Grain (Random Walker)',
      badge: 'BROWNIAN MOTION',
      accent: '#fbbf24',
      simple: 'Wait and watch how uneven molecular impacts kick this heavy grain on an unpredictable zig-zag path!',
      deeper: 'Einstein-Smoluchowski diffusion: mean-squared displacement grows linearly with time ⟨r²⟩ = 6 D t.',
    });
    this.group.add(this.brownianMesh);
    void attachModel(this.brownianMesh, 'pollen_grain');

    const trailG = this.track(new THREE.BufferGeometry());
    trailG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(220 * 3), 3));
    this.brownianTrail = new THREE.Line(
      trailG,
      this.track(new THREE.LineBasicMaterial({ color: 0xfbbf24 })),
    );
    this.brownianTrail.frustumCulled = false;
    this.group.add(this.brownianTrail);
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'thermo-carnot') {
      this.carnotPhase = (this.carnotPhase + dt * this.carnotCycleSpeed) % 1;
      const pv = this.sampleCarnotPV(this.carnotPhase);
      if (this.carnotPistonMesh) {
        this.carnotPistonMesh.position.y = -2.2 + pv.vNorm * 4.4;
      }
      if (this.carnotMarkerMesh) {
        this.carnotMarkerMesh.position.set(1.2 + pv.vNorm * 7.2, -2.5 + pv.pNorm * 5.2, 0);
      }
      return;
    }

    if (this.chapterId === 'thermo-brownian') {
      const speedScale = 4.2 * Math.sqrt(Math.max(40, this.brownianTemp) / 300);
      stepGasParticles(this.gasPos, this.gasVel, 5.7, 3.4, 3.4, dt, speedScale);

      const rCol = 0.78;
      for (let i = 0; i < GAS_COUNT; i++) {
        const px = this.gasPos[i * 3];
        const py = this.gasPos[i * 3 + 1];
        const pz = this.gasPos[i * 3 + 2];
        const dx = this.brownianPos.x - px;
        const dy = this.brownianPos.y - py;
        const dz = this.brownianPos.z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rCol * rCol && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          this.brownianVel.x += (dx / d) * 0.14 * speedScale;
          this.brownianVel.y += (dy / d) * 0.14 * speedScale;
          this.brownianVel.z += (dz / d) * 0.14 * speedScale;
          this.gasVel[i * 3] = -this.gasVel[i * 3];
          this.brownianCollisions++;
        }
      }

      this.brownianVel.multiplyScalar(0.96);
      this.brownianPos.addScaledVector(this.brownianVel, dt);
      this.brownianPos.x = Math.max(-4.5, Math.min(4.5, this.brownianPos.x));
      this.brownianPos.y = Math.max(-2.6, Math.min(2.6, this.brownianPos.y));
      this.brownianPos.z = Math.max(-2.6, Math.min(2.6, this.brownianPos.z));

      if (this.brownianMesh) this.brownianMesh.position.copy(this.brownianPos);

      if (this.brownianTrail) {
        this.brownianTrailPts.push(this.brownianPos.clone());
        if (this.brownianTrailPts.length > 220) this.brownianTrailPts.shift();
        const attr = this.brownianTrail.geometry.getAttribute('position') as THREE.BufferAttribute;
        const last = this.brownianTrailPts[this.brownianTrailPts.length - 1] ?? new THREE.Vector3();
        for (let i = 0; i < 220; i++) {
          const pt = this.brownianTrailPts[i] ?? last;
          attr.setXYZ(i, pt.x, pt.y, pt.z);
        }
        attr.needsUpdate = true;
      }

      this.syncGasInstancedMesh();
      return;
    }

    if (this.chapterId === 'thermo-entropy') {
      const halfX = 6.0;
      if (!this.dividerRemoved) {
        for (let i = 0; i < GAS_COUNT; i++) {
          const ix = i * 3;
          const speedScale = this.entropyIsHot[i] ? 5.6 : 2.3;
          this.gasPos[ix] += this.gasVel[ix] * speedScale * dt;
          this.gasPos[ix + 1] += this.gasVel[ix + 1] * speedScale * dt;
          this.gasPos[ix + 2] += this.gasVel[ix + 2] * speedScale * dt;

          const isLeft = this.entropyIsHot[i] === 1;
          const minX = isLeft ? -halfX : 0.2;
          const maxX = isLeft ? -0.2 : halfX;
          if (this.gasPos[ix] > maxX) {
            this.gasPos[ix] = maxX;
            this.gasVel[ix] = -Math.abs(this.gasVel[ix]);
          } else if (this.gasPos[ix] < minX) {
            this.gasPos[ix] = minX;
            this.gasVel[ix] = Math.abs(this.gasVel[ix]);
          }
          if (Math.abs(this.gasPos[ix + 1]) > 2.8) this.gasVel[ix + 1] *= -1;
          if (Math.abs(this.gasPos[ix + 2]) > 2.8) this.gasVel[ix + 2] *= -1;
        }
      } else {
        stepGasParticles(this.gasPos, this.gasVel, halfX, 2.8, 2.8, dt, 4.2);
      }

      let leftRed = 0;
      let leftTot = 0;
      let rightRed = 0;
      let rightTot = 0;
      for (let i = 0; i < GAS_COUNT; i++) {
        const isRed = this.entropyIsHot[i] === 1;
        if (this.gasPos[i * 3] < 0) {
          leftTot++;
          if (isRed) leftRed++;
        } else {
          rightTot++;
          if (isRed) rightRed++;
        }
      }
      this.currentEntropy = shannonMixingEntropy(leftRed, leftTot, rightRed, rightTot);
      this.syncGasInstancedMesh();
      return;
    }

    // thermo-gas
    const maxX = 5.3 * Math.max(0.35, Math.min(1.0, this.pistonVol));
    if (this.pistonMesh) {
      this.pistonMesh.position.x = maxX + 0.16;
    }
    const speedScale = 4.6 * Math.sqrt(Math.max(40, this.gasTemp) / 300);
    const count = GAS_COUNT;
    let impulse = 0;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      this.gasPos[ix] += this.gasVel[ix] * speedScale * dt;
      this.gasPos[ix + 1] += this.gasVel[ix + 1] * speedScale * dt;
      this.gasPos[ix + 2] += this.gasVel[ix + 2] * speedScale * dt;

      if (this.gasPos[ix] > maxX) {
        this.gasPos[ix] = maxX;
        this.gasVel[ix] = -Math.abs(this.gasVel[ix]);
        impulse += 2 * Math.abs(this.gasVel[ix]) * speedScale;
      } else if (this.gasPos[ix] < -5.3) {
        this.gasPos[ix] = -5.3;
        this.gasVel[ix] = Math.abs(this.gasVel[ix]);
      }
      if (this.gasPos[ix + 1] > 2.8 || this.gasPos[ix + 1] < -2.8) {
        this.gasPos[ix + 1] = Math.max(-2.8, Math.min(2.8, this.gasPos[ix + 1]));
        this.gasVel[ix + 1] *= -1;
      }
      if (this.gasPos[ix + 2] > 2.8 || this.gasPos[ix + 2] < -2.8) {
        this.gasPos[ix + 2] = Math.max(-2.8, Math.min(2.8, this.gasPos[ix + 2]));
        this.gasVel[ix + 2] *= -1;
      }
    }
    this.wallImpulseSmooth = this.wallImpulseSmooth * 0.9 + impulse * 0.1;
    this.syncGasInstancedMesh();
  }

  private syncGasInstancedMesh(): void {
    if (!this.gasMesh) return;
    this.tmpQuat.identity();
    this.tmpScale.set(1, 1, 1);
    for (let i = 0; i < GAS_COUNT; i++) {
      this.tmpPos.set(this.gasPos[i * 3], this.gasPos[i * 3 + 1], this.gasPos[i * 3 + 2]);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.gasMesh.setMatrixAt(i, this.tmpMat);
    }
    this.gasMesh.instanceMatrix.needsUpdate = true;
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'thermo-carnot') {
      return {
        sliders: [
          {
            key: 'carnotTHot',
            label: 'Hot Reservoir T_H',
            min: 400,
            max: 1200,
            step: 25,
            value: this.carnotTHot,
            unit: 'K',
            noteTitle: 'Heat Source Temp',
            noteText: 'Higher hot-reservoir temperature raises maximum Carnot efficiency.',
          },
          {
            key: 'carnotTCold',
            label: 'Cold Sink T_C',
            min: 100,
            max: 390,
            step: 10,
            value: this.carnotTCold,
            unit: 'K',
            noteTitle: 'Exhaust Sink Temp',
            noteText: 'Lower cold sink lets the engine convert more absorbed heat into work.',
          },
        ],
        toggles: [],
        actions: [],
      };
    }

    if (this.chapterId === 'thermo-brownian') {
      return {
        sliders: [
          {
            key: 'brownianTemp',
            label: 'Bath Temperature',
            min: 80,
            max: 700,
            step: 20,
            value: this.brownianTemp,
            unit: 'K',
            noteTitle: 'Thermal Agitation',
            noteText: 'Higher temperature speeds up fluid molecules, widening Brownian diffusion!',
          },
        ],
        toggles: [],
        actions: [{ id: 'resetBrownian', label: 'Recenter Grain' }],
      };
    }

    if (this.chapterId === 'thermo-entropy') {
      return {
        sliders: [],
        toggles: [],
        actions: [
          { id: 'removeDivider', label: 'Remove Divider Wall' },
          { id: 'resetEntropy', label: 'Reset Unmixed' },
        ],
      };
    }

    return {
      sliders: [
        {
          key: 'gasTemp',
          label: 'Gas Temperature (T)',
          min: 80,
          max: 800,
          step: 20,
          value: this.gasTemp,
          unit: 'K',
          noteTitle: 'Absolute Temperature',
          noteText: 'Higher T boosts molecular speed and increases pressure proportionally.',
        },
        {
          key: 'pistonVol',
          label: 'Container Volume (V)',
          min: 0.4,
          max: 1.0,
          step: 0.05,
          value: this.pistonVol,
          unit: 'V₀',
          noteTitle: 'Piston Compression',
          noteText: 'Compressing V increases collision frequency against the walls.',
        },
      ],
      toggles: [],
      actions: [],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'gasTemp' && typeof value === 'number') this.gasTemp = value;
    else if (key === 'pistonVol' && typeof value === 'number') this.pistonVol = value;
    else if (key === 'carnotTHot' && typeof value === 'number') this.carnotTHot = value;
    else if (key === 'carnotTCold' && typeof value === 'number') this.carnotTCold = value;
    else if (key === 'brownianTemp' && typeof value === 'number') this.brownianTemp = value;
  }

  public runAction(actionId: string): void {
    if (actionId === 'removeDivider') {
      this.dividerRemoved = true;
      if (this.dividerMesh) this.dividerMesh.visible = false;
    } else if (actionId === 'resetEntropy') {
      this.dividerRemoved = false;
      this.rebuildScene();
    } else if (actionId === 'resetBrownian') {
      this.rebuildScene();
    }
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'thermo-carnot') {
      const eff = carnotEfficiency(this.carnotTHot, this.carnotTCold);
      const pv = this.sampleCarnotPV(this.carnotPhase);
      return [
        {
          labelSimple: 'Carnot Efficiency η',
          labelPhysics: 'Max η = 1 − T_C/T_H',
          value: `${(eff * 100).toFixed(1)}%`,
          noteTitle: 'Carnot Efficiency Limit',
          noteText: 'No heat engine operating between T_H and T_C can exceed this efficiency.',
        },
        {
          labelSimple: 'Current Stroke',
          labelPhysics: 'Cycle Stage',
          value: pv.stage.split(' ')[0],
          noteTitle: pv.stage,
          noteText: 'Alternates between isothermal heat exchange and adiabatic expansion/compression.',
        },
        {
          labelSimple: 'Hot Temp T_H',
          labelPhysics: 'Reservoir T_H',
          value: `${this.carnotTHot} K`,
          noteTitle: 'Hot Source',
          noteText: 'Absorbs heat Q_H during top expansion stroke.',
        },
        {
          labelSimple: 'Cold Temp T_C',
          labelPhysics: 'Sink T_C',
          value: `${this.carnotTCold} K`,
          noteTitle: 'Cold Exhaust',
          noteText: 'Dumps entropy-carrying heat Q_C at the lower isotherm.',
        },
      ];
    }

    if (this.chapterId === 'thermo-brownian') {
      const r2 = this.brownianPos.lengthSq();
      return [
        {
          labelSimple: 'Grain Distance |r|',
          labelPhysics: 'Displacement |r|',
          value: `${Math.sqrt(r2).toFixed(2)} μm`,
          noteTitle: 'Random Walk Offset',
          noteText: 'Typical displacement scales as √t rather than linearly with time.',
        },
        {
          labelSimple: 'Mean Sq ⟨r²⟩',
          labelPhysics: 'Diffusion r²',
          value: `${r2.toFixed(2)} μm²`,
          noteTitle: 'Squared Displacement',
          noteText: 'Proportional to Diffusion Coefficient D × Time t.',
        },
        {
          labelSimple: 'Bath Temp T',
          labelPhysics: 'Temperature T',
          value: `${this.brownianTemp} K`,
          noteTitle: 'Fluid Temperature',
          noteText: 'Drives D = k_B T / (6π η r).',
        },
        {
          labelSimple: 'Impacts Logged',
          labelPhysics: 'Collisions',
          value: String(this.brownianCollisions),
          noteTitle: 'Molecular Strikes',
          noteText: 'Asymmetric molecular impacts steering the heavy grain.',
        },
      ];
    }

    if (this.chapterId === 'thermo-entropy') {
      const pctMax = (this.currentEntropy / Math.LN2) * 100;
      return [
        {
          labelSimple: 'Mixing Entropy S',
          labelPhysics: 'Shannon S / k_B',
          value: this.currentEntropy.toFixed(3),
          noteTitle: 'Mixing Disorder',
          noteText: '0 when separated; climbs toward ln(2) ≈ 0.693 as gases mix evenly.',
        },
        {
          labelSimple: 'Mixed Progress',
          labelPhysics: '% Max Entropy',
          value: `${pctMax.toFixed(0)}%`,
          noteTitle: 'Equilibrium Progress',
          noteText: 'Reaches ~100% once both halves hold equal shares of hot and cold atoms.',
        },
        {
          labelSimple: 'Partition State',
          labelPhysics: 'Constraint',
          value: this.dividerRemoved ? 'Open (Mixing)' : 'Closed (S=0)',
          noteTitle: 'Wall Divider',
          noteText: 'Click Remove Divider Wall to release the Second Law!',
        },
        {
          labelSimple: 'Particle Count N',
          labelPhysics: 'Total Atoms',
          value: String(GAS_COUNT),
          noteTitle: 'Microstate Population',
          noteText: 'Half initialized hot (red), half cold (blue).',
        },
      ];
    }

    const pTheory = idealGasPressure(GAS_COUNT, this.gasTemp, this.pistonVol);
    return [
      {
        labelSimple: 'Gas Pressure (P)',
        labelPhysics: 'P = NkT / V',
        value: `${pTheory.toFixed(1)} kPa`,
        noteTitle: 'Thermodynamic Pressure',
        noteText: 'Rises linearly with Temperature T and inversely with Volume V.',
      },
      {
        labelSimple: 'Temperature (T)',
        labelPhysics: 'Kinetic T',
        value: `${this.gasTemp} K`,
        noteTitle: 'Mean Kinetic Energy',
        noteText: 'Measure of average translational speed² of all 160 gas particles.',
      },
      {
        labelSimple: 'Volume Ratio V',
        labelPhysics: 'Chamber V/V₀',
        value: `${(this.pistonVol * 100).toFixed(0)}%`,
        noteTitle: 'Piston Volume',
        noteText: 'Drag Volume slider left to compress the chamber.',
      },
      {
        labelSimple: 'Wall Impulse',
        labelPhysics: 'Piston Δp/Δt',
        value: `${this.wallImpulseSmooth.toFixed(1)}`,
        noteTitle: 'Microscopic Impacts',
        noteText: 'Measured impulse from particles bouncing off the piston face.',
      },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'thermo-carnot') {
      return {
        captionSimple: 'No heat engine can ever turn 100% of heat into work—efficiency tops out at 1 − T_C / T_H.',
        captionPhysics: 'Carnot Reversible Engine Theorem',
        tex: String.raw`\eta_{\max} = 1 - \frac{T_C}{T_H}, \quad W = \oint P\,dV`,
      };
    }
    if (this.chapterId === 'thermo-brownian') {
      return {
        captionSimple: 'Random molecular kicks make the average squared distance grow steadily in proportion to time.',
        captionPhysics: 'Einstein-Smoluchowski Brownian Diffusion',
        tex: String.raw`\langle r^2(t) \rangle = 6 D t, \quad D = \frac{k_B T}{6\pi\eta a}`,
      };
    }
    if (this.chapterId === 'thermo-entropy') {
      return {
        captionSimple: 'Removed walls let particles spread over exponentially more states—driving S = k ln Ω upward.',
        captionPhysics: 'Boltzmann Entropy & Mixing Irreversibility',
        tex: String.raw`S = k_B \ln \Omega \implies \Delta S_{\text{mix}} = N k_B \ln 2`,
      };
    }
    return {
      captionSimple: 'Gas pressure equals molecular collisions per second: hotter temperature or smaller volume pushes harder!',
      captionPhysics: 'Ideal Gas Law & Kinetic Theory',
      tex: String.raw`P V = N k_B T, \quad \frac{1}{2} m \langle v^2 \rangle = \frac{3}{2} k_B T`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'thermo-carnot') {
      const pv = this.sampleCarnotPV(this.carnotPhase);
      return {
        ch1: pv.pNorm * 10,
        ch2: pv.vNorm * 10,
        ch3: carnotEfficiency(this.carnotTHot, this.carnotTCold) * 10,
        labels: ['P', 'V', '10η'],
        units: ['', '', ''],
      };
    }
    if (this.chapterId === 'thermo-brownian') {
      return {
        ch1: this.brownianPos.x,
        ch2: this.brownianPos.z,
        ch3: this.brownianPos.lengthSq(),
        labels: ['x', 'z', 'r²'],
        units: ['', '', ''],
      };
    }
    if (this.chapterId === 'thermo-entropy') {
      return {
        ch1: this.currentEntropy * 10,
        ch2: Math.LN2 * 10,
        ch3: this.dividerRemoved ? 5 : 0,
        labels: ['S×10', 'Max', 'Open'],
        units: ['', '', ''],
      };
    }
    const p = idealGasPressure(GAS_COUNT, this.gasTemp, this.pistonVol);
    return {
      ch1: p * 0.01,
      ch2: this.wallImpulseSmooth * 0.2,
      ch3: this.pistonVol * 10,
      labels: ['P', 'Imp', '10V'],
      units: ['', '', ''],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<ThermoChapterId, string> = {
      'thermo-gas': 'Vol V · Ideal Gas Chamber',
      'thermo-carnot': 'Vol V · Carnot Heat Engine',
      'thermo-brownian': 'Vol V · Brownian Random Walk',
      'thermo-entropy': 'Vol V · Entropy & Mixing',
    };
    return { label: names[this.chapterId], color: '#f97316' };
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public inspectHit(hitObj: THREE.Object3D): LabHoverData | null {
    let cur: THREE.Object3D | null = hitObj;
    while (cur) {
      if (cur.userData?.study) {
        return { ...(cur.userData.study as StudyMeta), metrics: [] };
      }
      cur = cur.parent;
    }
    return null;
  }

  public getCallouts(): LabCalloutPoint[] {
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    return { position: [0, 7.5, 16.5], target: [0, 0, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
