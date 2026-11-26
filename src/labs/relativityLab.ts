import * as THREE from 'three';
import { attachModel } from '../render/modelLibrary';
import {
  contractedLength,
  fissionKFactor,
  lorentzBoost,
  lorentzGamma,
  radioactiveRemaining,
} from '../physics/relativityPhysics';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type RelChapterId = 'rel-dilation' | 'rel-lorentz' | 'rel-decay' | 'rel-fission';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

const CRYSTAL_N = 216;
const FISSION_ATOMS = 80;
const NEUTRONS_MAX = 48;

export class RelativityLab implements LabModule {
  public readonly topicId = 'relativity' as const;
  public readonly group = new THREE.Group();

  private chapterId: RelChapterId = 'rel-dilation';
  private simTime = 0;

  // Time Dilation & Lorentz params
  private beta = 0.72;
  private restPhotonMesh: THREE.Mesh | null = null;
  private moveClockGroup = new THREE.Group();
  private movePhotonMesh: THREE.Mesh | null = null;
  private zigzagTrail: THREE.Line | null = null;
  private zigzagPts: THREE.Vector3[] = [];
  private craftMesh: THREE.Mesh | null = null;
  private ctPrimeAxis: THREE.Line | null = null;
  private xPrimeAxis: THREE.Line | null = null;

  // Radioactive Decay
  private halfLife = 5.0;
  private decayDecayed = new Uint8Array(CRYSTAL_N);
  private crystalMesh: THREE.InstancedMesh | null = null;
  private remainingAtoms = CRYSTAL_N;

  // Nuclear Fission
  private rodInsertion = 0.45;
  private enrichment = 0.65;
  private neutronMesh: THREE.InstancedMesh | null = null;
  private neutronPos = new Float32Array(NEUTRONS_MAX * 3);
  private neutronVel = new Float32Array(NEUTRONS_MAX * 3);
  private neutronActive = new Uint8Array(NEUTRONS_MAX);
  private controlRods: THREE.Mesh[] = [];
  private fuelMesh: THREE.InstancedMesh | null = null;
  private fuelSplit = new Uint8Array(FISSION_ATOMS);
  private fissionCount = 0;

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpCol = new THREE.Color();

  public activate(chapterId: string): void {
    const valid: RelChapterId[] = ['rel-dilation', 'rel-lorentz', 'rel-decay', 'rel-fission'];
    this.chapterId = valid.includes(chapterId as RelChapterId)
      ? (chapterId as RelChapterId)
      : 'rel-dilation';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'resetDecay' || apply.action === 'triggerFission') {
      this.rebuildScene();
      return;
    }
    if (typeof apply.beta === 'number') this.beta = apply.beta;
    if (typeof apply.halfLife === 'number') this.halfLife = apply.halfLife;
    if (typeof apply.rodInsertion === 'number') this.rodInsertion = apply.rodInsertion;
    this.rebuildScene();
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
    this.zigzagPts = [];
    this.controlRods = [];
    this.restPhotonMesh = null;
    this.movePhotonMesh = null;
    this.zigzagTrail = null;
    this.craftMesh = null;
    this.ctPrimeAxis = null;
    this.xPrimeAxis = null;
    this.crystalMesh = null;
    this.neutronMesh = null;
    this.fuelMesh = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;
    if (this.chapterId === 'rel-dilation') this.buildDilationScene();
    else if (this.chapterId === 'rel-lorentz') this.buildLorentzConeScene();
    else if (this.chapterId === 'rel-decay') this.buildDecayScene();
    else this.buildFissionScene();
  }

  private buildDilationScene(): void {
    const mirrorG = this.track(new THREE.BoxGeometry(2.2, 0.25, 1.5));
    const restM = this.track(new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x0284c7, emissiveIntensity: 0.4 }));
    const moveM = this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.4 }));

    // Rest clock at x = -6
    for (const y of [-2.5, 2.5]) {
      const m = new THREE.Mesh(mirrorG, restM);
      m.position.set(-6, y, 0);
      this.attachStudy(m, {
        key: 'clock-rest',
        title: 'Stationary Light Clock (v = 0)',
        badge: 'PROPER TIME τ',
        accent: '#00f0ff',
        simple: 'Photon bounces straight up & down between mirrors—ticking fastest in its own rest frame!',
        deeper: 'Defines proper time interval Δτ = 2L / c.',
      });
      this.group.add(m);
      void attachModel(m, 'clock_mirror');
    }

    this.restPhotonMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.25, 14, 14)),
      this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff })),
    );
    this.restPhotonMesh.position.set(-6, 0, 0);
    this.group.add(this.restPhotonMesh);
    void attachModel(this.restPhotonMesh, 'photon_pulse');

    // Moving clock assembly
    this.moveClockGroup = new THREE.Group();
    for (const y of [-2.5, 2.5]) {
      const m = new THREE.Mesh(mirrorG, moveM);
      m.position.set(0, y, 0);
      this.attachStudy(m, {
        key: 'clock-move',
        title: 'Moving Light Clock (v = βc)',
        badge: 'TIME DILATION',
        accent: '#fbbf24',
        simple: 'Because light speed c stays identical for everyone, a photon in a moving ship travels a longer diagonal zigzag—making moving clocks tick SLOWER!',
        deeper: 'Pythagorean spacetime geometry directly yields Δt = γ Δτ = Δτ / √(1 − β²).',
      });
      this.moveClockGroup.add(m);
      void attachModel(m, 'clock_mirror');
    }
    this.movePhotonMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.25, 14, 14)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 })),
    );
    this.moveClockGroup.add(this.movePhotonMesh);
    void attachModel(this.movePhotonMesh, 'photon_pulse');
    this.group.add(this.moveClockGroup);

    const zG = this.track(new THREE.BufferGeometry());
    zG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(180 * 3), 3));
    this.zigzagTrail = new THREE.Line(zG, this.track(new THREE.LineBasicMaterial({ color: 0xc084fc })));
    this.zigzagTrail.frustumCulled = false;
    this.group.add(this.zigzagTrail);
  }

  private buildLorentzConeScene(): void {
    // 3D Double Light Cone (ct vertically along Y)
    const coneMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      }),
    );
    const futureCone = new THREE.Mesh(this.track(new THREE.ConeGeometry(4.5, 4.5, 24, 1, true)), coneMat);
    futureCone.position.set(0, 2.25, 0);
    futureCone.rotation.x = Math.PI;
    const pastCone = new THREE.Mesh(this.track(new THREE.ConeGeometry(4.5, 4.5, 24, 1, true)), coneMat);
    pastCone.position.set(0, -2.25, 0);
    this.attachStudy(futureCone, {
      key: 'light-cone',
      title: 'Minkowski Light Cone (c = 1)',
      badge: 'CAUSAL BOUNDARY',
      accent: '#fbbf24',
      simple: 'Nothing can travel outside this 45° golden cone! Notice how boosted space-time axes scissor inward toward the cone without crossing c.',
      deeper: 'Conserves spacetime interval s² = (ct)² − x² − y² = (ct′)² − x′² − y′².',
    });
    this.group.add(futureCone, pastCone);

    // Primed boosted ct' and x' axes
    const primeMat = this.track(new THREE.LineBasicMaterial({ color: 0xc084fc }));
    this.ctPrimeAxis = new THREE.Line(
      this.track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])),
      primeMat,
    );
    this.xPrimeAxis = new THREE.Line(
      this.track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])),
      primeMat,
    );
    this.group.add(this.ctPrimeAxis, this.xPrimeAxis);

    // Contracted Starship Bar at bottom foreground
    const lRest = 6.0;
    const lCont = contractedLength(lRest, this.beta);
    this.craftMesh = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(lCont, 0.7, 1.4)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x0284c7, emissiveIntensity: 0.6 })),
    );
    this.craftMesh.position.set(0, -3.8, 2.5);
    this.attachStudy(this.craftMesh, {
      key: 'lorentz-craft',
      title: 'Lorentz-Contracted Spacecraft',
      badge: 'LENGTH CONTRACTION',
      accent: '#00f0ff',
      simple: `Rest length 6.0 m squishes down to ${lCont.toFixed(2)} m along its travel direction at v = ${this.beta.toFixed(2)}c!`,
      deeper: 'L = L₀ / γ = L₀ √(1 − β²).',
    });
    this.group.add(this.craftMesh);
    void attachModel(this.craftMesh, 'relativistic_craft', { fit: 'stretch' });
    this.updateBoostAxes();
  }

  private updateBoostAxes(): void {
    const p1 = lorentzBoost(0, 4.5, -this.beta);
    const p2 = lorentzBoost(0, -4.5, -this.beta);
    const x1 = lorentzBoost(4.5, 0, -this.beta);
    const x2 = lorentzBoost(-4.5, 0, -this.beta);
    if (this.ctPrimeAxis) {
      const a = this.ctPrimeAxis.geometry.getAttribute('position') as THREE.BufferAttribute;
      a.setXYZ(0, p2.xPrime * 0.7, p2.ctPrime * 0.7, 0);
      a.setXYZ(1, p1.xPrime * 0.7, p1.ctPrime * 0.7, 0);
      a.needsUpdate = true;
    }
    if (this.xPrimeAxis) {
      const a = this.xPrimeAxis.geometry.getAttribute('position') as THREE.BufferAttribute;
      a.setXYZ(0, x2.xPrime * 0.7, x2.ctPrime * 0.7, 0);
      a.setXYZ(1, x1.xPrime * 0.7, x1.ctPrime * 0.7, 0);
      a.needsUpdate = true;
    }
  }

  private buildDecayScene(): void {
    this.decayDecayed.fill(0);
    this.remainingAtoms = CRYSTAL_N;

    const aGeom = this.track(new THREE.SphereGeometry(0.32, 12, 12));
    const aMat = this.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    this.crystalMesh = new THREE.InstancedMesh(aGeom, aMat, CRYSTAL_N);
    this.attachStudy(this.crystalMesh, {
      key: 'decay-crystal',
      title: '216-Atom Radioactive Lattice',
      badge: 'STOCHASTIC DECAY',
      accent: '#10b981',
      simple: 'Unstable emerald atoms flip stochastically to slate daughter nuclei! Every half-life interval, roughly half the remaining emerald atoms decay.',
      deeper: 'Memoryless Poisson decay N(t) = N₀ (½)^(t / t_{1/2}) with rate λ = ln(2) / t_{1/2}.',
    });

    this.tmpQuat.identity();
    this.tmpScale.set(1, 1, 1);
    let idx = 0;
    for (let ix = 0; ix < 6; ix++) {
      for (let iy = 0; iy < 6; iy++) {
        for (let iz = 0; iz < 6; iz++) {
          this.tmpPos.set((ix - 2.5) * 1.15, (iy - 2.5) * 1.15, (iz - 2.5) * 1.15);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.crystalMesh.setMatrixAt(idx, this.tmpMat);
          this.crystalMesh.setColorAt(idx, this.tmpCol.setHex(0x10b981));
          idx++;
        }
      }
    }
    this.crystalMesh.instanceMatrix.needsUpdate = true;
    if (this.crystalMesh.instanceColor) this.crystalMesh.instanceColor.needsUpdate = true;
    this.group.add(this.crystalMesh);
  }

  private buildFissionScene(): void {
    this.fuelSplit.fill(0);
    this.fissionCount = 0;
    this.neutronActive.fill(0);

    // 80 U-235 Nuclei in reactor core
    const fGeom = this.track(new THREE.SphereGeometry(0.34, 14, 14));
    const fMat = this.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    this.fuelMesh = new THREE.InstancedMesh(fGeom, fMat, FISSION_ATOMS);
    this.attachStudy(this.fuelMesh, {
      key: 'fission-fuel',
      title: 'Uranium-235 Reactor Core',
      badge: 'CHAIN REACTION',
      accent: '#c084fc',
      simple: 'Neutrons split heavy nuclei, releasing energy + 2–3 new neutrons! Insert Boron control rods to prevent a runaway cascade.',
      deeper: 'Reproduction factor k_eff < 1 decays subcritically; k_eff = 1 maintains steady power; k_eff > 1 grows exponentially.',
    });

    this.tmpQuat.identity();
    this.tmpScale.set(1, 1, 1);
    let idx = 0;
    for (let ix = 0; ix < 5; ix++) {
      for (let iy = 0; iy < 4; iy++) {
        for (let iz = 0; iz < 4; iz++) {
          this.tmpPos.set((ix - 2) * 2.1, (iy - 1.5) * 1.7, (iz - 1.5) * 1.7);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.fuelMesh.setMatrixAt(idx, this.tmpMat);
          this.fuelMesh.setColorAt(idx, this.tmpCol.setHex(0x10b981));
          idx++;
        }
      }
    }
    this.fuelMesh.instanceMatrix.needsUpdate = true;
    if (this.fuelMesh.instanceColor) this.fuelMesh.instanceColor.needsUpdate = true;
    this.group.add(this.fuelMesh);

    // 3 Boron Control Rods sliding vertically from top
    const rodG = this.track(new THREE.CylinderGeometry(0.28, 0.28, 6.2, 16));
    const rodM = this.track(new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0x0f172a }));
    for (const rx of [-2.1, 0, 2.1]) {
      const r = new THREE.Mesh(rodG, rodM);
      r.position.set(rx, 6.2 - this.rodInsertion * 5.8, 0);
      this.attachStudy(r, {
        key: 'control-rod',
        title: 'Boron Neutron-Absorbing Control Rod',
        badge: 'MODERATOR / BRAKE',
        accent: '#94a3b8',
        simple: 'Lowering these rods absorbs free neutrons, smoothly steering k_eff down below 1.0.',
        deeper: 'B-10 captures thermal neutrons before they trigger further U-235 fissions.',
      });
      this.group.add(r);
      void attachModel(r, 'control_rod', { fit: 'y' });
      this.controlRods.push(r);
    }

    // Neutrons
    const nGeom = this.track(new THREE.SphereGeometry(0.14, 10, 10));
    const nMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    this.neutronMesh = new THREE.InstancedMesh(nGeom, nMat, NEUTRONS_MAX);
    this.neutronMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.neutronMesh.frustumCulled = false;
    this.group.add(this.neutronMesh);

    // Seed 6 prompt neutrons
    for (let i = 0; i < 6; i++) {
      this.spawnNeutron(i, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    }
  }

  private spawnNeutron(slot: number, x: number, y: number, z: number): void {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const spd = 4.6;
    this.neutronPos[slot * 3] = x;
    this.neutronPos[slot * 3 + 1] = y;
    this.neutronPos[slot * 3 + 2] = z;
    this.neutronVel[slot * 3] = spd * Math.sin(ph) * Math.cos(th);
    this.neutronVel[slot * 3 + 1] = spd * Math.sin(ph) * Math.sin(th);
    this.neutronVel[slot * 3 + 2] = spd * Math.cos(ph);
    this.neutronActive[slot] = 1;
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'rel-dilation') {
      const cSim = 4.5;
      const g = lorentzGamma(this.beta);
      const yRest = 2.35 * Math.sin((this.simTime * cSim * Math.PI) / 5.0);
      if (this.restPhotonMesh) this.restPhotonMesh.position.y = yRest;

      const shipX = -1.5 + ((this.simTime * this.beta * cSim) % 10.5);
      if (shipX < -1.45 && dt > 0) this.zigzagPts = [];
      this.moveClockGroup.position.x = shipX;
      const yMove = 2.35 * Math.sin(((this.simTime / g) * cSim * Math.PI) / 5.0);
      if (this.movePhotonMesh) this.movePhotonMesh.position.y = yMove;

      if (this.zigzagTrail) {
        this.zigzagPts.push(new THREE.Vector3(shipX, yMove, 0));
        if (this.zigzagPts.length > 180) this.zigzagPts.shift();
        const attr = this.zigzagTrail.geometry.getAttribute('position') as THREE.BufferAttribute;
        const last = this.zigzagPts[this.zigzagPts.length - 1] ?? new THREE.Vector3();
        for (let i = 0; i < 180; i++) {
          const p = this.zigzagPts[i] ?? last;
          attr.setXYZ(i, p.x, p.y, p.z);
        }
        attr.needsUpdate = true;
      }
      return;
    }

    if (this.chapterId === 'rel-lorentz') {
      if (this.craftMesh) {
        const lCont = contractedLength(6.0, this.beta);
        this.craftMesh.scale.x = lCont / 6.0;
        this.craftMesh.position.x = -7 + ((this.simTime * this.beta * 5.0) % 14);
      }
      return;
    }

    if (this.chapterId === 'rel-decay') {
      if (dt > 0 && this.crystalMesh) {
        const lambda = Math.LN2 / Math.max(0.5, this.halfLife);
        const pDecay = 1 - Math.exp(-lambda * dt);
        let rem = 0;
        let changed = false;
        for (let i = 0; i < CRYSTAL_N; i++) {
          if (this.decayDecayed[i] === 0 && Math.random() < pDecay) {
            this.decayDecayed[i] = 1;
            this.crystalMesh.setColorAt(i, this.tmpCol.setHex(0x475569));
            changed = true;
          }
          if (this.decayDecayed[i] === 0) rem++;
        }
        this.remainingAtoms = rem;
        if (changed && this.crystalMesh.instanceColor) {
          this.crystalMesh.instanceColor.needsUpdate = true;
        }
      }
      return;
    }

    // Fission reaction
    const kEff = fissionKFactor(this.enrichment, this.rodInsertion);
    for (const r of this.controlRods) {
      r.position.y = 6.2 - this.rodInsertion * 5.8;
    }
    if (this.neutronMesh) {
      this.tmpQuat.identity();
      for (let i = 0; i < NEUTRONS_MAX; i++) {
        if (this.neutronActive[i] === 0) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpPos.set(0, 0, 0), this.tmpQuat, this.tmpScale);
          this.neutronMesh.setMatrixAt(i, this.tmpMat);
          continue;
        }
        let nx = this.neutronPos[i * 3] + this.neutronVel[i * 3] * dt;
        let ny = this.neutronPos[i * 3 + 1] + this.neutronVel[i * 3 + 1] * dt;
        let nz = this.neutronPos[i * 3 + 2] + this.neutronVel[i * 3 + 2] * dt;

        // Absorbed by control rod?
        if (ny > 3.1 - this.rodInsertion * 5.8 && Math.abs(nz) < 0.5 && (Math.abs(nx) < 0.45 || Math.abs(Math.abs(nx) - 2.1) < 0.45)) {
          this.neutronActive[i] = 0;
        }
        if (Math.abs(nx) > 6 || Math.abs(ny) > 4.2 || Math.abs(nz) > 4.2) {
          nx = (Math.random() - 0.5) * 4;
          ny = (Math.random() - 0.5) * 3;
          nz = (Math.random() - 0.5) * 3;
          if (Math.random() > Math.min(0.95, kEff * 0.55)) {
            this.neutronActive[i] = 0;
          }
        }
        if (this.neutronActive[i] === 1 && Math.random() < 0.025 * kEff) {
          this.fissionCount++;
          const slot2 = this.neutronActive.indexOf(0);
          if (slot2 >= 0) this.spawnNeutron(slot2, nx, ny, nz);
        }
        this.neutronPos[i * 3] = nx;
        this.neutronPos[i * 3 + 1] = ny;
        this.neutronPos[i * 3 + 2] = nz;
        this.tmpScale.set(1, 1, 1);
        this.tmpPos.set(nx, ny, nz);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.neutronMesh.setMatrixAt(i, this.tmpMat);
      }
      this.neutronMesh.instanceMatrix.needsUpdate = true;

      // Ensure at least 2 prompt neutrons remain when kEff >= 0.9
      if (kEff >= 0.9 && this.neutronActive.every((v) => v === 0)) {
        this.spawnNeutron(0, 0, 0, 0);
        this.spawnNeutron(1, 1, 0.5, -0.5);
      }
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'rel-dilation' || this.chapterId === 'rel-lorentz') {
      return {
        sliders: [
          {
            key: 'beta',
            label: 'Ship Speed β = v/c',
            min: 0.0,
            max: 0.95,
            step: 0.02,
            value: this.beta,
            unit: 'c',
            noteTitle: 'Relativistic Fraction v/c',
            noteText: 'Above 0.7c, time dilation and length contraction grow dramatically!',
          },
        ],
        toggles: [],
        actions: [],
      };
    }
    if (this.chapterId === 'rel-decay') {
      return {
        sliders: [
          {
            key: 'halfLife',
            label: 'Half-Life t₁/₂',
            min: 1.0,
            max: 12.0,
            step: 0.5,
            value: this.halfLife,
            unit: 's',
            noteTitle: 'Nuclear Stability',
            noteText: 'Time for half of the remaining emerald atoms to decay.',
          },
        ],
        toggles: [],
        actions: [{ id: 'resetDecay', label: 'Refill 216 Atoms' }],
      };
    }
    return {
      sliders: [
        {
          key: 'rodInsertion',
          label: 'Control Rod Depth',
          min: 0.0,
          max: 1.0,
          step: 0.05,
          value: this.rodInsertion,
          unit: '',
          noteTitle: 'Boron Absorption',
          noteText: 'Push rods deeper to quench criticality k_eff < 1.',
        },
        {
          key: 'enrichment',
          label: 'U-235 Enrichment',
          min: 0.2,
          max: 1.0,
          step: 0.05,
          value: this.enrichment,
          unit: '',
          noteTitle: 'Fissile Concentration',
          noteText: 'Higher enrichment boosts neutron multiplication.',
        },
      ],
      toggles: [],
      actions: [{ id: 'triggerFission', label: 'Fire Prompt Neutrons' }],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'beta' && typeof value === 'number') {
      this.beta = value;
      if (this.chapterId === 'rel-lorentz') this.rebuildScene();
    } else if (key === 'halfLife' && typeof value === 'number') {
      this.halfLife = value;
    } else if (key === 'rodInsertion' && typeof value === 'number') {
      this.rodInsertion = value;
    } else if (key === 'enrichment' && typeof value === 'number') {
      this.enrichment = value;
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'resetDecay' || actionId === 'triggerFission') this.rebuildScene();
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'rel-dilation' || this.chapterId === 'rel-lorentz') {
      const g = lorentzGamma(this.beta);
      const len = contractedLength(6.0, this.beta);
      return [
        { labelSimple: 'Lorentz Factor γ', labelPhysics: 'γ = 1/√(1−β²)', value: `${g.toFixed(3)}×`, noteTitle: 'Time Stretch Factor', noteText: '1 moving second takes γ rest seconds!' },
        { labelSimple: 'Moving Clock Rate', labelPhysics: '1 / γ', value: `${(100 / g).toFixed(1)}%`, noteTitle: 'Tick Slowdown', noteText: 'Moving clocks tick slower by 1/γ.' },
        { labelSimple: 'Contracted Length', labelPhysics: 'L = L₀ / γ', value: `${len.toFixed(2)} m`, noteTitle: '6.0 m Rest Ship', noteText: 'Squishes along velocity direction.' },
        { labelSimple: 'Speed Fraction β', labelPhysics: 'v / c', value: `${this.beta.toFixed(2)} c`, noteTitle: 'Fraction of Light Speed', noteText: 'Approach c = 1 to stretch γ toward infinity.' },
      ];
    }
    if (this.chapterId === 'rel-decay') {
      const expected = radioactiveRemaining(CRYSTAL_N, this.halfLife, this.simTime);
      return [
        { labelSimple: 'Emerald Left', labelPhysics: 'Remaining N(t)', value: `${this.remainingAtoms} / ${CRYSTAL_N}`, noteTitle: 'Active Isotope Count', noteText: 'Drops randomly along exponential decay.' },
        { labelSimple: 'Theory Prediction', labelPhysics: 'N₀ (½)^(t/t½)', value: expected.toFixed(1), noteTitle: 'Expected Curve', noteText: 'Continuous exponential law matches stochastic crystal.' },
        { labelSimple: 'Half-Lives Passed', labelPhysics: 't / t₁/₂', value: (this.simTime / this.halfLife).toFixed(2), noteTitle: 'Elapsed Half-Lives', noteText: 'At 1.0 half-life, ~108 atoms remain.' },
        { labelSimple: 'Half-Life t₁/₂', labelPhysics: 'Decay Half-Life', value: `${this.halfLife.toFixed(1)} s`, noteTitle: 'Decay Constant', noteText: 'λ = ln(2) / t₁/₂.' },
      ];
    }
    const k = fissionKFactor(this.enrichment, this.rodInsertion);
    let activeN = 0;
    for (let i = 0; i < NEUTRONS_MAX; i++) if (this.neutronActive[i] === 1) activeN++;
    return [
      { labelSimple: 'Criticality k_eff', labelPhysics: 'Neutron Factor k', value: k.toFixed(2), noteTitle: 'Chain Balance', noteText: 'k < 1 dies out, k ≈ 1 steady, k > 1 grows rapidly.' },
      { labelSimple: 'Reactor State', labelPhysics: 'Regime', value: k > 1.05 ? 'Supercritical!' : k >= 0.92 ? 'Critical (Steady)' : 'Subcritical', noteTitle: 'Operating Regime', noteText: 'Steer with Boron control rods!' },
      { labelSimple: 'Live Neutrons', labelPhysics: 'Active Flux', value: String(activeN), noteTitle: 'Free Neutrons', noteText: 'Triggers new U-235 splits.' },
      { labelSimple: 'Fission Events', labelPhysics: 'Total Splits', value: String(this.fissionCount), noteTitle: 'Cumulative Reactions', noteText: 'Releases ~200 MeV per U-235 split.' },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'rel-dilation') {
      return {
        captionSimple: 'Light bounces diagonally inside a moving clock—stretching every tick by γ!',
        captionPhysics: 'Special Relativistic Time Dilation',
        tex: String.raw`\Delta t = \gamma \Delta \tau = \frac{\Delta \tau}{\sqrt{1 - v^2/c^2}}`,
      };
    }
    if (this.chapterId === 'rel-lorentz') {
      return {
        captionSimple: 'High-speed objects shrink along motion while preserving spacetime interval (ct)² − x².',
        captionPhysics: 'Lorentz Transformation & Length Contraction',
        tex: String.raw`L = \frac{L_0}{\gamma}, \quad (ct')^2 - x'^2 = (ct)^2 - x^2`,
      };
    }
    if (this.chapterId === 'rel-decay') {
      return {
        captionSimple: 'Each unstable atom flips at random, halving the surviving population every t₁/₂.',
        captionPhysics: 'Exponential Radioactive Decay',
        tex: String.raw`N(t) = N_0 \left(\frac{1}{2}\right)^{t / t_{1/2}} = N_0 e^{-\lambda t}`,
      };
    }
    return {
      captionSimple: 'Control rods absorb neutrons so each fission triggers roughly one new split (k_eff ≈ 1).',
      captionPhysics: 'Nuclear Criticality Factor',
      tex: String.raw`N_{n+1} = k_{\text{eff}}\,N_n \quad (k_{\text{eff}} = 1 \text{ critical})`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'rel-decay') {
      return {
        ch1: this.remainingAtoms,
        ch2: radioactiveRemaining(CRYSTAL_N, this.halfLife, this.simTime),
        ch3: CRYSTAL_N * 0.5,
        labels: ['N_sim', 'N_th', 'N₀/2'],
        units: ['', '', ''],
      };
    }
    if (this.chapterId === 'rel-fission') {
      let activeN = 0;
      for (let i = 0; i < NEUTRONS_MAX; i++) if (this.neutronActive[i] === 1) activeN++;
      return {
        ch1: activeN,
        ch2: fissionKFactor(this.enrichment, this.rodInsertion) * 10,
        ch3: this.fissionCount % 50,
        labels: ['n', '10k', 'Splits'],
        units: ['', '', ''],
      };
    }
    const g = lorentzGamma(this.beta);
    return { ch1: g, ch2: 1 / g, ch3: this.beta, labels: ['γ', '1/γ', 'β'], units: ['', '', 'c'] };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<RelChapterId, string> = {
      'rel-dilation': 'Vol IX · Light Clock & Time Dilation',
      'rel-lorentz': 'Vol IX · Lorentz & Light Cone',
      'rel-decay': 'Vol IX · Radioactive Half-Life',
      'rel-fission': 'Vol IX · Nuclear Chain Reaction',
    };
    return { label: names[this.chapterId], color: '#c084fc' };
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public inspectHit(hitObj: THREE.Object3D): LabHoverData | null {
    let cur: THREE.Object3D | null = hitObj;
    while (cur) {
      if (cur.userData?.study) return { ...(cur.userData.study as StudyMeta), metrics: [] };
      cur = cur.parent;
    }
    return null;
  }

  public getCallouts(): LabCalloutPoint[] {
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'rel-decay') return { position: [8, 7, 11], target: [0, 0, 0] };
    return { position: [0, 4.5, 16.5], target: [0, 0, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
