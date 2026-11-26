import * as THREE from 'three';
import { attachModel } from '../render/modelLibrary';
import {
  computeElectricField,
  computeElectricPotential,
  evaluateEmWave,
  evaluateFaradayCoil,
  evaluateHallEquilibrium,
  stepBorisLorentz,
  type PointCharge,
  type Vec3Like,
} from '../physics/emPhysics';
import { createRadialGlowTexture } from '../render/visualAssets';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type EmChapterId = 'em-dipole' | 'em-lorentz' | 'em-wave' | 'em-faraday' | 'em-hall';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

interface TestCharge {
  pos: Vec3Like;
  vel: Vec3Like;
  active: boolean;
}

const TRAIL_LEN = 120;
const FARADAY_ELECTRONS = 140;
const HALL_CARRIERS = 160;

export class EmLab implements LabModule {
  public readonly topicId = 'em' as const;
  public readonly group = new THREE.Group();

  private chapterId: EmChapterId = 'em-dipole';
  private simTime = 0;

  // Dipole params
  private separation = 7.0;
  private chargeMag = 1.6;
  private polarity = 1;
  private showFieldLines = true;
  private showVectors = true;
  private dipoleCharges: PointCharge[] = [];
  private testCharges: TestCharge[] = [];
  private testChargeMesh: THREE.InstancedMesh | null = null;
  private dipolePosMesh: THREE.Mesh | null = null;
  private dipoleNegMesh: THREE.Mesh | null = null;
  private dipoleLinesGroup = new THREE.Group();
  private dipoleArrowShafts: THREE.InstancedMesh | null = null;
  private dipoleArrowHeads: THREE.InstancedMesh | null = null;
  private dipoleArrowGrid: Vec3Like[] = [];

  // Lorentz params
  private bField = 1.8;
  private ez = 0.55;
  private qSign = 1;
  private launchSpeed = 6.2;
  private lorentzPos: Vec3Like = { x: 3.4, y: 0, z: 0 };
  private lorentzVel: Vec3Like = { x: 0, y: 0, z: 6.2 };
  private lorentzMesh: THREE.Mesh | null = null;
  private lorentzTrail: THREE.Line | null = null;
  private lorentzTrailPts: THREE.Vector3[] = [];
  private lorentzVelArrow: THREE.ArrowHelper | null = null;
  private lorentzForceArrow: THREE.ArrowHelper | null = null;
  private lorentzBColumns: THREE.Mesh[] = [];
  private lorentzEArrows: THREE.InstancedMesh | null = null;

  // EM Wave params
  private waveFreq = 1.1;
  private wavelength = 8.0;
  private circularPol = false;
  private showPoynting = true;
  private emEArrowShafts: THREE.InstancedMesh | null = null;
  private emEArrowHeads: THREE.InstancedMesh | null = null;
  private emBArrowShafts: THREE.InstancedMesh | null = null;
  private emBArrowHeads: THREE.InstancedMesh | null = null;
  private emPoyntingArrows: THREE.InstancedMesh | null = null;
  private emERibbon: THREE.Line | null = null;
  private emBRibbon: THREE.Line | null = null;
  private emWaveBox: THREE.Mesh | null = null;

  // Faraday params
  private faradayFreq = 1.25;
  private coilTurns = 8;
  private magnetAmp = 4.6;
  private magnetGroup = new THREE.Group();
  private faradayElectronMesh: THREE.InstancedMesh | null = null;
  private faradayTheta = new Float32Array(FARADAY_ELECTRONS);
  private faradayBulbMat: THREE.MeshStandardMaterial | null = null;
  private faradayBulbGlowMat: THREE.SpriteMaterial | null = null;
  private lastFaradaySample = evaluateFaradayCoil(0, 1.25, 4.6, 8);

  // Hall Effect params
  private hallCurrent = 2.6;
  private hallB = 1.8;
  private hallCarrierSign: 1 | -1 = -1;
  private hallShowE = true;
  private hallBuildup = 0;
  private hallCarrierMesh: THREE.InstancedMesh | null = null;
  private hallCarrierCoords = new Float32Array(HALL_CARRIERS * 3);
  private hallFrontPlateMat: THREE.MeshStandardMaterial | null = null;
  private hallBackPlateMat: THREE.MeshStandardMaterial | null = null;
  private hallBArrowShafts: THREE.InstancedMesh | null = null;
  private hallBArrowHeads: THREE.InstancedMesh | null = null;
  private hallEArrowShafts: THREE.InstancedMesh | null = null;
  private hallEArrowHeads: THREE.InstancedMesh | null = null;

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  public activate(chapterId: string): void {
    const valid: EmChapterId[] = ['em-dipole', 'em-lorentz', 'em-wave', 'em-faraday', 'em-hall'];
    this.chapterId = valid.includes(chapterId as EmChapterId)
      ? (chapterId as EmChapterId)
      : 'em-dipole';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'launchTestCharge') {
      this.spawnTestCharge();
      return;
    }
    if (apply.action === 'flipPolarity') {
      this.polarity *= -1;
      this.rebuildScene();
      return;
    }
    if (apply.action === 'flipB') {
      this.hallB = -this.hallB;
      this.hallBuildup = 0;
      this.updateHallVisuals();
      return;
    }
    if (apply.action === 'replayHall') {
      this.hallBuildup = 0;
      return;
    }
    if (typeof apply.carrierSign === 'number') {
      this.hallCarrierSign = apply.carrierSign >= 0 ? 1 : -1;
      this.hallBuildup = 0;
      this.rebuildScene();
      return;
    }
    if (typeof apply.ez === 'number') this.ez = apply.ez;
    if (typeof apply.bField === 'number') this.bField = apply.bField;
    if (typeof apply.circular === 'boolean') this.circularPol = apply.circular;
    if (typeof apply.freq === 'number') this.faradayFreq = apply.freq;
    if (this.chapterId === 'em-lorentz') {
      this.resetLorentzParticle();
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
    this.testCharges = [];
    this.dipoleArrowGrid = [];
    this.lorentzBColumns = [];
    this.lorentzTrailPts = [];
    this.dipolePosMesh = null;
    this.dipoleNegMesh = null;
    this.testChargeMesh = null;
    this.dipoleArrowShafts = null;
    this.dipoleArrowHeads = null;
    this.lorentzMesh = null;
    this.lorentzTrail = null;
    this.lorentzVelArrow = null;
    this.lorentzForceArrow = null;
    this.lorentzEArrows = null;
    this.emEArrowShafts = null;
    this.emEArrowHeads = null;
    this.emBArrowShafts = null;
    this.emBArrowHeads = null;
    this.emPoyntingArrows = null;
    this.emERibbon = null;
    this.emBRibbon = null;
    this.emWaveBox = null;
    this.faradayElectronMesh = null;
    this.faradayBulbMat = null;
    this.faradayBulbGlowMat = null;
    this.hallCarrierMesh = null;
    this.hallFrontPlateMat = null;
    this.hallBackPlateMat = null;
    this.hallBArrowShafts = null;
    this.hallBArrowHeads = null;
    this.hallEArrowShafts = null;
    this.hallEArrowHeads = null;
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;

    if (this.chapterId === 'em-dipole') this.buildDipoleScene();
    else if (this.chapterId === 'em-lorentz') this.buildLorentzScene();
    else if (this.chapterId === 'em-wave') this.buildEmWaveScene();
    else if (this.chapterId === 'em-faraday') this.buildFaradayScene();
    else this.buildHallScene();
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  // ---------------- 1. DIPOLE ----------------
  private buildDipoleScene(): void {
    const half = this.separation * 0.5;
    const q = this.chargeMag * this.polarity;
    this.dipoleCharges = [
      { x: -half, y: 0, z: 0, q: +q },
      { x: +half, y: 0, z: 0, q: -q },
    ];

    const sphereGeom = this.track(new THREE.SphereGeometry(0.75, 28, 28));
    const posMat = this.track(
      new THREE.MeshStandardMaterial({
        color: q > 0 ? 0xef4444 : 0x3b82f6,
        emissive: q > 0 ? 0xdc2626 : 0x2563eb,
        emissiveIntensity: 0.75,
        roughness: 0.2,
      }),
    );
    const negMat = this.track(
      new THREE.MeshStandardMaterial({
        color: q > 0 ? 0x3b82f6 : 0xef4444,
        emissive: q > 0 ? 0x2563eb : 0xdc2626,
        emissiveIntensity: 0.75,
        roughness: 0.2,
      }),
    );

    this.dipolePosMesh = new THREE.Mesh(sphereGeom, posMat);
    this.dipolePosMesh.position.set(-half, 0, 0);
    this.attachStudy(this.dipolePosMesh, {
      key: 'pos-charge',
      title: q > 0 ? 'Positive Source Charge (+q)' : 'Negative Sink Charge (−q)',
      badge: 'SOURCE / SINK',
      accent: q > 0 ? '#ef4444' : '#3b82f6',
      simple: 'Electric field lines burst radially outward from positive charges and terminate on negative charges.',
      deeper: 'By Gauss’s Law ∇·E = ρ/ε₀, point charges act as divergence sources/sinks of the electrostatic field.',
    });
    this.group.add(this.dipolePosMesh);
    void attachModel(this.dipolePosMesh, 'charge_emitter');

    const haloPos = new THREE.Sprite(
      this.track(
        new THREE.SpriteMaterial({
          map: createRadialGlowTexture(
            q > 0 ? 'rgba(248,113,113,0.9)' : 'rgba(96,165,250,0.9)',
            'rgba(0,0,0,0)',
          ),
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    haloPos.scale.set(3.8, 3.8, 1);
    this.dipolePosMesh.add(haloPos);

    this.dipoleNegMesh = new THREE.Mesh(sphereGeom, negMat);
    this.dipoleNegMesh.position.set(+half, 0, 0);
    this.attachStudy(this.dipoleNegMesh, {
      key: 'neg-charge',
      title: q > 0 ? 'Negative Sink Charge (−q)' : 'Positive Source Charge (+q)',
      badge: 'DIPOLE POLE',
      accent: q > 0 ? '#3b82f6' : '#ef4444',
      simple: 'Together with the opposite pole, this charge bends space with curved electric field paths.',
      deeper: 'Dipole electric field falls off asymptotically as 1/r³ far from the charge pair.',
    });
    this.group.add(this.dipoleNegMesh);
    void attachModel(this.dipoleNegMesh, 'charge_emitter');

    const haloNeg = new THREE.Sprite(
      this.track(
        new THREE.SpriteMaterial({
          map: createRadialGlowTexture(
            q > 0 ? 'rgba(96,165,250,0.9)' : 'rgba(248,113,113,0.9)',
            'rgba(0,0,0,0)',
          ),
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    haloNeg.scale.set(3.8, 3.8, 1);
    this.dipoleNegMesh.add(haloNeg);

    // Build curved dipole field lines by RK2 tracing from positive pole
    this.dipoleLinesGroup = new THREE.Group();
    const sourcePole = this.dipoleCharges[q > 0 ? 0 : 1];
    const sinkPole = this.dipoleCharges[q > 0 ? 1 : 0];
    const lineMat = this.track(
      new THREE.LineBasicMaterial({
        color: 0xc084fc,
        transparent: true,
        opacity: 0.62,
      }),
    );

    const rings = [0.45, 0.9, 1.35];
    for (const theta of rings) {
      const phiCount = 6;
      for (let p = 0; p < phiCount; p++) {
        const phi = (2 * Math.PI * p) / phiCount;
        const pts: THREE.Vector3[] = [];
        let cur: Vec3Like = {
          x: sourcePole.x + 0.85 * Math.cos(theta),
          y: 0.85 * Math.sin(theta) * Math.cos(phi),
          z: 0.85 * Math.sin(theta) * Math.sin(phi),
        };
        const dirSign = 1;
        for (let step = 0; step < 85; step++) {
          pts.push(new THREE.Vector3(cur.x, cur.y, cur.z));
          const e = computeElectricField(cur, this.dipoleCharges);
          const mag = Math.hypot(e.x, e.y, e.z);
          if (mag < 0.02) break;
          const ds = 0.26 * dirSign;
          cur = {
            x: cur.x + (e.x / mag) * ds,
            y: cur.y + (e.y / mag) * ds,
            z: cur.z + (e.z / mag) * ds,
          };
          const dSink = Math.hypot(cur.x - sinkPole.x, cur.y - sinkPole.y, cur.z - sinkPole.z);
          if (dSink < 0.82 || Math.hypot(cur.x, cur.y, cur.z) > 15) {
            pts.push(new THREE.Vector3(cur.x, cur.y, cur.z));
            break;
          }
        }
        const geom = this.track(new THREE.BufferGeometry().setFromPoints(pts));
        this.dipoleLinesGroup.add(new THREE.Line(geom, lineMat));
      }
    }
    this.dipoleLinesGroup.visible = this.showFieldLines;
    this.group.add(this.dipoleLinesGroup);

    // 3D Vector arrow grid
    const gridPts: Vec3Like[] = [];
    for (let x = -9; x <= 9; x += 3) {
      for (let y = -3; y <= 3; y += 3) {
        for (let z = -6; z <= 6; z += 3) {
          const d0 = Math.hypot(x - this.dipoleCharges[0].x, y, z);
          const d1 = Math.hypot(x - this.dipoleCharges[1].x, y, z);
          if (d0 < 1.3 || d1 < 1.3) continue;
          gridPts.push({ x, y, z });
        }
      }
    }
    this.dipoleArrowGrid = gridPts;

    const shaftG = this.track(new THREE.CylinderGeometry(0.032, 0.032, 1, 8));
    shaftG.rotateX(Math.PI * 0.5);
    shaftG.translate(0, 0, 0.5);
    const headG = this.track(new THREE.ConeGeometry(0.095, 0.25, 10));
    headG.rotateX(Math.PI * 0.5);
    const arrowMat = this.track(new THREE.MeshBasicMaterial({ color: 0xa855f7 }));

    this.dipoleArrowShafts = new THREE.InstancedMesh(shaftG, arrowMat, gridPts.length);
    this.dipoleArrowHeads = new THREE.InstancedMesh(headG, arrowMat, gridPts.length);
    this.updateDipoleVectors();
    this.group.add(this.dipoleArrowShafts, this.dipoleArrowHeads);

    // Invisible hover plane for sampling E-field anywhere in XZ
    const hoverPlane = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(24, 16)),
      this.track(new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })),
    );
    hoverPlane.rotation.x = -Math.PI * 0.5;
    this.attachStudy(hoverPlane, {
      key: 'dipole-space',
      title: 'Electrostatic Vector Field E(r)',
      badge: 'FIELD SAMPLER',
      accent: '#a855f7',
      simple: 'At every point in empty space, the field points in the direction a tiny positive test charge would be pushed.',
      deeper: 'Superposition principle: E_total(r) = E_+(r) + E_−(r), satisfying ∇×E = 0.',
    });
    this.group.add(hoverPlane);

    // Test charges pool (8 probes)
    const tcGeom = this.track(new THREE.SphereGeometry(0.24, 14, 14));
    const tcMat = this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    this.testChargeMesh = new THREE.InstancedMesh(tcGeom, tcMat, 8);
    this.testChargeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.testChargeMesh.frustumCulled = false;
    this.attachStudy(this.testChargeMesh, {
      key: 'test-charge',
      title: 'Positive Test Charge (+q₀)',
      badge: 'FIELD SURFER',
      accent: '#00f0ff',
      simple: 'A tiny positive probe released into the dipole field—accelerating away from (+) and pulled into (−).',
      deeper: 'Follows F = q₀ E(r) using symplectic integration.',
    });
    this.group.add(this.testChargeMesh);

    this.testCharges = Array.from({ length: 8 }, () => ({
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      active: false,
    }));
    this.spawnTestCharge();
  }

  private spawnTestCharge(): void {
    const slot = this.testCharges.find((t) => !t.active) ?? this.testCharges[0];
    const q = this.chargeMag * this.polarity;
    const srcX = q > 0 ? -this.separation * 0.5 : this.separation * 0.5;
    const angle = (Math.random() - 0.5) * 1.8;
    const phi = (Math.random() - 0.5) * 1.4;
    slot.pos = {
      x: srcX + (q > 0 ? 1.15 : -1.15) * Math.cos(angle),
      y: 1.3 * Math.sin(angle) * Math.cos(phi),
      z: 1.3 * Math.sin(angle) * Math.sin(phi),
    };
    slot.vel = { x: 0, y: 0, z: 0 };
    slot.active = true;
  }

  private updateDipoleVectors(): void {
    if (!this.dipoleArrowShafts || !this.dipoleArrowHeads) return;
    const vis = this.showVectors;
    this.dipoleArrowShafts.visible = vis;
    this.dipoleArrowHeads.visible = vis;
    if (!vis) return;

    const col = new THREE.Color();
    for (let i = 0; i < this.dipoleArrowGrid.length; i++) {
      const p = this.dipoleArrowGrid[i];
      const e = computeElectricField(p, this.dipoleCharges);
      const mag = Math.hypot(e.x, e.y, e.z);
      if (mag < 1e-4) continue;
      this.tmpDir.set(e.x / mag, e.y / mag, e.z / mag);
      this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);

      const len = Math.min(1.65, 0.35 + Math.log10(1 + mag * 1.5) * 0.72);
      this.tmpPos.set(p.x, p.y, p.z).addScaledVector(this.tmpDir, -len * 0.5);
      this.tmpScale.set(1, 1, len);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.dipoleArrowShafts.setMatrixAt(i, this.tmpMat);

      this.tmpPos.addScaledVector(this.tmpDir, len + 0.08);
      this.tmpScale.set(1, 1, 1);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.dipoleArrowHeads.setMatrixAt(i, this.tmpMat);

      const t = Math.min(1, mag / 12);
      col.setHex(0xa855f7).lerp(new THREE.Color(0xec4899), t);
      this.dipoleArrowShafts.setColorAt(i, col);
      this.dipoleArrowHeads.setColorAt(i, col);
    }
    this.dipoleArrowShafts.instanceMatrix.needsUpdate = true;
    this.dipoleArrowHeads.instanceMatrix.needsUpdate = true;
    if (this.dipoleArrowShafts.instanceColor) this.dipoleArrowShafts.instanceColor.needsUpdate = true;
    if (this.dipoleArrowHeads.instanceColor) this.dipoleArrowHeads.instanceColor.needsUpdate = true;
  }

  // ---------------- 2. LORENTZ HELIX ----------------
  private resetLorentzParticle(): void {
    const r0 = Math.max(1.2, this.launchSpeed / Math.max(0.4, this.bField));
    this.lorentzPos = { x: Math.min(6, r0), y: -4.2, z: 0 };
    this.lorentzVel = { x: 0, y: 1.8, z: this.launchSpeed * this.qSign };
    this.lorentzTrailPts = [];
  }

  private buildLorentzScene(): void {
    this.resetLorentzParticle();

    // Vertical magnetic flux columns B = (0, +B, 0)
    const colGeom = this.track(new THREE.CylinderGeometry(0.06, 0.06, 12, 10));
    const colMat = this.track(
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 }),
    );
    for (let x = -6; x <= 6; x += 3) {
      for (let z = -6; z <= 6; z += 3) {
        const m = new THREE.Mesh(colGeom, colMat);
        m.position.set(x, 0, z);
        this.attachStudy(m, {
          key: 'b-flux-col',
          title: 'Uniform Magnetic Field B (+Y)',
          badge: 'MAGNETIC FLUX',
          accent: '#38bdf8',
          simple: 'Vertical magnetic lines steer moving charges sideways into circular cyclotron orbits without changing their speed!',
          deeper: 'Cyclotron radius r_c = mv_⊥ / (|q|B) and angular frequency ω_c = |q|B / m.',
        });
        this.group.add(m);
        this.lorentzBColumns.push(m);
      }
    }

    // E_y field indicator arrows
    const arrowG = this.track(new THREE.ConeGeometry(0.16, 0.55, 10));
    const arrowM = this.track(new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.75 }));
    this.lorentzEArrows = new THREE.InstancedMesh(arrowG, arrowM, 9);
    let idx = 0;
    for (let x = -5; x <= 5; x += 5) {
      for (let z = -5; z <= 5; z += 5) {
        this.tmpPos.set(x, 0, z);
        this.tmpQuat.identity();
        this.tmpScale.set(1, 1, 1);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.lorentzEArrows.setMatrixAt(idx++, this.tmpMat);
      }
    }
    this.group.add(this.lorentzEArrows);

    // Spiraling charged particle
    const pMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.38, 22, 22)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0x00f0ff,
          emissive: 0x00f0ff,
          emissiveIntensity: 0.9,
        }),
      ),
    );
    this.attachStudy(pMesh, {
      key: 'lorentz-charge',
      title: 'Spiraling Charge (Boris Pusher)',
      badge: 'LORENTZ FORCE',
      accent: '#00f0ff',
      simple: 'A charged particle feeling both vertical electric acceleration (E_y) and sideways magnetic curling (v × B).',
      deeper: 'Integrated via the energy-conserving Boris algorithm: F = q(E + v × B).',
    });
    this.lorentzMesh = pMesh;
    this.group.add(pMesh);

    const trailGeom = this.track(new THREE.BufferGeometry());
    trailGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3),
    );
    this.lorentzTrail = new THREE.Line(
      trailGeom,
      this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 })),
    );
    this.lorentzTrail.frustumCulled = false;
    this.group.add(this.lorentzTrail);

    this.lorentzVelArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(),
      1.8,
      0x00f0ff,
      0.35,
      0.2,
    );
    this.lorentzForceArrow = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(),
      1.8,
      0xfbbf24,
      0.35,
      0.2,
    );
    this.group.add(this.lorentzVelArrow, this.lorentzForceArrow);
  }

  // ---------------- 3. EM WAVE ----------------
  private buildEmWaveScene(): void {
    const count = 48;
    const shaftG = this.track(new THREE.CylinderGeometry(0.036, 0.036, 1, 8));
    shaftG.translate(0, 0.5, 0);
    const headG = this.track(new THREE.ConeGeometry(0.11, 0.28, 10));

    const eMat = this.track(new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
    const bMat = this.track(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));

    this.emEArrowShafts = new THREE.InstancedMesh(shaftG, eMat, count);
    this.emEArrowHeads = new THREE.InstancedMesh(headG, eMat, count);
    this.emBArrowShafts = new THREE.InstancedMesh(shaftG, bMat, count);
    this.emBArrowHeads = new THREE.InstancedMesh(headG, bMat, count);
    this.group.add(this.emEArrowShafts, this.emEArrowHeads, this.emBArrowShafts, this.emBArrowHeads);

    const poyntMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    const poyntG = this.track(new THREE.ConeGeometry(0.18, 0.55, 12));
    poyntG.rotateZ(-Math.PI * 0.5);
    this.emPoyntingArrows = new THREE.InstancedMesh(poyntG, poyntMat, 6);
    this.group.add(this.emPoyntingArrows);

    const eLineG = this.track(new THREE.BufferGeometry());
    eLineG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    this.emERibbon = new THREE.Line(
      eLineG,
      this.track(new THREE.LineBasicMaterial({ color: 0xec4899 })),
    );

    const bLineG = this.track(new THREE.BufferGeometry());
    bLineG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    this.emBRibbon = new THREE.Line(
      bLineG,
      this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff })),
    );
    this.group.add(this.emERibbon, this.emBRibbon);

    // Axis spine
    const axisG = this.track(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-12, 0, 0), new THREE.Vector3(12, 0, 0)]),
    );
    this.group.add(
      new THREE.Line(axisG, this.track(new THREE.LineBasicMaterial({ color: 0x475569 }))),
    );

    // Raycast proxy box for hovering along the EM wave
    this.emWaveBox = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(24, 7, 7)),
      this.track(new THREE.MeshBasicMaterial({ visible: false })),
    );
    this.attachStudy(this.emWaveBox, {
      key: 'em-wave-body',
      title: 'Transverse Electromagnetic Wave',
      badge: 'LIGHT & MAXWELL',
      accent: '#ec4899',
      simple: 'Electric (purple) and Magnetic (blue) waves vibrate at 90° to each other while carrying energy forward along gold arrows!',
      deeper: 'Vacuum wave equation solution with E ⊥ B ⊥ k and energy flux Poynting vector S = (1/μ₀) E × B.',
    });
    this.group.add(this.emWaveBox);
  }

  // ---------------- 4. FARADAY COIL ----------------
  private buildFaradayScene(): void {
    // Copper helical coil around Z axis from z = -3 to +3
    const pts: THREE.Vector3[] = [];
    const totalPts = 220;
    const turns = Math.round(this.coilTurns);
    for (let i = 0; i <= totalPts; i++) {
      const u = i / totalPts;
      const z = -2.8 + u * 5.6;
      const ang = 2 * Math.PI * turns * u;
      pts.push(new THREE.Vector3(2.4 * Math.cos(ang), 2.4 * Math.sin(ang), z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const coilGeom = this.track(new THREE.TubeGeometry(curve, 200, 0.14, 10, false));
    const coilMesh = new THREE.Mesh(
      coilGeom,
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0xd97706,
          emissive: 0x78350f,
          emissiveIntensity: 0.35,
          metalness: 0.78,
          roughness: 0.28,
        }),
      ),
    );
    this.attachStudy(coilMesh, {
      key: 'faraday-coil',
      title: 'Copper Solenoid Coil',
      badge: 'INDUCED EMF',
      accent: '#d97706',
      simple: 'Each loop captures changing magnetic flux as the magnet plunges through, pushing electrons around the circuit.',
      deeper: 'Faraday-Lenz Law: ε = −N dΦ_B/dt drives current opposing the magnet’s flux change.',
    });
    this.group.add(coilMesh);

    // Circulating conduction electrons along the coil
    const eG = this.track(new THREE.SphereGeometry(0.11, 8, 8));
    const eM = this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    this.faradayElectronMesh = new THREE.InstancedMesh(eG, eM, FARADAY_ELECTRONS);
    this.faradayElectronMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < FARADAY_ELECTRONS; i++) {
      this.faradayTheta[i] = i / FARADAY_ELECTRONS;
    }
    this.group.add(this.faradayElectronMesh);

    // Plunging bar magnet (North crimson + South cobalt)
    this.magnetGroup = new THREE.Group();
    const halfMagG = this.track(new THREE.BoxGeometry(1.15, 1.15, 2.2));
    const northM = new THREE.Mesh(
      halfMagG,
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0x991b1b,
          emissiveIntensity: 0.5,
        }),
      ),
    );
    northM.position.z = 1.1;
    this.attachStudy(northM, {
      key: 'bar-magnet',
      title: 'Oscillating Bar Magnet (N / S)',
      badge: 'MAGNETIC DIPOLE',
      accent: '#ef4444',
      simple: 'A moving magnet changes the magnetic flux inside the coil—no motion means zero induced voltage!',
      deeper: 'Peak EMF occurs at z = 0 where |dz/dt| is maximum, even though Φ(0) is extremal? Wait: dΦ/dt = (dΦ/dz)(dz/dt) peaks near the coil mouths!',
    });

    const southM = new THREE.Mesh(
      halfMagG,
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          emissive: 0x1e3a8a,
          emissiveIntensity: 0.5,
        }),
      ),
    );
    southM.position.z = -1.1;
    this.attachStudy(southM, northM.userData.study as StudyMeta);
    this.magnetGroup.add(northM, southM);
    void attachModel(northM, 'magnet_pole', { fit: 'stretch' });
    void attachModel(southM, 'magnet_pole', { fit: 'stretch' });
    this.group.add(this.magnetGroup);

    // Indicator Bulb perched above coil
    this.faradayBulbMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.1,
        roughness: 0.25,
      }),
    );
    const bulb = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.85, 22, 22)), this.faradayBulbMat);
    bulb.position.set(0, 4.4, 0);
    this.attachStudy(bulb, {
      key: 'faraday-bulb',
      title: 'Induced Current Indicator Lamp',
      badge: 'GENERATOR OUTPUT',
      accent: '#fbbf24',
      simple: 'Glows bright golden whenever induced voltage drives current through the coil!',
      deeper: 'Instantaneous brightness scales with dissipated power P(t) = ε(t)² / R_load.',
    });
    this.group.add(bulb);
    void attachModel(bulb, 'incandescent_bulb', { fit: 'y', scale: 1.25 });

    this.faradayBulbGlowMat = this.track(
      new THREE.SpriteMaterial({
        map: createRadialGlowTexture('rgba(253, 224, 71, 0.95)', 'rgba(245, 158, 11, 0.25)'),
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const bulbGlow = new THREE.Sprite(this.faradayBulbGlowMat);
    bulbGlow.scale.set(4.5, 4.5, 1);
    bulb.add(bulbGlow);
  }

  // ---------------- 5. HALL EFFECT SENSOR ----------------
  private buildHallScene(): void {
    this.hallBuildup = 0;

    // Translucent conductor strip (15 x 1.3 x 4.4)
    const barG = this.track(new THREE.BoxGeometry(15, 1.3, 4.4));
    const barM = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.24,
        roughness: 0.25,
        metalness: 0.25,
        depthWrite: false,
      }),
    );
    const barMesh = new THREE.Mesh(barG, barM);
    this.attachStudy(barMesh, {
      key: 'hall-bar',
      title: 'Hall Effect Conductor Slab',
      badge: 'HALL SENSOR',
      accent: '#06b6d4',
      simple:
        'Conventional current I enters from the left (+X). Perpendicular magnetic field B_y deflects moving carriers sideways until a transverse Hall voltage balances the push!',
      deeper:
        'Steady equilibrium: qE_H + q(v_d × B) = 0 yields Hall voltage V_H = (I B_y) / (n q t), directly measuring carrier sign & density.',
    });
    this.group.add(barMesh);

    const wireEdges = new THREE.LineSegments(
      this.track(new THREE.EdgesGeometry(barG)),
      this.track(new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.55 })),
    );
    this.group.add(wireEdges);

    // Sidewall charge buildup plates (+Z front, -Z back)
    const plateG = this.track(new THREE.BoxGeometry(14.8, 1.24, 0.12));
    this.hallFrontPlateMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.3,
        roughness: 0.3,
      }),
    );
    this.hallBackPlateMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.3,
        roughness: 0.3,
      }),
    );

    const wallStudy: StudyMeta = {
      key: 'hall-sidewalls',
      title: 'Transverse Surface Charge Walls (±σ_H)',
      badge: 'HALL POLARITY',
      accent: '#ec4899',
      simple:
        'Deflected charges pile up on the front wall and leave opposite charge on the back wall! Notice red (+) vs blue (−) swaps cleanly when switching Electrons ↔ Holes.',
      deeper:
        'Sign of V(+Z) − V(−Z) identifies whether majority charge carriers are negative electrons (n-type) or positive holes (p-type).',
    };
    const frontPlate = new THREE.Mesh(plateG, this.hallFrontPlateMat);
    frontPlate.position.set(0, 0, 2.25);
    this.attachStudy(frontPlate, wallStudy);

    const backPlate = new THREE.Mesh(plateG, this.hallBackPlateMat);
    backPlate.position.set(0, 0, -2.25);
    this.attachStudy(backPlate, wallStudy);
    this.group.add(frontPlate, backPlate);

    // Voltmeter probes connecting Front & Back sidewalls
    const probeStudy: StudyMeta = {
      key: 'hall-probe',
      title: 'Transverse Hall Voltmeter Probe',
      badge: 'SENSOR READOUT',
      accent: '#fbbf24',
      simple:
        'Measures the steady side-to-side voltage V_H = V(+Z) − V(−Z) created by charge separation inside the magnetic field.',
      deeper: 'Linear in magnetic flux density B_y and current I, making Hall sensors ideal for contactless magnetometers.',
    };
    const tipG = this.track(new THREE.SphereGeometry(0.24, 14, 14));
    const goldMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xb45309, emissiveIntensity: 0.65 }),
    );
    const tipFront = new THREE.Mesh(tipG, goldMat);
    tipFront.position.set(0, 0, 2.38);
    const tipBack = new THREE.Mesh(tipG, goldMat);
    tipBack.position.set(0, 0, -2.38);
    const meterHead = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(1.7, 0.72, 1.1)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: 0x0284c7,
          emissiveIntensity: 0.45,
          metalness: 0.5,
        }),
      ),
    );
    meterHead.position.set(0, 3.1, 0);
    this.attachStudy(tipFront, probeStudy);
    this.attachStudy(tipBack, probeStudy);
    this.attachStudy(meterHead, probeStudy);
    void attachModel(tipFront, 'probe_tip');
    void attachModel(tipBack, 'probe_tip', { rotation: [0, Math.PI, 0] });
    void attachModel(meterHead, 'hall_voltmeter');

    const leadG = this.track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 2.38),
        new THREE.Vector3(0, 3.1, 0.55),
        new THREE.Vector3(0, 3.1, -0.55),
        new THREE.Vector3(0, 0, -2.38),
      ]),
    );
    const leadLine = new THREE.Line(
      leadG,
      this.track(new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 })),
    );
    this.group.add(tipFront, tipBack, meterHead, leadLine);

    // 15 vertical B_y arrows (5 x 3)
    const bShaftG = this.track(new THREE.CylinderGeometry(0.036, 0.036, 4.1, 8));
    const bHeadG = this.track(new THREE.ConeGeometry(0.11, 0.3, 10));
    const bMat = this.track(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72 }));
    this.hallBArrowShafts = new THREE.InstancedMesh(bShaftG, bMat, 15);
    this.hallBArrowHeads = new THREE.InstancedMesh(bHeadG, bMat, 15);
    this.group.add(this.hallBArrowShafts, this.hallBArrowHeads);

    // 12 transverse E_H arrows (4 x 3) inside bar
    const eShaftG = this.track(new THREE.CylinderGeometry(0.035, 0.035, 1, 8));
    eShaftG.rotateX(Math.PI * 0.5);
    eShaftG.translate(0, 0, 0.5);
    const eHeadG = this.track(new THREE.ConeGeometry(0.11, 0.28, 10));
    eHeadG.rotateX(Math.PI * 0.5);
    const eMat = this.track(new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
    this.hallEArrowShafts = new THREE.InstancedMesh(eShaftG, eMat, 12);
    this.hallEArrowHeads = new THREE.InstancedMesh(eHeadG, eMat, 12);
    this.group.add(this.hallEArrowShafts, this.hallEArrowHeads);

    // 160 instanced charge carriers
    const cGeom = this.track(new THREE.SphereGeometry(0.11, 10, 10));
    const isHoles = this.hallCarrierSign > 0;
    const cMat = this.track(
      new THREE.MeshBasicMaterial({ color: isHoles ? 0xfb7185 : 0x00f0ff }),
    );
    this.hallCarrierMesh = new THREE.InstancedMesh(cGeom, cMat, HALL_CARRIERS);
    this.hallCarrierMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.hallCarrierMesh.frustumCulled = false;
    this.attachStudy(this.hallCarrierMesh, {
      key: 'hall-carriers',
      title: isHoles ? 'Positive Charge Carriers (+q Holes)' : 'Conduction Electrons (−q)',
      badge: isHoles ? 'P-TYPE CARRIER' : 'N-TYPE CARRIER',
      accent: isHoles ? '#fb7185' : '#00f0ff',
      simple: isHoles
        ? 'Positive holes drift along +I and get deflected by v × B to the front wall—charging it POSITIVE!'
        : 'Electrons drift opposite to current I (−X), yet magnetic force (−e)(v × B) bends them to the SAME front wall—charging it NEGATIVE!',
      deeper: 'F_mag = q(v_d × B) pushes both electrons & holes toward the same edge, so sidewall sign flips with carrier sign!',
    });

    for (let i = 0; i < HALL_CARRIERS; i++) {
      this.hallCarrierCoords[i * 3] = -7.3 + Math.random() * 14.6;
      this.hallCarrierCoords[i * 3 + 1] = (Math.random() - 0.5) * 0.96;
      this.hallCarrierCoords[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
    }
    this.group.add(this.hallCarrierMesh);

    this.updateHallVisuals();
  }

  private updateHallVisuals(): void {
    const eq = evaluateHallEquilibrium(this.hallCurrent, this.hallB, this.hallCarrierSign);
    const active = Math.min(1, this.hallBuildup);

    // Update sidewall plates tint & glow
    if (this.hallFrontPlateMat && this.hallBackPlateMat) {
      const vAbs = Math.abs(eq.hallVoltage);
      if (vAbs < 0.05) {
        this.hallFrontPlateMat.color.setHex(0x475569);
        this.hallFrontPlateMat.emissive.setHex(0x1e293b);
        this.hallFrontPlateMat.emissiveIntensity = 0.05;
        this.hallFrontPlateMat.opacity = 0.18;
        this.hallBackPlateMat.color.setHex(0x475569);
        this.hallBackPlateMat.emissive.setHex(0x1e293b);
        this.hallBackPlateMat.emissiveIntensity = 0.05;
        this.hallBackPlateMat.opacity = 0.18;
      } else {
        const frontPos = eq.hallVoltage >= 0;
        const posHex = 0xef4444;
        const posEmiss = 0xdc2626;
        const negHex = 0x3b82f6;
        const negEmiss = 0x2563eb;
        const strength = active * Math.min(1, vAbs / 3.5);

        this.hallFrontPlateMat.color.setHex(frontPos ? posHex : negHex);
        this.hallFrontPlateMat.emissive.setHex(frontPos ? posEmiss : negEmiss);
        this.hallFrontPlateMat.emissiveIntensity = 0.1 + strength * 0.9;
        this.hallFrontPlateMat.opacity = 0.22 + strength * 0.48;

        this.hallBackPlateMat.color.setHex(frontPos ? negHex : posHex);
        this.hallBackPlateMat.emissive.setHex(frontPos ? negEmiss : posEmiss);
        this.hallBackPlateMat.emissiveIntensity = 0.1 + strength * 0.9;
        this.hallBackPlateMat.opacity = 0.22 + strength * 0.48;
      }
    }

    // Orient vertical B_y arrows (5 x 3)
    if (this.hallBArrowShafts && this.hallBArrowHeads) {
      const showB = Math.abs(this.hallB) > 0.05;
      this.hallBArrowShafts.visible = showB;
      this.hallBArrowHeads.visible = showB;
      if (showB) {
        const bSign = this.hallB >= 0 ? 1 : -1;
        const bScale = 0.55 + Math.min(1.1, Math.abs(this.hallB) / 2.5) * 0.55;
        let idx = 0;
        for (let ix = -5; ix <= 5; ix += 2.5) {
          for (let iz = -1.4; iz <= 1.4; iz += 1.4) {
            this.tmpPos.set(ix, 0, iz);
            this.tmpQuat.setFromAxisAngle(this.zAxis, bSign > 0 ? 0 : Math.PI);
            this.tmpScale.set(1, bScale, 1);
            this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
            this.hallBArrowShafts.setMatrixAt(idx, this.tmpMat);

            this.tmpPos.set(ix, bSign * 2.08 * bScale, iz);
            this.tmpScale.set(1, 1, 1);
            this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
            this.hallBArrowHeads.setMatrixAt(idx, this.tmpMat);
            idx++;
          }
        }
        this.hallBArrowShafts.instanceMatrix.needsUpdate = true;
        this.hallBArrowHeads.instanceMatrix.needsUpdate = true;
      }
    }

    // Orient transverse E_H arrows (4 x 3)
    if (this.hallEArrowShafts && this.hallEArrowHeads) {
      const eAbs = Math.abs(eq.hallFieldZ);
      const showE = this.hallShowE && eAbs > 0.04 && active > 0.04;
      this.hallEArrowShafts.visible = showE;
      this.hallEArrowHeads.visible = showE;
      if (showE) {
        const eDir = eq.hallFieldZ >= 0 ? 1 : -1;
        const len = Math.min(1.45, (0.28 + eAbs * 0.85) * active);
        this.tmpDir.set(0, 0, eDir);
        this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);

        let idx = 0;
        for (const ix of [-4.5, -1.5, 1.5, 4.5]) {
          for (const iz of [-1.15, 0, 1.15]) {
            this.tmpPos.set(ix, 0, iz).addScaledVector(this.tmpDir, -len * 0.5);
            this.tmpScale.set(1, 1, len);
            this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
            this.hallEArrowShafts.setMatrixAt(idx, this.tmpMat);

            this.tmpPos.addScaledVector(this.tmpDir, len + 0.08);
            this.tmpScale.set(1, 1, 1);
            this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
            this.hallEArrowHeads.setMatrixAt(idx, this.tmpMat);
            idx++;
          }
        }
        this.hallEArrowShafts.instanceMatrix.needsUpdate = true;
        this.hallEArrowHeads.instanceMatrix.needsUpdate = true;
      }
    }
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'em-dipole') {
      if (this.testChargeMesh) {
        const substeps = 4;
        const h = Math.min(dt, 0.04) / substeps;
        for (let idx = 0; idx < this.testCharges.length; idx++) {
          const tc = this.testCharges[idx];
          if (!tc.active) {
            this.tmpScale.set(0, 0, 0);
            this.tmpMat.compose(this.tmpPos.set(0, 0, 0), this.tmpQuat.identity(), this.tmpScale);
            this.testChargeMesh.setMatrixAt(idx, this.tmpMat);
            continue;
          }
          for (let s = 0; s < substeps; s++) {
            const e = computeElectricField(tc.pos, this.dipoleCharges);
            tc.vel.x += e.x * h * 1.4;
            tc.vel.y += e.y * h * 1.4;
            tc.vel.z += e.z * h * 1.4;
            // Mild damping so probe surfs field lines smoothly
            tc.vel.x *= 0.985;
            tc.vel.y *= 0.985;
            tc.vel.z *= 0.985;
            tc.pos.x += tc.vel.x * h;
            tc.pos.y += tc.vel.y * h;
            tc.pos.z += tc.vel.z * h;

            const q = this.chargeMag * this.polarity;
            const sink = this.dipoleCharges[q > 0 ? 1 : 0];
            if (
              Math.hypot(tc.pos.x - sink.x, tc.pos.y, tc.pos.z) < 0.85 ||
              Math.hypot(tc.pos.x, tc.pos.y, tc.pos.z) > 15
            ) {
              this.spawnTestCharge();
              break;
            }
          }
          this.tmpPos.set(tc.pos.x, tc.pos.y, tc.pos.z);
          this.tmpScale.set(1, 1, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat.identity(), this.tmpScale);
          this.testChargeMesh.setMatrixAt(idx, this.tmpMat);
        }
        this.testChargeMesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    if (this.chapterId === 'em-lorentz') {
      const substeps = 6;
      const h = Math.min(dt, 0.04) / substeps;
      const E = { x: 0, y: this.ez, z: 0 };
      const B = { x: 0, y: this.bField, z: 0 };
      for (let s = 0; s < substeps; s++) {
        stepBorisLorentz(this.lorentzPos, this.lorentzVel, E, B, this.qSign, h);
        if (Math.abs(this.lorentzPos.y) > 8.5 || Math.hypot(this.lorentzPos.x, this.lorentzPos.z) > 14) {
          this.resetLorentzParticle();
          break;
        }
      }

      if (this.lorentzMesh) {
        this.lorentzMesh.position.set(this.lorentzPos.x, this.lorentzPos.y, this.lorentzPos.z);
      }
      if (this.lorentzEArrows) {
        this.lorentzEArrows.visible = Math.abs(this.ez) > 0.05;
        if (this.lorentzEArrows.visible) {
          const dir = this.ez >= 0 ? 1 : -1;
          let idx = 0;
          for (let x = -5; x <= 5; x += 5) {
            for (let z = -5; z <= 5; z += 5) {
              this.tmpPos.set(x, 0, z);
              this.tmpQuat.setFromAxisAngle(this.zAxis, dir > 0 ? 0 : Math.PI);
              this.tmpScale.set(1, Math.min(2, Math.abs(this.ez) + 0.4), 1);
              this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
              this.lorentzEArrows.setMatrixAt(idx++, this.tmpMat);
            }
          }
          this.lorentzEArrows.instanceMatrix.needsUpdate = true;
        }
      }

      if (this.lorentzTrail) {
        this.lorentzTrailPts.push(new THREE.Vector3(this.lorentzPos.x, this.lorentzPos.y, this.lorentzPos.z));
        if (this.lorentzTrailPts.length > TRAIL_LEN) this.lorentzTrailPts.shift();
        const attr = this.lorentzTrail.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const last = this.lorentzTrailPts[this.lorentzTrailPts.length - 1] ?? new THREE.Vector3();
        for (let i = 0; i < TRAIL_LEN; i++) {
          const pt = this.lorentzTrailPts[i] ?? last;
          arr[i * 3] = pt.x;
          arr[i * 3 + 1] = pt.y;
          arr[i * 3 + 2] = pt.z;
        }
        attr.needsUpdate = true;
      }

      if (this.lorentzVelArrow && this.lorentzForceArrow) {
        const p = new THREE.Vector3(this.lorentzPos.x, this.lorentzPos.y, this.lorentzPos.z);
        const v = new THREE.Vector3(this.lorentzVel.x, this.lorentzVel.y, this.lorentzVel.z);
        const vLen = v.length();
        if (vLen > 1e-4) {
          this.lorentzVelArrow.position.copy(p);
          this.lorentzVelArrow.setDirection(v.clone().divideScalar(vLen));
          this.lorentzVelArrow.setLength(Math.min(3.0, 0.7 + vLen * 0.25), 0.35, 0.2);
        }
        // F_B = q (v x B)
        const fb = new THREE.Vector3(
          this.lorentzVel.z * this.bField * -this.qSign,
          0,
          this.lorentzVel.x * this.bField * this.qSign,
        );
        const fbLen = fb.length();
        this.lorentzForceArrow.visible = fbLen > 0.05;
        if (fbLen > 0.05) {
          this.lorentzForceArrow.position.copy(p);
          this.lorentzForceArrow.setDirection(fb.divideScalar(fbLen));
          this.lorentzForceArrow.setLength(Math.min(3.0, 0.6 + fbLen * 0.14), 0.35, 0.2);
        }
      }
      return;
    }

    if (this.chapterId === 'em-wave') {
      const count = 48;
      const eRibbonArr = (this.emERibbon?.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const bRibbonArr = (this.emBRibbon?.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;

      for (let i = 0; i < count; i++) {
        const x = -11.5 + (i / (count - 1)) * 23;
        const w = evaluateEmWave(x, this.simTime, this.waveFreq, this.wavelength, 2.8, this.circularPol);

        eRibbonArr[i * 3] = x;
        eRibbonArr[i * 3 + 1] = w.E.y;
        eRibbonArr[i * 3 + 2] = w.E.z;

        bRibbonArr[i * 3] = x;
        bRibbonArr[i * 3 + 1] = w.B.y;
        bRibbonArr[i * 3 + 2] = w.B.z;

        const eMag = Math.hypot(w.E.y, w.E.z);
        if (eMag > 0.04 && this.emEArrowShafts && this.emEArrowHeads) {
          this.tmpDir.set(0, w.E.y / eMag, w.E.z / eMag);
          this.tmpQuat.setFromUnitVectors(this.yAxis, this.tmpDir);
          this.tmpPos.set(x, 0, 0);
          this.tmpScale.set(1, eMag, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.emEArrowShafts.setMatrixAt(i, this.tmpMat);

          this.tmpPos.set(x, w.E.y, w.E.z);
          this.tmpScale.set(1, 1, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.emEArrowHeads.setMatrixAt(i, this.tmpMat);
        } else if (this.emEArrowShafts && this.emEArrowHeads) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpPos.set(x, 0, 0), this.tmpQuat.identity(), this.tmpScale);
          this.emEArrowShafts.setMatrixAt(i, this.tmpMat);
          this.emEArrowHeads.setMatrixAt(i, this.tmpMat);
        }

        const bMag = Math.hypot(w.B.y, w.B.z);
        if (bMag > 0.04 && this.emBArrowShafts && this.emBArrowHeads) {
          this.tmpDir.set(0, w.B.y / bMag, w.B.z / bMag);
          this.tmpQuat.setFromUnitVectors(this.yAxis, this.tmpDir);
          this.tmpPos.set(x, 0, 0);
          this.tmpScale.set(1, bMag, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.emBArrowShafts.setMatrixAt(i, this.tmpMat);

          this.tmpPos.set(x, w.B.y, w.B.z);
          this.tmpScale.set(1, 1, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.emBArrowHeads.setMatrixAt(i, this.tmpMat);
        } else if (this.emBArrowShafts && this.emBArrowHeads) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpPos.set(x, 0, 0), this.tmpQuat.identity(), this.tmpScale);
          this.emBArrowShafts.setMatrixAt(i, this.tmpMat);
          this.emBArrowHeads.setMatrixAt(i, this.tmpMat);
        }
      }

      if (this.emERibbon) (this.emERibbon.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      if (this.emBRibbon) (this.emBRibbon.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      if (this.emEArrowShafts) this.emEArrowShafts.instanceMatrix.needsUpdate = true;
      if (this.emEArrowHeads) this.emEArrowHeads.instanceMatrix.needsUpdate = true;
      if (this.emBArrowShafts) this.emBArrowShafts.instanceMatrix.needsUpdate = true;
      if (this.emBArrowHeads) this.emBArrowHeads.instanceMatrix.needsUpdate = true;

      if (this.emPoyntingArrows) {
        this.emPoyntingArrows.visible = this.showPoynting;
        const speed = (this.waveFreq * this.wavelength) % 24;
        for (let k = 0; k < 6; k++) {
          const px = -11 + (((k * 4 + this.simTime * (speed || 3)) % 22 + 22) % 22);
          this.tmpPos.set(px, 0, 0);
          this.tmpScale.set(1, 1, 1);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat.identity(), this.tmpScale);
          this.emPoyntingArrows.setMatrixAt(k, this.tmpMat);
        }
        this.emPoyntingArrows.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    if (this.chapterId === 'em-faraday') {
      // 4. Faraday Induction
      const far = evaluateFaradayCoil(this.simTime, this.faradayFreq, this.magnetAmp, this.coilTurns);
      this.lastFaradaySample = far;
      this.magnetGroup.position.z = far.magnetZ;

      if (this.faradayElectronMesh) {
        const driftRate = far.emf * 0.012;
        const turns = Math.round(this.coilTurns);
        this.tmpScale.set(1, 1, 1);
        this.tmpQuat.identity();
        for (let i = 0; i < FARADAY_ELECTRONS; i++) {
          this.faradayTheta[i] = ((this.faradayTheta[i] + driftRate * dt) % 1 + 1) % 1;
          const u = this.faradayTheta[i];
          const z = -2.8 + u * 5.6;
          const ang = 2 * Math.PI * turns * u;
          this.tmpPos.set(2.4 * Math.cos(ang), 2.4 * Math.sin(ang), z);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.faradayElectronMesh.setMatrixAt(i, this.tmpMat);
        }
        this.faradayElectronMesh.instanceMatrix.needsUpdate = true;
      }

      if (this.faradayBulbMat && this.faradayBulbGlowMat) {
        const powerGlow = Math.min(2.2, (far.emf * far.emf) / 90);
        this.faradayBulbMat.emissiveIntensity = 0.08 + powerGlow;
        this.faradayBulbGlowMat.opacity = Math.min(0.85, 0.05 + powerGlow * 0.4);
      }
      return;
    }

    // 5. Hall Effect Sensor
    this.hallBuildup = Math.min(1, this.hallBuildup + dt * 0.72);
    this.updateHallVisuals();

    if (this.hallCarrierMesh) {
      const eq = evaluateHallEquilibrium(this.hallCurrent, this.hallB, this.hallCarrierSign);
      const vx = eq.driftSpeed * 7.2;
      const transientCurve = (1 - this.hallBuildup) * Math.max(-1.6, Math.min(1.6, eq.magneticDeflectAccelZ * 1.4));
      const steadyShimmer = Math.sin(this.simTime * 3.5) * 0.02;

      this.tmpQuat.identity();
      this.tmpScale.set(1, 1, 1);
      for (let i = 0; i < HALL_CARRIERS; i++) {
        let x = this.hallCarrierCoords[i * 3] + vx * dt;
        if (x > 7.3) x -= 14.6;
        else if (x < -7.3) x += 14.6;
        this.hallCarrierCoords[i * 3] = x;

        const y = this.hallCarrierCoords[i * 3 + 1];
        const z0 = this.hallCarrierCoords[i * 3 + 2];
        const travel = vx >= 0 ? (x + 7.3) / 14.6 : (7.3 - x) / 14.6;
        const z = Math.max(-1.95, Math.min(1.95, z0 + transientCurve * travel * travel + steadyShimmer));
        this.tmpPos.set(x, y, z);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.hallCarrierMesh.setMatrixAt(i, this.tmpMat);
      }
      this.hallCarrierMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'em-dipole') {
      return {
        sliders: [
          {
            key: 'separation',
            label: 'Dipole Separation',
            min: 3,
            max: 12,
            step: 0.2,
            value: this.separation,
            unit: 'm',
            noteTitle: 'Dipole Spacing',
            noteText: 'Moves the (+) and (−) charges closer or farther apart.',
          },
          {
            key: 'chargeMag',
            label: 'Charge Magnitude |q|',
            min: 0.5,
            max: 3.0,
            step: 0.1,
            value: this.chargeMag,
            unit: 'μC',
            noteTitle: 'Charge Strength',
            noteText: 'Scales the strength of the Coulomb electric field everywhere.',
          },
        ],
        toggles: [
          {
            key: 'showFieldLines',
            label: 'Curved Field Lines',
            checked: this.showFieldLines,
            swatchColor: '#c084fc',
            noteTitle: 'Field Lines',
            noteText: 'Streamlines tangent to E(r) showing paths from (+) to (−).',
          },
          {
            key: 'showVectors',
            label: '3D Vector Lattice',
            checked: this.showVectors,
            swatchColor: '#ec4899',
            noteTitle: 'Vector Arrows',
            noteText: 'Shows exact field direction and strength across a 3D grid.',
          },
        ],
        actions: [
          { id: 'launchTestCharge', label: 'Drop Test Charge' },
          { id: 'flipPolarity', label: 'Flip Polarity' },
        ],
      };
    }

    if (this.chapterId === 'em-lorentz') {
      return {
        sliders: [
          {
            key: 'bField',
            label: 'Magnetic Field B_y',
            min: 0.3,
            max: 3.5,
            step: 0.1,
            value: this.bField,
            unit: 'T',
            noteTitle: 'Magnetic Flux Density',
            noteText: 'Stronger B tightens the spiral radius (r = mv / qB).',
          },
          {
            key: 'ez',
            label: 'Vertical E_y Field',
            min: -1.5,
            max: 1.5,
            step: 0.05,
            value: this.ez,
            unit: 'V/m',
            noteTitle: 'Electric Accelerator',
            noteText: 'Set to 0 for pure speed-conserving circles; nonzero stretches into a helix!',
          },
          {
            key: 'launchSpeed',
            label: 'Initial Speed v₀',
            min: 2.5,
            max: 10.0,
            step: 0.2,
            value: this.launchSpeed,
            unit: 'm/s',
            noteTitle: 'Entry Speed',
            noteText: 'Faster charges carve wider cyclotron circles.',
          },
        ],
        toggles: [
          {
            key: 'positiveQ',
            label: 'Positive Charge (+q)',
            checked: this.qSign > 0,
            swatchColor: '#00f0ff',
            noteTitle: 'Charge Polarity',
            noteText: 'Flip between +q and −q to reverse spiral handedness!',
          },
        ],
        actions: [{ id: 'relaunchLorentz', label: 'Relaunch Charge' }],
      };
    }

    if (this.chapterId === 'em-wave') {
      return {
        sliders: [
          {
            key: 'waveFreq',
            label: 'Wave Frequency f',
            min: 0.2,
            max: 2.5,
            step: 0.05,
            value: this.waveFreq,
            unit: 'Hz',
            noteTitle: 'Oscillation Frequency',
            noteText: 'Controls how fast E and B oscillate as the wave travels.',
          },
          {
            key: 'wavelength',
            label: 'Wavelength λ',
            min: 4.0,
            max: 14.0,
            step: 0.5,
            value: this.wavelength,
            unit: 'm',
            noteTitle: 'Spatial Wavelength',
            noteText: 'Distance between consecutive wave crests.',
          },
        ],
        toggles: [
          {
            key: 'circularPol',
            label: 'Circular Polarization',
            checked: this.circularPol,
            swatchColor: '#ec4899',
            noteTitle: 'Polarization Mode',
            noteText: 'Switch between flat Linear vibration and rotating Circular helix.',
          },
          {
            key: 'showPoynting',
            label: 'Poynting Flux Arrows (S)',
            checked: this.showPoynting,
            swatchColor: '#fbbf24',
            noteTitle: 'Energy Propagation',
            noteText: 'Gold arrows show energy traveling along E × B.',
          },
        ],
        actions: [],
      };
    }

    if (this.chapterId === 'em-faraday') {
      return {
        sliders: [
          {
            key: 'faradayFreq',
            label: 'Magnet Speed (f)',
            min: 0.0,
            max: 3.0,
            step: 0.05,
            value: this.faradayFreq,
            unit: 'Hz',
            noteTitle: 'Plunge Frequency',
            noteText: 'Faster magnet motion creates larger dΦ/dt and brighter lamp glow! Set to 0 Hz to see zero EMF.',
          },
          {
            key: 'coilTurns',
            label: 'Coil Loops (N)',
            min: 4,
            max: 14,
            step: 1,
            value: this.coilTurns,
            unit: 'turns',
            noteTitle: 'Solenoid Turns',
            noteText: 'Induced voltage multiplies linearly with the number of copper loops N.',
          },
          {
            key: 'magnetAmp',
            label: 'Stroke Amplitude',
            min: 2.0,
            max: 6.5,
            step: 0.2,
            value: this.magnetAmp,
            unit: 'm',
            noteTitle: 'Magnet Travel',
            noteText: 'How far the bar magnet sweeps through the coil.',
          },
        ],
        toggles: [],
        actions: [{ id: 'resetTime', label: 'Restart Cycle' }],
      };
    }

    return {
      sliders: [
        {
          key: 'hallCurrent',
          label: 'Current I (+X)',
          min: 0.0,
          max: 5.0,
          step: 0.2,
          value: this.hallCurrent,
          unit: 'A',
          noteTitle: 'Driving Current',
          noteText: 'Controls carrier drift speed through the slab along +X.',
        },
        {
          key: 'hallB',
          label: 'Magnetic Field B_y',
          min: -3.0,
          max: 3.0,
          step: 0.15,
          value: this.hallB,
          unit: 'T',
          noteTitle: 'Perpendicular Magnetic Field',
          noteText: 'Higher |B_y| creates stronger Lorentz sideways push and larger Hall voltage V_H.',
        },
      ],
      toggles: [
        {
          key: 'hallPositiveCarrier',
          label: 'p-Type Holes (+q Carriers)',
          checked: this.hallCarrierSign > 0,
          swatchColor: '#fb7185',
          noteTitle: 'Carrier Polarity',
          noteText: 'Toggle OFF for electrons (−q) or ON for positive holes (+q) — watch V_H flip sign!',
        },
        {
          key: 'hallShowE',
          label: 'Transverse E_H Arrows',
          checked: this.hallShowE,
          swatchColor: '#a855f7',
          noteTitle: 'Balancing Hall Field',
          noteText: 'Purple arrows inside the bar pushing carriers back against v × B.',
        },
      ],
      actions: [{ id: 'replayHall', label: 'Replay Charge Buildup' }],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'separation' && typeof value === 'number') {
      this.separation = value;
      this.rebuildScene();
    } else if (key === 'chargeMag' && typeof value === 'number') {
      this.chargeMag = value;
      this.rebuildScene();
    } else if (key === 'showFieldLines' && typeof value === 'boolean') {
      this.showFieldLines = value;
      this.dipoleLinesGroup.visible = value;
    } else if (key === 'showVectors' && typeof value === 'boolean') {
      this.showVectors = value;
      this.updateDipoleVectors();
    } else if (key === 'bField' && typeof value === 'number') {
      this.bField = value;
    } else if (key === 'ez' && typeof value === 'number') {
      this.ez = value;
    } else if (key === 'launchSpeed' && typeof value === 'number') {
      this.launchSpeed = value;
      this.resetLorentzParticle();
    } else if (key === 'positiveQ' && typeof value === 'boolean') {
      this.qSign = value ? 1 : -1;
      this.resetLorentzParticle();
    } else if (key === 'waveFreq' && typeof value === 'number') {
      this.waveFreq = value;
    } else if (key === 'wavelength' && typeof value === 'number') {
      this.wavelength = value;
    } else if (key === 'circularPol' && typeof value === 'boolean') {
      this.circularPol = value;
    } else if (key === 'showPoynting' && typeof value === 'boolean') {
      this.showPoynting = value;
    } else if (key === 'faradayFreq' && typeof value === 'number') {
      this.faradayFreq = value;
    } else if (key === 'coilTurns' && typeof value === 'number') {
      this.coilTurns = value;
      this.rebuildScene();
    } else if (key === 'magnetAmp' && typeof value === 'number') {
      this.magnetAmp = value;
    } else if (key === 'hallCurrent' && typeof value === 'number') {
      this.hallCurrent = value;
      this.updateHallVisuals();
    } else if (key === 'hallB' && typeof value === 'number') {
      this.hallB = value;
      this.updateHallVisuals();
    } else if (key === 'hallPositiveCarrier' && typeof value === 'boolean') {
      this.hallCarrierSign = value ? 1 : -1;
      this.hallBuildup = 0;
      this.rebuildScene();
    } else if (key === 'hallShowE' && typeof value === 'boolean') {
      this.hallShowE = value;
      this.updateHallVisuals();
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'launchTestCharge') this.spawnTestCharge();
    else if (actionId === 'flipPolarity') {
      this.polarity *= -1;
      this.rebuildScene();
    } else if (actionId === 'relaunchLorentz') this.resetLorentzParticle();
    else if (actionId === 'resetTime') this.simTime = 0;
    else if (actionId === 'replayHall') this.hallBuildup = 0;
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'em-dipole') {
      const midE = computeElectricField({ x: 0, y: 0, z: 0 }, this.dipoleCharges);
      const midMag = Math.hypot(midE.x, midE.y, midE.z);
      const tc = this.testCharges[0];
      const probeV = tc ? computeElectricPotential(tc.pos, this.dipoleCharges) : 0;
      return [
        {
          labelSimple: 'Center Field |E|',
          labelPhysics: 'Midpoint |E|',
          value: `${midMag.toFixed(2)} N/C`,
          noteTitle: 'Midpoint Electric Field',
          noteText: 'Electric push right between the (+) and (−) dipole poles.',
        },
        {
          labelSimple: 'Probe Voltage V',
          labelPhysics: 'Probe Potential V',
          value: `${probeV.toFixed(2)} V`,
          noteTitle: 'Electrostatic Potential',
          noteText: 'Positive near (+q) pole, negative near (−q) pole.',
        },
        {
          labelSimple: 'Dipole Moment p',
          labelPhysics: 'Dipole p = qd',
          value: `${(this.chargeMag * this.separation).toFixed(1)} μC·m`,
          noteTitle: 'Electric Dipole Moment',
          noteText: 'Product of charge magnitude and pole separation.',
        },
        {
          labelSimple: 'Active Probes',
          labelPhysics: 'Test Charges',
          value: String(this.testCharges.filter((t) => t.active).length),
          noteTitle: 'Released Probes',
          noteText: 'Tiny positive charges surfing from (+) toward (−).',
        },
      ];
    }

    if (this.chapterId === 'em-lorentz') {
      const speed = Math.hypot(this.lorentzVel.x, this.lorentzVel.y, this.lorentzVel.z);
      const vPerp = Math.hypot(this.lorentzVel.x, this.lorentzVel.z);
      const rc = vPerp / Math.max(0.1, this.bField);
      return [
        {
          labelSimple: 'Particle Speed |v|',
          labelPhysics: 'Speed |v|',
          value: `${speed.toFixed(2)} m/s`,
          noteTitle: 'Kinetic Speed',
          noteText: 'Magnetic forces NEVER change speed—only E_y does!',
        },
        {
          labelSimple: 'Spiral Radius r_c',
          labelPhysics: 'Cyclotron r_c',
          value: `${rc.toFixed(2)} m`,
          noteTitle: 'Cyclotron Radius',
          noteText: 'Radius equals mv_⊥ / (|q|B). Stronger B shrinks the circle.',
        },
        {
          labelSimple: 'Magnetic Field B',
          labelPhysics: 'B_y Flux',
          value: `${this.bField.toFixed(1)} T`,
          noteTitle: 'Vertical Magnetic Field',
          noteText: 'Exerts sideways Lorentz curl perpendicular to velocity.',
        },
        {
          labelSimple: 'Electric Push E_y',
          labelPhysics: 'Axial E_y',
          value: `${this.ez.toFixed(2)} V/m`,
          noteTitle: 'Vertical E-Field',
          noteText: 'Accelerates the particle upward or downward along B.',
        },
      ];
    }

    if (this.chapterId === 'em-wave') {
      const sample = evaluateEmWave(0, this.simTime, this.waveFreq, this.wavelength, 2.8, this.circularPol);
      const eMag = Math.hypot(sample.E.y, sample.E.z);
      const bMag = Math.hypot(sample.B.y, sample.B.z);
      return [
        {
          labelSimple: 'Wave E(0,t)',
          labelPhysics: 'Origin |E|',
          value: `${eMag.toFixed(2)} V/m`,
          noteTitle: 'Electric Wave Amplitude',
          noteText: 'Transverse electric oscillation at the center.',
        },
        {
          labelSimple: 'Wave B(0,t)',
          labelPhysics: 'Origin |B|',
          value: `${bMag.toFixed(2)} mT`,
          noteTitle: 'Magnetic Wave Amplitude',
          noteText: 'Strictly perpendicular to E at all times (E · B = 0).',
        },
        {
          labelSimple: 'Energy Flux S',
          labelPhysics: 'Poynting S_x',
          value: `${sample.poynting.x.toFixed(2)} W/m²`,
          noteTitle: 'Poynting Energy Flow',
          noteText: 'Light energy shooting forward in the +X direction.',
        },
        {
          labelSimple: 'Phase Speed v',
          labelPhysics: 'c_sim = λf',
          value: `${(this.wavelength * this.waveFreq).toFixed(1)} m/s`,
          noteTitle: 'Wave Speed',
          noteText: 'Product of wavelength λ and frequency f.',
        },
      ];
    }

    if (this.chapterId === 'em-faraday') {
      const far = this.lastFaradaySample;
      return [
        {
          labelSimple: 'Induced Voltage',
          labelPhysics: 'EMF ε = −N dΦ/dt',
          value: `${far.emf.toFixed(2)} V`,
          noteTitle: 'Induced Voltage',
          noteText: 'Peaks when the magnet sweeps fastest through the coil.',
        },
        {
          labelSimple: 'Magnetic Flux Φ',
          labelPhysics: 'Total Flux NΦ',
          value: `${far.fluxTotal.toFixed(2)} Wb`,
          noteTitle: 'Linked Flux',
          noteText: 'Total magnetic field passing through all coil turns.',
        },
        {
          labelSimple: 'Magnet Speed',
          labelPhysics: 'Velocity v_z',
          value: `${far.magnetVelZ.toFixed(2)} m/s`,
          noteTitle: 'Magnet Velocity',
          noteText: 'Zero speed = zero induced electricity!',
        },
        {
          labelSimple: 'Magnet Position',
          labelPhysics: 'Axial z(t)',
          value: `${far.magnetZ.toFixed(2)} m`,
          noteTitle: 'Magnet Depth',
          noteText: 'Position along the coil centerline.',
        },
      ];
    }

    const eq = evaluateHallEquilibrium(this.hallCurrent, this.hallB, this.hallCarrierSign);
    const vMeasured = eq.hallVoltage * this.hallBuildup;
    return [
      {
        labelSimple: 'Hall Voltage V_H',
        labelPhysics: 'V(+Z) − V(−Z)',
        value: `${vMeasured >= 0 ? '+' : ''}${vMeasured.toFixed(2)} mV`,
        noteTitle: 'Measured Hall Voltage',
        noteText: 'Sign flips between (−q) n-type electrons and (+q) p-type holes!',
      },
      {
        labelSimple: 'Hall E-Field',
        labelPhysics: 'Transverse E_H,z',
        value: `${(eq.hallFieldZ * this.hallBuildup).toFixed(2)} mV/m`,
        noteTitle: 'Balancing Electric Field',
        noteText: 'Equilibrium field canceling magnetic Lorentz force (qE_H = −q v×B).',
      },
      {
        labelSimple: 'Carrier Type',
        labelPhysics: 'Majority Sign q',
        value: this.hallCarrierSign > 0 ? '+q Holes (p-type)' : '−q Electrons (n)',
        noteTitle: 'Charge Carrier Identity',
        noteText: 'Switch carrier polarity in controls to prove why the Hall effect identifies semiconductors.',
      },
      {
        labelSimple: 'Drift Speed v_d',
        labelPhysics: 'Axial v_x',
        value: `${eq.driftSpeed.toFixed(2)} mm/s`,
        noteTitle: 'Longitudinal Drift',
        noteText: 'Negative along X for electrons, positive along X for holes.',
      },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'em-dipole') {
      return {
        captionSimple: 'Every charge sends electric push outward (+q) or pulls inward (−q) across space.',
        captionPhysics: 'Coulomb Superposition & Electrostatic Field',
        tex: String.raw`\mathbf{E}(\mathbf{r}) = \sum_i \frac{k q_i (\mathbf{r}-\mathbf{r}_i)}{|\mathbf{r}-\mathbf{r}_i|^3}`,
      };
    }
    if (this.chapterId === 'em-lorentz') {
      return {
        captionSimple: 'Magnetic force always pulls sideways (v × B), curling charges without changing speed.',
        captionPhysics: 'Lorentz Force Law & Cyclotron Radius',
        tex: String.raw`\mathbf{F} = q(\mathbf{E} + \mathbf{v} \times \mathbf{B}), \quad r_c = \frac{m v_\perp}{|q| B}`,
      };
    }
    if (this.chapterId === 'em-wave') {
      return {
        captionSimple: 'Oscillating E and B fields regenerate each other at 90°, carrying light energy forward.',
        captionPhysics: 'Transverse EM Plane Wave & Poynting Vector',
        tex: String.raw`\mathbf{E} \perp \mathbf{B}, \quad \mathbf{S} = \frac{1}{\mu_0}\mathbf{E} \times \mathbf{B}`,
      };
    }
    if (this.chapterId === 'em-faraday') {
      return {
        captionSimple: 'Changing magnetic flux through a coil generates voltage—motion is what powers the bulb!',
        captionPhysics: 'Faraday-Lenz Law of Electromagnetic Induction',
        tex: String.raw`\mathcal{E}(t) = -N \frac{d\Phi_B}{dt}`,
      };
    }
    return {
      captionSimple: 'Sideways charge pile-up stops when transverse electric push balances the magnetic pull.',
      captionPhysics: 'Hall Equilibrium & Carrier Polarity',
      tex: String.raw`q E_H + q v_d B_y = 0 \implies V_H = \frac{I B_y}{n q t}`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'em-dipole') {
      const tc = this.testCharges[0];
      const e = tc ? computeElectricField(tc.pos, this.dipoleCharges) : { x: 0, y: 0, z: 0 };
      const v = tc ? computeElectricPotential(tc.pos, this.dipoleCharges) : 0;
      const spd = tc ? Math.hypot(tc.vel.x, tc.vel.y, tc.vel.z) : 0;
      return {
        ch1: v,
        ch2: Math.hypot(e.x, e.y, e.z),
        ch3: spd,
        labels: ['V', '|E|', '|v|'],
        units: ['V', 'N/C', 'm/s'],
      };
    }
    if (this.chapterId === 'em-lorentz') {
      const spd = Math.hypot(this.lorentzVel.x, this.lorentzVel.y, this.lorentzVel.z);
      return {
        ch1: this.lorentzVel.x,
        ch2: this.lorentzVel.y,
        ch3: spd,
        labels: ['v_x', 'v_y', '|v|'],
        units: ['m/s', 'm/s', 'm/s'],
      };
    }
    if (this.chapterId === 'em-wave') {
      const w = evaluateEmWave(0, this.simTime, this.waveFreq, this.wavelength, 2.8, this.circularPol);
      return {
        ch1: w.E.y,
        ch2: w.B.z,
        ch3: w.poynting.x,
        labels: ['E_y', 'B_z', 'S_x'],
        units: ['V/m', 'mT', 'W'],
      };
    }
    if (this.chapterId === 'em-faraday') {
      const far = this.lastFaradaySample;
      return {
        ch1: far.emf,
        ch2: far.fluxTotal,
        ch3: far.magnetVelZ,
        labels: ['EMF', 'Φ', 'v_z'],
        units: ['V', 'Wb', 'm/s'],
      };
    }
    const eq = evaluateHallEquilibrium(this.hallCurrent, this.hallB, this.hallCarrierSign);
    return {
      ch1: eq.hallVoltage * this.hallBuildup,
      ch2: eq.hallFieldZ * this.hallBuildup,
      ch3: this.hallB,
      labels: ['V_H', 'E_H', 'B_y'],
      units: ['mV', 'mV/m', 'T'],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<EmChapterId, string> = {
      'em-dipole': 'Vol II · Electric Dipole Field',
      'em-lorentz': 'Vol II · Lorentz Cyclotron Helix',
      'em-wave': 'Vol II · EM Wave Propagation',
      'em-faraday': 'Vol II · Faraday Induction Coil',
      'em-hall': 'Vol II · Hall Effect Sensor',
    };
    return { label: names[this.chapterId], color: '#a855f7' };
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
    if (this.chapterId === 'em-dipole') {
      const e = computeElectricField({ x: hitPoint.x, y: hitPoint.y, z: hitPoint.z }, this.dipoleCharges);
      const v = computeElectricPotential({ x: hitPoint.x, y: hitPoint.y, z: hitPoint.z }, this.dipoleCharges);
      metrics.push(`|E| = ${Math.hypot(e.x, e.y, e.z).toFixed(2)} N/C`, `V = ${v.toFixed(2)} V`);
    } else if (this.chapterId === 'em-lorentz') {
      const spd = Math.hypot(this.lorentzVel.x, this.lorentzVel.y, this.lorentzVel.z);
      metrics.push(`|v| = ${spd.toFixed(2)} m/s`, `B_y = ${this.bField.toFixed(1)} T`);
    } else if (this.chapterId === 'em-wave') {
      const w = evaluateEmWave(hitPoint.x, this.simTime, this.waveFreq, this.wavelength, 2.8, this.circularPol);
      metrics.push(`|E| = ${Math.hypot(w.E.y, w.E.z).toFixed(2)}`, `S_x = ${w.poynting.x.toFixed(2)}`);
    } else if (this.chapterId === 'em-faraday') {
      metrics.push(`EMF = ${this.lastFaradaySample.emf.toFixed(2)} V`, `Φ = ${this.lastFaradaySample.fluxTotal.toFixed(2)} Wb`);
    } else {
      const eq = evaluateHallEquilibrium(this.hallCurrent, this.hallB, this.hallCarrierSign);
      metrics.push(
        `V_H = ${(eq.hallVoltage * this.hallBuildup).toFixed(2)} mV`,
        `E_H = ${(eq.hallFieldZ * this.hallBuildup).toFixed(2)}`,
      );
    }

    return { ...study, metrics };
  }

  public getCallouts(): LabCalloutPoint[] {
    if (this.chapterId === 'em-dipole') {
      const half = this.separation * 0.5;
      const q = this.chargeMag * this.polarity;
      return [
        {
          id: 'pole-left',
          label: q > 0 ? '+q Source' : '−q Sink',
          accent: q > 0 ? '#ef4444' : '#3b82f6',
          x: -half,
          y: 1.4,
          z: 0,
          hover: {
            ...(this.dipolePosMesh?.userData.study as StudyMeta),
            metrics: [`q = ${(q).toFixed(1)} μC`],
          },
        },
        {
          id: 'pole-right',
          label: q > 0 ? '−q Sink' : '+q Source',
          accent: q > 0 ? '#3b82f6' : '#ef4444',
          x: +half,
          y: 1.4,
          z: 0,
          hover: {
            ...(this.dipoleNegMesh?.userData.study as StudyMeta),
            metrics: [`q = ${(-q).toFixed(1)} μC`],
          },
        },
      ];
    }
    if (this.chapterId === 'em-faraday') {
      return [
        {
          id: 'bulb-callout',
          label: 'Induced Lamp',
          accent: '#fbbf24',
          x: 0,
          y: 5.7,
          z: 0,
          hover: {
            key: 'faraday-bulb',
            title: 'Induced Lamp',
            badge: 'OUTPUT',
            accent: '#fbbf24',
            simple: 'Lights up whenever changing magnetic flux induces voltage around the coil!',
            deeper: 'P(t) = ε(t)² / R',
            metrics: [`ε = ${this.lastFaradaySample.emf.toFixed(2)} V`],
          },
        },
      ];
    }
    if (this.chapterId === 'em-hall') {
      const eq = evaluateHallEquilibrium(this.hallCurrent, this.hallB, this.hallCarrierSign);
      const vH = eq.hallVoltage * this.hallBuildup;
      return [
        {
          id: 'hall-meter',
          label: `Hall Voltage: ${vH >= 0 ? '+' : ''}${vH.toFixed(2)} mV`,
          accent: vH >= 0 ? '#ef4444' : '#3b82f6',
          x: 0,
          y: 4.1,
          z: 0,
          hover: {
            key: 'hall-probe',
            title: 'Transverse Hall Voltmeter',
            badge: 'SENSOR READOUT',
            accent: '#fbbf24',
            simple: 'Shows the voltage difference between the front (+Z) and back (−Z) edges.',
            deeper: 'V_H = (I B_y) / (n q t)',
            metrics: [`V_H = ${vH.toFixed(2)} mV`],
          },
        },
        {
          id: 'hall-wall-front',
          label: vH >= 0 ? '+ Edge Charge' : '− Edge Charge',
          accent: vH >= 0 ? '#ef4444' : '#3b82f6',
          x: 0,
          y: 1.2,
          z: 2.35,
          hover: {
            key: 'hall-sidewalls',
            title: 'Front Charge Buildup Wall',
            badge: 'HALL POLARITY',
            accent: vH >= 0 ? '#ef4444' : '#3b82f6',
            simple: 'Majority carriers deflect toward this edge until E_H halts lateral flow.',
            deeper: 'Sign flips cleanly when toggling p-type (+q) vs n-type (−q).',
            metrics: [`E_H = ${(eq.hallFieldZ * this.hallBuildup).toFixed(2)} mV/m`],
          },
        },
      ];
    }
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'em-dipole') return { position: [0, 10, 17], target: [0, 0, 0] };
    if (this.chapterId === 'em-lorentz') return { position: [12, 8, 13], target: [0, 0, 0] };
    if (this.chapterId === 'em-wave') return { position: [4, 7, 16], target: [0, 0, 0] };
    if (this.chapterId === 'em-hall') return { position: [0, 11, 16], target: [0, 0, 0] };
    return { position: [9, 6, 11], target: [0, 1.2, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
