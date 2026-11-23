import * as THREE from 'three';
import { SCENE_STUDY_NOTES } from '../data/projectBook';
import type { LabHoverData, LabModule } from '../labs/labModule';
import { CircuitModel } from '../physics/circuitModel';
import { DrudeEngine } from '../physics/drudeEngine';
import { PathGeometry } from '../physics/pathGeometry';
import type { HoverTargetInfo, HoverTargetKind, TopicId } from '../types/simulation';
import { CircuitMeshes } from './circuitMeshes';
import { SceneManager } from './sceneManager';

export interface InteractionCallbacks {
  onDropPin: (s: number, kind: HoverTargetKind, defaultTitle: string, defaultNote: string) => void;
  onDropWorldPin: (
    topicId: Exclude<TopicId, 'circuits'>,
    chapterId: string,
    targetKey: string,
    x: number,
    y: number,
    z: number,
    defaultTitle: string,
    defaultNote: string,
  ) => void;
}

function formatShortField(val: number): string {
  const abs = Math.abs(val);
  if (abs === 0) return '0.00 V/m';
  if (abs < 0.1) return `${(abs * 1000).toFixed(2)} mV/m`;
  if (abs < 1000) return `${abs.toFixed(1)} V/m`;
  return `${abs.toExponential(2)} V/m`;
}

export class InteractionManager {
  private readonly sceneManager: SceneManager;
  private readonly callbacks: InteractionCallbacks;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmpProj = new THREE.Vector3();
  private readonly tmpBasis = new THREE.Matrix4();

  private readonly hoverRing: THREE.Mesh;
  private readonly hoverRingMat: THREE.MeshBasicMaterial;
  private readonly hoverCard = document.getElementById('hover-note-card') as HTMLElement;

  private markMode = false;
  private simpleMode = true;
  private pointerInside = false;
  private pointerClientX = 0;
  private pointerClientY = 0;
  private downX = 0;
  private downY = 0;
  private pinnedTapHover = false;

  private currentHover: HoverTargetInfo | null = null;
  private activeLab: LabModule | null = null;

  private pathRef: PathGeometry;
  private circuitRef: CircuitModel;
  private engineRef: DrudeEngine;
  private meshesRef: CircuitMeshes;

  constructor(
    sceneManager: SceneManager,
    path: PathGeometry,
    circuit: CircuitModel,
    engine: DrudeEngine,
    meshes: CircuitMeshes,
    callbacks: InteractionCallbacks,
  ) {
    this.sceneManager = sceneManager;
    this.pathRef = path;
    this.circuitRef = circuit;
    this.engineRef = engine;
    this.meshesRef = meshes;
    this.callbacks = callbacks;

    const ringGeom = new THREE.TorusGeometry(1, 0.055, 10, 32);
    this.hoverRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
    });
    this.hoverRing = new THREE.Mesh(ringGeom, this.hoverRingMat);
    this.hoverRing.visible = false;
    sceneManager.scene.add(this.hoverRing);

    const dom = sceneManager.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
    });

    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointerInside = true;
      this.pinnedTapHover = false;
      this.pointerClientX = e.clientX;
      this.pointerClientY = e.clientY;
    });

    dom.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      if (!this.pinnedTapHover) {
        this.hideHover();
      }
    });

    dom.addEventListener('click', (e) => {
      const travel = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      if (travel > 7) return;

      this.pointerClientX = e.clientX;
      this.pointerClientY = e.clientY;

      // In Mark Mode or Shift+Click, drop a pin
      if (this.markMode || e.shiftKey) {
        if (this.activeLab) {
          this.handleLabClick(e.clientX, e.clientY, true);
        } else {
          this.evaluateCircuitHover();
          if (this.currentHover) {
            const note = SCENE_STUDY_NOTES[this.currentHover.kind];
            this.callbacks.onDropPin(
              this.currentHover.s,
              this.currentHover.kind,
              note.title,
              note.simple,
            );
          }
        }
        return;
      }

      // On touch / narrow viewports, allow tapping 3D objects to inspect study notes
      if (window.innerWidth <= 900 || 'ontouchstart' in window) {
        if (this.activeLab) {
          const hit = this.handleLabClick(e.clientX, e.clientY, false);
          this.pinnedTapHover = hit;
          if (!hit) this.hideHover();
        } else {
          const hit = this.evaluateCircuitHover();
          this.pinnedTapHover = hit;
          if (!hit) this.hideHover();
        }
      }
    });
  }

  public setActiveLab(lab: LabModule | null): void {
    this.activeLab = lab;
    this.pinnedTapHover = false;
    this.hideHover();
  }

  public updateRefs(
    path: PathGeometry,
    circuit: CircuitModel,
    engine: DrudeEngine,
    meshes: CircuitMeshes,
  ): void {
    this.pathRef = path;
    this.circuitRef = circuit;
    this.engineRef = engine;
    this.meshesRef = meshes;
  }

  public setMarkMode(enabled: boolean): void {
    this.markMode = enabled;
    this.hoverRingMat.color.setHex(enabled ? 0x10b981 : 0x00f0ff);
    this.sceneManager.renderer.domElement.style.cursor = enabled ? 'crosshair' : 'grab';
  }

  public isMarkMode(): boolean {
    return this.markMode;
  }

  public setSimpleMode(simple: boolean): void {
    this.simpleMode = simple;
  }

  public showExternalStudyNote(kind: HoverTargetKind, clientX: number, clientY: number, s?: number): void {
    const targetS = s ?? this.engineRef.s[0];
    const sampled = this.circuitRef.sampleAtS(targetS);
    const state = this.circuitRef.getState();
    this.currentHover = {
      s: targetS,
      kind,
      clientX,
      clientY,
      localV: sampled.localV,
      localU_eV: sampled.localU_eV,
      E_abs: Math.abs(sampled.E_axial),
      power:
        sampled.segment.kind === 'resistor' || sampled.segment.kind === 'resistor2'
          ? state.segmentFields[sampled.segment.id]?.power
          : undefined,
      capV: sampled.segment.kind === 'capacitor' ? state.capacitorVoltage : undefined,
    };
    const note = SCENE_STUDY_NOTES[kind];
    const extraChips: string[] = [
      `V = ${this.currentHover.localV.toFixed(2)} V`,
      `U = ${this.currentHover.localU_eV.toFixed(2)} eV`,
      `|E| = ${formatShortField(this.currentHover.E_abs)}`,
    ];
    if (this.currentHover.power !== undefined) {
      extraChips.push(`Heat = ${this.currentHover.power.toFixed(2)} W`);
    }
    if (this.currentHover.capV !== undefined) {
      extraChips.push(`V_C = ${this.currentHover.capV.toFixed(2)} V`);
    }
    this.renderCardContent(
      { ...note, metrics: extraChips },
      clientX,
      clientY,
      this.markMode ? 'Tap or click to drop a Study Pin here' : 'Shift+Click or Mark [M] to pin note',
    );
  }

  public showLabStudyNote(data: LabHoverData, clientX: number, clientY: number): void {
    this.renderCardContent(
      data,
      clientX,
      clientY,
      this.markMode ? 'Click 3D object to drop a Study Pin here' : 'Shift+Click or Mark [M] to pin note',
    );
  }

  public hideHover(): void {
    this.currentHover = null;
    this.pinnedTapHover = false;
    this.hoverRing.visible = false;
    this.hoverCard.classList.add('hidden');
  }

  public update(): void {
    if (!this.pointerInside || this.pinnedTapHover) return;
    if (this.activeLab) {
      this.evaluateLabHover();
    } else {
      this.evaluateCircuitHover();
    }
  }

  private handleLabClick(clientX: number, clientY: number, dropPin: boolean): boolean {
    if (!this.activeLab) return false;
    const hit = this.raycastLab(clientX, clientY);
    if (!hit) return false;
    const data = this.activeLab.inspectHit(hit.object, hit.point);
    if (!data) return false;

    if (dropPin) {
      this.callbacks.onDropWorldPin(
        this.activeLab.topicId,
        this.activeLab.getActiveChapterId(),
        data.key,
        hit.point.x,
        hit.point.y,
        hit.point.z,
        data.title,
        data.simple,
      );
      return true;
    }

    this.renderCardContent(data, clientX, clientY, 'Tap Mark [M] to pin this object');
    return true;
  }

  private raycastLab(clientX: number, clientY: number): THREE.Intersection | null {
    if (!this.activeLab) return null;
    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.sceneManager.camera);
    const hits = this.raycaster.intersectObjects(this.activeLab.getHitTargets(), true);
    return hits.find((h) => h.distance >= 0.4) ?? null;
  }

  private evaluateLabHover(): void {
    if (!this.activeLab) return;
    this.hoverRing.visible = false;
    const hit = this.raycastLab(this.pointerClientX, this.pointerClientY);
    if (!hit) {
      this.hideHover();
      return;
    }
    const data = this.activeLab.inspectHit(hit.object, hit.point);
    if (!data) {
      this.hideHover();
      return;
    }
    this.renderCardContent(
      data,
      this.pointerClientX,
      this.pointerClientY,
      this.markMode ? 'Click to drop a Study Pin here' : 'Shift + Click (or [M]) to pin a note here',
    );
  }

  private evaluateCircuitHover(): boolean {
    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    this.ndc.x = ((this.pointerClientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((this.pointerClientY - rect.top) / rect.height) * 2 + 1;

    // 1. Check proximity to Hero Electron on screen
    this.tmpProj.copy(this.engineRef.worldPos[0]).project(this.sceneManager.camera);
    if (this.tmpProj.z < 1) {
      const heroPx = rect.left + (this.tmpProj.x * 0.5 + 0.5) * rect.width;
      const heroPy = rect.top + (-this.tmpProj.y * 0.5 + 0.5) * rect.height;
      if (Math.hypot(this.pointerClientX - heroPx, this.pointerClientY - heroPy) < 26) {
        const s = this.engineRef.s[0];
        this.hoverRing.visible = false;
        this.showExternalStudyNote('hero', this.pointerClientX, this.pointerClientY, s);
        return true;
      }
    }

    // 2. Raycast circuit hardware targets, respecting cutaway clipping plane
    this.raycaster.setFromCamera(this.ndc, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.meshesRef.getHitTargets(), false);
    const clipPlane = this.meshesRef.clipPlane;
    let validPoint: THREE.Vector3 | null = null;
    for (const hit of intersects) {
      if (hit.distance < 0.45) continue;
      if (clipPlane.distanceToPoint(hit.point) < -0.02) continue;
      validPoint = hit.point;
      break;
    }

    if (!validPoint) {
      this.hideHover();
      return false;
    }

    const s = this.pathRef.findNearestS(validPoint);
    const frame = this.pathRef.sampleFrame(s);
    const sampled = this.circuitRef.sampleAtS(s);

    let kind: HoverTargetKind = sampled.segment.kind;
    if (kind === 'wire' && frame.curvature > 0.12) {
      kind = 'corner';
    }

    this.hoverRing.visible = true;
    this.tmpBasis.makeBasis(frame.normal, frame.binormal, frame.tangent);
    this.hoverRing.position.copy(frame.pos);
    this.hoverRing.quaternion.setFromRotationMatrix(this.tmpBasis);
    const rScale = frame.tubeRadius * 1.12;
    this.hoverRing.scale.set(rScale, rScale, 1);

    this.showExternalStudyNote(kind, this.pointerClientX, this.pointerClientY, s);
    return true;
  }

  private renderCardContent(
    data: LabHoverData,
    clientX: number,
    clientY: number,
    actionHint: string,
  ): void {
    const deeperHtml = !this.simpleMode
      ? `<p class="hover-note-deeper">${data.deeper}</p>`
      : '';
    const metricsHtml = data.metrics.map((m) => `<span>${m}</span>`).join('');

    this.hoverCard.innerHTML = `
      <div class="hover-note-head">
        <div class="hover-head-row">
          <span class="hover-note-badge" style="color:${data.accent};border-color:${data.accent}55">${data.badge}</span>
          <button id="hover-close-btn" class="hover-close-btn" aria-label="Close note">✕</button>
        </div>
        <strong class="hover-note-title">${data.title}</strong>
      </div>
      <p class="hover-note-body">${data.simple}</p>
      ${deeperHtml}
      <div class="hover-note-metrics">${metricsHtml}</div>
      <div class="hover-note-hint">${actionHint}</div>
    `;
    this.hoverCard.style.borderColor = `${data.accent}66`;
    this.hoverCard.classList.remove('hidden');

    document.getElementById('hover-close-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.hideHover();
    });

    if (window.innerWidth <= 900) {
      this.hoverCard.style.left = '50%';
      this.hoverCard.style.top = '68px';
      this.hoverCard.style.transform = 'translateX(-50%)';
      return;
    }

    this.hoverCard.style.transform = 'none';
    const pad = 16;
    const cardW = 300;
    const cardH = this.hoverCard.offsetHeight || 160;
    let left = clientX + 18;
    let top = clientY + 18;
    if (left + cardW > window.innerWidth - pad) {
      left = clientX - cardW - 18;
    }
    if (top + cardH > window.innerHeight - pad) {
      top = clientY - cardH - 18;
    }
    left = Math.max(pad, Math.min(window.innerWidth - cardW - pad, left));
    top = Math.max(68, Math.min(window.innerHeight - cardH - pad, top));

    this.hoverCard.style.left = `${Math.round(left)}px`;
    this.hoverCard.style.top = `${Math.round(top)}px`;
  }

  public dispose(): void {
    this.hoverRing.geometry.dispose();
    this.hoverRingMat.dispose();
  }
}
