import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMode } from '../types/simulation';
import { DrudeEngine } from '../physics/drudeEngine';
import { PathGeometry } from '../physics/pathGeometry';
import { CircuitMeshes } from './circuitMeshes';
import { InstancedPhysicsRenderer } from './instancedPhysics';
import { SceneManager } from './sceneManager';

export class CameraController {
  private mode: CameraMode = 'locked-drift';
  private readonly controls: OrbitControls;
  private readonly sceneManager: SceneManager;

  // Macro-overview pulsing beacon
  private readonly beaconGroup = new THREE.Group();
  private readonly beaconRing: THREE.Mesh;
  private readonly beaconPillarMat: THREE.MeshBasicMaterial;
  private beaconClock = 0;

  // POV drag-to-look offsets
  private povDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private yawOffset = 0;
  private pitchOffset = 0;

  // Damped raw-POV gaze vector
  private rawLookDir = new THREE.Vector3(-1, 0, 0);
  private prevCutTarget = new THREE.Vector3();
  private hasPrevCutTarget = false;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpCutNorm = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  private readonly onPointerDownBound = (e: PointerEvent) => this.onPointerDown(e);
  private readonly onPointerMoveBound = (e: PointerEvent) => this.onPointerMove(e);
  private readonly onPointerUpBound = () => this.onPointerUp();
  private readonly onDblClickBound = () => {
    this.yawOffset = 0;
    this.pitchOffset = 0;
  };

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    const dom = sceneManager.renderer.domElement;

    this.controls = new OrbitControls(sceneManager.camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 95;
    this.controls.minDistance = 2.5;
    this.controls.enabled = false;

    // Build macro-overview pulsing hero beacon
    const pillarGeom = new THREE.CylinderGeometry(0.14, 0.35, 5.2, 16, 1, true);
    pillarGeom.translate(0, 2.6, 0);
    this.beaconPillarMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pillar = new THREE.Mesh(pillarGeom, this.beaconPillarMat);
    this.beaconGroup.add(pillar);

    this.beaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.08, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
    );
    this.beaconRing.rotation.x = Math.PI * 0.5;
    this.beaconRing.position.y = 0.2;
    this.beaconGroup.add(this.beaconRing);
    this.beaconGroup.visible = false;
    sceneManager.scene.add(this.beaconGroup);

    dom.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    dom.addEventListener('dblclick', this.onDblClickBound);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.mode === 'locked-drift' || this.mode === 'raw-pov') {
      this.povDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.povDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.yawOffset = Math.max(-1.2, Math.min(1.2, this.yawOffset - dx * 0.004));
    this.pitchOffset = Math.max(-0.75, Math.min(0.75, this.pitchOffset - dy * 0.004));
  }

  private onPointerUp(): void {
    this.povDragging = false;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public setLabOrbit(position: [number, number, number], target: [number, number, number]): void {
    this.controls.enabled = true;
    this.beaconGroup.visible = false;
    this.sceneManager.setFogDensity(0.004);
    const cam = this.sceneManager.camera;
    cam.up.set(0, 1, 0);
    cam.position.set(position[0], position[1], position[2]);
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
  }

  public updateLabOrbit(): void {
    this.controls.update();
  }

  public setMode(
    newMode: CameraMode,
    path: PathGeometry,
    engine: DrudeEngine,
    meshes: CircuitMeshes,
    instanced: InstancedPhysicsRenderer,
  ): void {
    this.mode = newMode;
    this.yawOffset = 0;
    this.pitchOffset = 0;
    this.hasPrevCutTarget = false;

    const cam = this.sceneManager.camera;
    const heroFrame = path.sampleFrame(engine.s[0]);

    if (newMode === 'locked-drift') {
      this.controls.enabled = false;
      this.beaconGroup.visible = false;
      this.sceneManager.setFogDensity(0.012);
      meshes.setCutawayPlane(false);
      instanced.setHeroCoreVisible(true);
    } else if (newMode === 'raw-pov') {
      this.controls.enabled = false;
      this.beaconGroup.visible = false;
      this.sceneManager.setFogDensity(0.014);
      meshes.setCutawayPlane(false);
      instanced.setHeroCoreVisible(false);
      this.rawLookDir.copy(heroFrame.tangent);
    } else if (newMode === 'side-cutaway') {
      this.controls.enabled = true;
      this.beaconGroup.visible = false;
      this.sceneManager.setFogDensity(0.002);
      instanced.setHeroCoreVisible(true);
      cam.up.set(0, 1, 0);
      cam.position
        .copy(heroFrame.pos)
        .addScaledVector(heroFrame.normal, 9.5)
        .addScaledVector(heroFrame.binormal, 2.4);
      this.controls.target.copy(heroFrame.pos);
      this.prevCutTarget.copy(heroFrame.pos);
      this.hasPrevCutTarget = true;
      this.controls.update();
    } else {
      // macro-overview
      this.controls.enabled = true;
      this.beaconGroup.visible = true;
      this.sceneManager.setFogDensity(0.0);
      meshes.setCutawayPlane(false);
      instanced.setHeroCoreVisible(true);
      cam.up.set(0, 1, 0);
      cam.position.set(0, 34, 28);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  public update(
    dt: number,
    path: PathGeometry,
    engine: DrudeEngine,
    meshes: CircuitMeshes,
  ): void {
    const cam = this.sceneManager.camera;

    if (this.mode === 'locked-drift') {
      const camFrame = path.sampleFrame(engine.heroDriftS - 3.2);
      const lookFrame = path.sampleFrame(engine.heroDriftS + 3.2);

      this.tmpPos
        .copy(camFrame.pos)
        .addScaledVector(camFrame.binormal, 0.28);

      this.tmpLook
        .copy(lookFrame.pos)
        .lerp(engine.worldPos[0], 0.25);

      if (Math.abs(this.yawOffset) > 1e-4 || Math.abs(this.pitchOffset) > 1e-4) {
        this.tmpDir.subVectors(this.tmpLook, this.tmpPos);
        const dist = this.tmpDir.length();
        this.tmpDir.normalize();
        const qYaw = new THREE.Quaternion().setFromAxisAngle(camFrame.binormal, this.yawOffset);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(camFrame.normal, this.pitchOffset);
        this.tmpDir.applyQuaternion(qYaw).applyQuaternion(qPitch);
        this.tmpLook.copy(this.tmpPos).addScaledVector(this.tmpDir, dist);
      }

      cam.position.copy(this.tmpPos);
      this.tmpUp.copy(camFrame.binormal).lerp(this.worldUp, 0.35).normalize();
      cam.up.copy(this.tmpUp);
      cam.lookAt(this.tmpLook);
    } else if (this.mode === 'raw-pov') {
      const heroFrame = path.sampleFrame(engine.s[0]);
      cam.position.copy(engine.worldPos[0]);

      // Target direction combines forward tangent with instantaneous velocity impulse
      this.tmpDir.copy(heroFrame.tangent);
      if (engine.heroWorldVel.lengthSq() > 0.01) {
        this.tmpVecNormalizeAdd(this.tmpDir, engine.heroWorldVel, 0.28);
      }
      const blend = 1 - Math.exp(-dt * 16);
      this.rawLookDir.lerp(this.tmpDir, blend).normalize();

      this.tmpDir.copy(this.rawLookDir);
      if (Math.abs(this.yawOffset) > 1e-4 || Math.abs(this.pitchOffset) > 1e-4) {
        const qYaw = new THREE.Quaternion().setFromAxisAngle(heroFrame.binormal, this.yawOffset);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(heroFrame.normal, this.pitchOffset);
        this.tmpDir.applyQuaternion(qYaw).applyQuaternion(qPitch);
      }

      this.tmpLook.copy(cam.position).addScaledVector(this.tmpDir, 4.0);
      cam.up.copy(heroFrame.binormal);
      cam.lookAt(this.tmpLook);
    } else if (this.mode === 'side-cutaway') {
      const heroFrame = path.sampleFrame(engine.heroDriftS);
      if (this.hasPrevCutTarget) {
        const delta = this.tmpPos.subVectors(heroFrame.pos, this.prevCutTarget);
        cam.position.add(delta);
        this.controls.target.add(delta);
      }
      this.prevCutTarget.copy(heroFrame.pos);
      this.hasPrevCutTarget = true;
      this.controls.update();

      // Clip half of tube facing camera perpendicular to local tangent
      this.tmpCutNorm.subVectors(heroFrame.pos, cam.position);
      this.tmpCutNorm.addScaledVector(
        heroFrame.tangent,
        -this.tmpCutNorm.dot(heroFrame.tangent),
      );
      if (this.tmpCutNorm.lengthSq() < 0.01) {
        this.tmpCutNorm.copy(heroFrame.normal).negate();
      } else {
        this.tmpCutNorm.normalize();
      }
      meshes.setCutawayPlane(true, this.tmpCutNorm, heroFrame.pos);
    } else {
      // macro-overview
      this.controls.update();
      this.beaconClock += dt;
      this.beaconGroup.position.copy(engine.worldPos[0]);
      const pulse = 1 + 0.22 * Math.sin(this.beaconClock * 5.0);
      this.beaconRing.scale.set(pulse, pulse, 1);
      this.beaconPillarMat.opacity = 0.45 + 0.25 * Math.sin(this.beaconClock * 4.0);
    }
  }

  private tmpVecNormalizeAdd(target: THREE.Vector3, v: THREE.Vector3, weight: number): void {
    const len = v.length();
    if (len > 1e-5) {
      target.addScaledVector(v, weight / len).normalize();
    }
  }

  public dispose(): void {
    const dom = this.sceneManager.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    dom.removeEventListener('dblclick', this.onDblClickBound);
    this.controls.dispose();
  }
}
