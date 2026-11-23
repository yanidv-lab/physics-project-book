import * as THREE from 'three';
import type { CircuitState, SimParams } from '../types/simulation';
import { DrudeEngine, HERO_TRAIL_LEN, NUM_ELECTRONS } from '../physics/drudeEngine';
import { createRadialGlowTexture } from './visualAssets';

const MAX_PHONON_RIPPLES = 48;
const NEIGHBOR_STREAKS = 48;

interface RippleState {
  active: boolean;
  age: number;
  duration: number;
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  intensity: number;
}

export class InstancedPhysicsRenderer {
  public readonly group = new THREE.Group();

  private ionMesh: THREE.InstancedMesh | null = null;
  private electronMesh: THREE.InstancedMesh;
  private streakLines: THREE.LineSegments;
  private streakPosAttr: THREE.BufferAttribute;
  private prevWorldPos: THREE.Vector3[] = Array.from(
    { length: NUM_ELECTRONS },
    () => new THREE.Vector3(),
  );
  private hasPrevPos = false;

  // Hero electron assembly
  private heroGroup = new THREE.Group();
  private heroSphereMesh: THREE.Mesh;
  private heroCoronaSprite: THREE.Sprite;
  private heroOuterRing: THREE.Mesh;
  private heroInnerRing: THREE.Mesh;
  private heroTrail: THREE.LineSegments;
  private heroTrailPosAttr: THREE.BufferAttribute;
  private heroTrailColAttr: THREE.BufferAttribute;
  private driftArrowGroup = new THREE.Group();
  private driftArrowShaft: THREE.Mesh;
  private driftArrowHead: THREE.Mesh;

  // Phonon thermal ripples
  private rippleMesh: THREE.InstancedMesh;
  private ripples: RippleState[] = Array.from({ length: MAX_PHONON_RIPPLES }, () => ({
    active: false,
    age: 0,
    duration: 0.42,
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(0, 0, 1),
    normal: new THREE.Vector3(1, 0, 0),
    binormal: new THREE.Vector3(0, 1, 0),
    intensity: 1,
  }));
  private rippleCursor = 0;

  private readonly dummy = new THREE.Object3D();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly amberCol = new THREE.Color(0xd97706);
  private readonly hotRedCol = new THREE.Color(0xff3b30);
  private readonly cyanCol = new THREE.Color(0x00f0ff);
  private readonly goldCol = new THREE.Color(0xfbbf24);

  private ionGeom = new THREE.IcosahedronGeometry(0.13, 1);
  private ionMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.28,
  });

  private animClock = 0;
  private lastHeroCollisions = 0;
  private recentHeroCollisionPulse = 0;

  constructor(engine: DrudeEngine) {
    // 1. Conduction electrons (all except index 0 hero)
    const eGeom = new THREE.SphereGeometry(0.088, 10, 10);
    const eMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.electronMesh = new THREE.InstancedMesh(eGeom, eMat, NUM_ELECTRONS - 1);
    this.electronMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.electronMesh.frustumCulled = false;
    this.group.add(this.electronMesh);

    // 2. Motion streaks for nearby carriers
    const streakBuf = new Float32Array(NEIGHBOR_STREAKS * 2 * 3);
    const streakGeom = new THREE.BufferGeometry();
    this.streakPosAttr = new THREE.BufferAttribute(streakBuf, 3);
    this.streakPosAttr.setUsage(THREE.DynamicDrawUsage);
    streakGeom.setAttribute('position', this.streakPosAttr);
    const streakMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.48,
    });
    this.streakLines = new THREE.LineSegments(streakGeom, streakMat);
    this.streakLines.frustumCulled = false;
    this.group.add(this.streakLines);

    // 3. Hero electron + targeting reticles + soft radial corona
    this.heroSphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xe0ffff }),
    );
    this.heroGroup.add(this.heroSphereMesh);

    const coronaMat = new THREE.SpriteMaterial({
      map: createRadialGlowTexture('rgba(224, 255, 255, 0.95)', 'rgba(0, 240, 255, 0.3)'),
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.heroCoronaSprite = new THREE.Sprite(coronaMat);
    this.heroCoronaSprite.scale.set(0.95, 0.95, 1);
    this.heroGroup.add(this.heroCoronaSprite);

    this.heroOuterRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.022, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
    );
    this.heroGroup.add(this.heroOuterRing);

    this.heroInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.016, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.heroInnerRing.rotation.x = Math.PI * 0.5;
    this.heroGroup.add(this.heroInnerRing);
    this.group.add(this.heroGroup);

    // 4. Hero trail line segments (supports clean breaks)
    const maxSegs = HERO_TRAIL_LEN - 1;
    const trailPos = new Float32Array(maxSegs * 2 * 3);
    const trailCol = new Float32Array(maxSegs * 2 * 3);
    const trailGeom = new THREE.BufferGeometry();
    this.heroTrailPosAttr = new THREE.BufferAttribute(trailPos, 3);
    this.heroTrailPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.heroTrailColAttr = new THREE.BufferAttribute(trailCol, 3);
    this.heroTrailColAttr.setUsage(THREE.DynamicDrawUsage);
    trailGeom.setAttribute('position', this.heroTrailPosAttr);
    trailGeom.setAttribute('color', this.heroTrailColAttr);
    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    this.heroTrail = new THREE.LineSegments(trailGeom, trailMat);
    this.heroTrail.frustumCulled = false;
    this.group.add(this.heroTrail);

    // 5. Averaged drift vector HUD arrow attached near hero
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const shaftGeom = new THREE.CylinderGeometry(0.028, 0.028, 1, 8);
    shaftGeom.rotateX(Math.PI * 0.5);
    shaftGeom.translate(0, 0, 0.5);
    this.driftArrowShaft = new THREE.Mesh(shaftGeom, arrowMat);

    const headGeom = new THREE.ConeGeometry(0.085, 0.24, 10);
    headGeom.rotateX(Math.PI * 0.5);
    this.driftArrowHead = new THREE.Mesh(headGeom, arrowMat);

    this.driftArrowGroup.add(this.driftArrowShaft, this.driftArrowHead);
    this.group.add(this.driftArrowGroup);

    // 6. Phonon thermal ripple pool
    const ripGeom = new THREE.TorusGeometry(0.5, 0.032, 8, 24);
    const ripMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });
    this.rippleMesh = new THREE.InstancedMesh(ripGeom, ripMat, MAX_PHONON_RIPPLES);
    this.rippleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rippleMesh.frustumCulled = false;
    for (let i = 0; i < MAX_PHONON_RIPPLES; i++) {
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.rippleMesh.setMatrixAt(i, this.dummy.matrix);
      this.rippleMesh.setColorAt(i, this.hotRedCol);
    }
    this.group.add(this.rippleMesh);

    this.rebuildIons(engine);
  }

  public rebuildIons(engine: DrudeEngine): void {
    if (this.ionMesh) {
      this.group.remove(this.ionMesh);
      this.ionMesh.dispose();
      this.ionMesh = null;
    }

    const count = engine.ions.length;
    if (count === 0) return;

    this.ionMesh = new THREE.InstancedMesh(this.ionGeom, this.ionMat, count);
    this.ionMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ionMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      this.dummy.position.copy(engine.ions[i].baseWorldPos);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ionMesh.setMatrixAt(i, this.dummy.matrix);
      this.ionMesh.setColorAt(i, this.amberCol);
    }
    this.ionMesh.instanceMatrix.needsUpdate = true;
    if (this.ionMesh.instanceColor) {
      this.ionMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.ionMesh);
    this.hasPrevPos = false;
  }

  public update(
    dt: number,
    engine: DrudeEngine,
    state: CircuitState,
    params: SimParams,
  ): void {
    this.animClock += dt;

    // 1. Update lattice ions thermal vibrations + Joule heating glow
    if (this.ionMesh) {
      const ions = engine.ions;
      const heat = engine.ionHeat;
      const showGlow = params.layers.phononGlow;
      const tempVibAmp = showGlow ? 0.015 + 0.055 * Math.sqrt(params.temperature / 300) : 0.008;
      const omega = 18 + 14 * (params.temperature / 300);

      for (let i = 0; i < ions.length; i++) {
        const ion = ions[i];
        const h = showGlow ? heat[i] : 0;
        const amp = tempVibAmp + h * 0.14;
        const phase = this.animClock * omega + i * 1.713;
        const dx = Math.sin(phase) * amp;
        const dy = Math.cos(phase * 1.13) * amp;
        const dz = Math.sin(phase * 0.87 + 1.1) * amp * 0.6;

        this.tmpVec
          .copy(ion.baseWorldPos)
          .addScaledVector(ion.normal, dx)
          .addScaledVector(ion.binormal, dy)
          .addScaledVector(ion.tangent, dz);

        const s = 1 + h * 0.35;
        this.tmpScale.set(s, s, s);
        this.tmpQuat.identity();
        this.tmpMat.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        this.ionMesh.setMatrixAt(i, this.tmpMat);

        // Color shift: muted amber -> incandescent hot red (HDR boost for bloom when hot)
        this.tmpColor.copy(this.amberCol).lerp(this.hotRedCol, Math.min(1, h * 1.25));
        if (h > 0.2 && showGlow) {
          const boost = 1 + h * 1.4;
          this.tmpColor.multiplyScalar(boost);
        }
        this.ionMesh.setColorAt(i, this.tmpColor);
      }
      this.ionMesh.instanceMatrix.needsUpdate = true;
      if (this.ionMesh.instanceColor) {
        this.ionMesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update other conduction electrons
    const worldPos = engine.worldPos;
    this.tmpQuat.identity();
    this.tmpScale.set(1, 1, 1);
    for (let i = 1; i < NUM_ELECTRONS; i++) {
      this.tmpMat.compose(worldPos[i], this.tmpQuat, this.tmpScale);
      this.electronMesh.setMatrixAt(i - 1, this.tmpMat);
    }
    this.electronMesh.instanceMatrix.needsUpdate = true;

    // 3. Motion streaks for closest ~48 neighbors to hero
    const heroPos = worldPos[0];
    const streakArr = this.streakPosAttr.array as Float32Array;
    if (!this.hasPrevPos) {
      for (let i = 0; i < NUM_ELECTRONS; i++) {
        this.prevWorldPos[i].copy(worldPos[i]);
      }
      this.hasPrevPos = true;
    }

    let streakWrite = 0;
    for (let i = 1; i < NUM_ELECTRONS && streakWrite < NEIGHBOR_STREAKS; i++) {
      const p = worldPos[i];
      const prev = this.prevWorldPos[i];
      const dSq = p.distanceToSquared(heroPos);
      if (dSq < 100 && p.distanceToSquared(prev) < 4.0) {
        const idx = streakWrite * 6;
        streakArr[idx] = prev.x;
        streakArr[idx + 1] = prev.y;
        streakArr[idx + 2] = prev.z;
        streakArr[idx + 3] = p.x;
        streakArr[idx + 4] = p.y;
        streakArr[idx + 5] = p.z;
        streakWrite++;
      }
    }
    for (let k = streakWrite; k < NEIGHBOR_STREAKS; k++) {
      const idx = k * 6;
      streakArr[idx] = 0;
      streakArr[idx + 1] = 0;
      streakArr[idx + 2] = 0;
      streakArr[idx + 3] = 0;
      streakArr[idx + 4] = 0;
      streakArr[idx + 5] = 0;
    }
    this.streakPosAttr.needsUpdate = true;

    for (let i = 0; i < NUM_ELECTRONS; i++) {
      this.prevWorldPos[i].copy(worldPos[i]);
    }

    // 4. Hero electron & reticles + collision pulse tracking
    if (engine.collisions > this.lastHeroCollisions) {
      this.recentHeroCollisionPulse = 1.0;
      this.lastHeroCollisions = engine.collisions;
    } else if (engine.collisions < this.lastHeroCollisions) {
      this.lastHeroCollisions = engine.collisions;
      this.recentHeroCollisionPulse = 0;
    }
    this.recentHeroCollisionPulse *= Math.exp(-dt * 9.0);

    this.heroGroup.position.copy(heroPos);
    this.heroOuterRing.rotation.y += dt * 2.4;
    this.heroOuterRing.rotation.x += dt * 1.1;
    this.heroInnerRing.rotation.z -= dt * 3.1;

    // 5. Hero trail ring buffer -> LineSegments
    const trailPosArr = this.heroTrailPosAttr.array as Float32Array;
    const trailColArr = this.heroTrailColAttr.array as Float32Array;
    const count = engine.trailCount;
    const startIdx = (engine.trailHead - count + HERO_TRAIL_LEN) % HERO_TRAIL_LEN;
    let segIdx = 0;
    for (let step = 1; step < count; step++) {
      const i0 = (startIdx + step - 1) % HERO_TRAIL_LEN;
      const i1 = (startIdx + step) % HERO_TRAIL_LEN;
      if (engine.trailBreaks[i1] === 1) continue;
      const p0 = engine.trailPositions[i0];
      const p1 = engine.trailPositions[i1];
      if (p0.distanceToSquared(p1) > 9.0) continue;

      const t = step / Math.max(1, count - 1);
      this.tmpColor.copy(this.cyanCol).lerp(this.goldCol, t * 0.75);
      const fade = t * t;

      const base = segIdx * 6;
      trailPosArr[base] = p0.x;
      trailPosArr[base + 1] = p0.y;
      trailPosArr[base + 2] = p0.z;
      trailPosArr[base + 3] = p1.x;
      trailPosArr[base + 4] = p1.y;
      trailPosArr[base + 5] = p1.z;

      trailColArr[base] = this.tmpColor.r * fade;
      trailColArr[base + 1] = this.tmpColor.g * fade;
      trailColArr[base + 2] = this.tmpColor.b * fade;
      trailColArr[base + 3] = this.tmpColor.r * fade;
      trailColArr[base + 4] = this.tmpColor.g * fade;
      trailColArr[base + 5] = this.tmpColor.b * fade;
      segIdx++;
    }
    for (let k = segIdx; k < HERO_TRAIL_LEN - 1; k++) {
      const base = k * 6;
      trailPosArr[base] = 0;
      trailPosArr[base + 1] = 0;
      trailPosArr[base + 2] = 0;
      trailPosArr[base + 3] = 0;
      trailPosArr[base + 4] = 0;
      trailPosArr[base + 5] = 0;
    }
    this.heroTrailPosAttr.needsUpdate = true;
    this.heroTrailColAttr.needsUpdate = true;

    // 6. Mean drift vector arrow near hero (visible whenever current != 0)
    const hasDrift = Math.abs(state.current) > 1e-4;
    this.driftArrowGroup.visible = hasDrift;
    if (hasDrift) {
      this.tmpDir.copy(engine.heroDriftVelWorld);
      const len = this.tmpDir.length();
      if (len > 1e-6) {
        this.tmpDir.divideScalar(len);
        const visualLen = Math.min(1.8, Math.max(0.45, 0.35 + Math.log10(1 + Math.abs(state.current) * 6) * 1.1));
        this.driftArrowGroup.position.copy(heroPos).add(new THREE.Vector3(0, 0.34, 0));
        this.driftArrowGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.tmpDir);
        this.driftArrowShaft.scale.set(1, 1, visualLen);
        this.driftArrowHead.position.set(0, 0, visualLen + 0.1);
      }
    }

    // 7. Spawn & animate phonon thermal ripples
    if (params.layers.phononGlow) {
      for (const ev of engine.pendingPhononEvents) {
        const ion = engine.ions[ev.ionIndex];
        if (!ion) continue;
        const r = this.ripples[this.rippleCursor];
        this.rippleCursor = (this.rippleCursor + 1) % MAX_PHONON_RIPPLES;
        r.active = true;
        r.age = 0;
        r.duration = 0.42;
        r.pos.copy(ion.baseWorldPos);
        r.tangent.copy(ion.tangent);
        r.normal.copy(ion.normal);
        r.binormal.copy(ion.binormal);
        r.intensity = ev.intensity;
      }
    }

    this.rippleMesh.visible = params.layers.phononGlow;
    if (params.layers.phononGlow) {
      for (let i = 0; i < MAX_PHONON_RIPPLES; i++) {
        const r = this.ripples[i];
        if (!r.active) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpVec.set(0, 0, 0), this.tmpQuat.identity(), this.tmpScale);
          this.rippleMesh.setMatrixAt(i, this.tmpMat);
          continue;
        }
        r.age += dt;
        if (r.age >= r.duration) {
          r.active = false;
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(this.tmpVec.set(0, 0, 0), this.tmpQuat.identity(), this.tmpScale);
          this.rippleMesh.setMatrixAt(i, this.tmpMat);
          continue;
        }
        const frac = r.age / r.duration;
        const rad = (0.25 + 1.55 * frac) * (0.7 + 0.4 * r.intensity);
        const fade = Math.sin((1 - frac) * Math.PI * 0.5);
        this.tmpMat.makeBasis(r.normal, r.binormal, r.tangent);
        this.tmpQuat.setFromRotationMatrix(this.tmpMat);
        this.tmpScale.set(rad, rad, fade);
        this.tmpMat.compose(r.pos, this.tmpQuat, this.tmpScale);
        this.rippleMesh.setMatrixAt(i, this.tmpMat);

        this.tmpColor.setHex(0xff8a3d).lerp(this.hotRedCol, frac).multiplyScalar(1.2 * fade);
        this.rippleMesh.setColorAt(i, this.tmpColor);
      }
      this.rippleMesh.instanceMatrix.needsUpdate = true;
      if (this.rippleMesh.instanceColor) {
        this.rippleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  public setHeroCoreVisible(visible: boolean): void {
    this.heroSphereMesh.visible = visible;
    this.heroCoronaSprite.visible = visible;
  }

  public getHeroCollisionPulse(): number {
    return this.recentHeroCollisionPulse;
  }

  public dispose(): void {
    if (this.ionMesh) this.ionMesh.dispose();
    this.ionGeom.dispose();
    this.ionMat.dispose();
    this.electronMesh.geometry.dispose();
    (this.electronMesh.material as THREE.Material).dispose();
    this.heroCoronaSprite.material.dispose();
    this.streakLines.geometry.dispose();
    (this.streakLines.material as THREE.Material).dispose();
    this.heroTrail.geometry.dispose();
    (this.heroTrail.material as THREE.Material).dispose();
    this.rippleMesh.geometry.dispose();
    (this.rippleMesh.material as THREE.Material).dispose();
  }
}
