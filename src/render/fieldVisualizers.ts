import * as THREE from 'three';
import type { CircuitState, SimParams } from '../types/simulation';
import { CircuitModel } from '../physics/circuitModel';
import { PathGeometry } from '../physics/pathGeometry';

interface EArrowSite {
  s: number;
  u: number;
  v: number;
  isChemArrow: boolean;
}

interface SurfaceChargeSite {
  s: number;
  theta: number;
  pos: THREE.Vector3;
  curvature: number;
}

interface BFieldRingSite {
  s: number;
  radius: number;
}

/**
 * Renders all 5 toggleable first-principles physics overlays:
 * 1. Electric Field Vectors (E) & Battery F_chem vectors
 * 2. Surface Charge Rings (+/- sigma, including corner dipole bias)
 * 3. Electrostatic Potential Energy Landscape (U = -eV)
 * 4. Magnetic Field Rings (B) + Inductor Back-EMF arrows (E_ind)
 */
export class FieldVisualizers {
  public readonly group = new THREE.Group();

  private path!: PathGeometry;

  // 1. Electric field arrows
  private eShaftMesh!: THREE.InstancedMesh;
  private eHeadMesh!: THREE.InstancedMesh;
  private eSites: EArrowSite[] = [];

  // 2. Surface charge spheres
  private sigmaMesh!: THREE.InstancedMesh;
  private sigmaSites: SurfaceChargeSite[] = [];

  // 3. Potential energy landscape ribbon
  private potentialGroup = new THREE.Group();
  private potentialMesh!: THREE.Mesh;
  private potentialPosAttr!: THREE.BufferAttribute;
  private potentialColAttr!: THREE.BufferAttribute;
  private potentialTopLine!: THREE.LineLoop;
  private potentialTopAttr!: THREE.BufferAttribute;
  private potentialSValues: number[] = [];

  // 4. Magnetic field rings + inductor flux & back-EMF
  private bGroup = new THREE.Group();
  private bRingMesh!: THREE.InstancedMesh;
  private bRingHeadMesh!: THREE.InstancedMesh;
  private bSites: BFieldRingSite[] = [];
  private fluxLoopLines: THREE.LineLoop[] = [];
  private fluxLoopMats: THREE.LineBasicMaterial[] = [];
  private indEmfShafts: THREE.InstancedMesh | null = null;
  private indEmfHeads: THREE.InstancedMesh | null = null;
  private indEmfS: number[] = [];
  private bPhase = 0;

  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpCol = new THREE.Color();

  private readonly violetCol = new THREE.Color(0xa855f7);
  private readonly magentaCol = new THREE.Color(0xec4899);
  private readonly chemCol = new THREE.Color(0x10b981);
  private readonly cobaltCol = new THREE.Color(0x3b82f6);
  private readonly neutralCol = new THREE.Color(0x1e293b);
  private readonly crimsonCol = new THREE.Color(0xef4444);
  private readonly lowUCol = new THREE.Color(0x6366f1);
  private readonly highUCol = new THREE.Color(0x00f0ff);
  private readonly backEmfCol = new THREE.Color(0xf59e0b);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(path: PathGeometry, circuit: CircuitModel) {
    this.group.add(this.potentialGroup);
    this.group.add(this.bGroup);
    this.rebuild(path, circuit);
  }

  public rebuild(path: PathGeometry, circuit: CircuitModel): void {
    this.clear();
    this.path = path;

    this.buildElectricFieldInstances(path, circuit);
    this.buildSurfaceChargeInstances(path);
    this.buildPotentialLandscape(path);
    this.buildMagneticFieldInstances(path);
  }

  private track<T extends { dispose: () => void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      if (child !== this.potentialGroup && child !== this.bGroup) {
        this.group.remove(child);
      }
    }
    while (this.potentialGroup.children.length > 0) {
      this.potentialGroup.remove(this.potentialGroup.children[0]);
    }
    while (this.bGroup.children.length > 0) {
      this.bGroup.remove(this.bGroup.children[0]);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.eSites = [];
    this.sigmaSites = [];
    this.bSites = [];
    this.fluxLoopLines = [];
    this.fluxLoopMats = [];
    this.indEmfShafts = null;
    this.indEmfHeads = null;
    this.indEmfS = [];
    this.potentialSValues = [];
  }

  private buildElectricFieldInstances(path: PathGeometry, circuit: CircuitModel): void {
    const sites: EArrowSite[] = [];
    const a = path.anchors;

    for (const seg of circuit.getSegments()) {
      const span = seg.sEnd - seg.sStart;
      if (seg.kind === 'battery') {
        // Internal E_int arrows + parallel F_chem arrows
        for (let k = 0; k < 10; k++) {
          const s = seg.sStart + ((k + 0.5) / 10) * span;
          sites.push({ s, u: 0.42, v: 0.35, isChemArrow: false });
          sites.push({ s, u: -0.42, v: -0.35, isChemArrow: true });
        }
      } else if (seg.kind === 'resistor' || seg.kind === 'resistor2') {
        const count = 24;
        for (let k = 0; k < count; k++) {
          const s = seg.sStart + ((k + 0.5) / count) * span;
          const angle = (k * 2.39996) % (Math.PI * 2);
          const rad = k % 3 === 0 ? 0 : 0.42;
          sites.push({ s, u: rad * Math.cos(angle), v: rad * Math.sin(angle), isChemArrow: false });
        }
      } else if (seg.kind === 'capacitor') {
        const gs = a.capGapStart ?? seg.sStart;
        const ge = a.capGapEnd ?? seg.sEnd;
        const gSpan = ge - gs;
        // Dense grid of electric field vectors piercing dielectric gap
        for (let rIdx = 0; rIdx < 3; rIdx++) {
          const s = gs + ((rIdx + 0.5) / 3) * gSpan;
          sites.push({ s, u: 0, v: 0, isChemArrow: false });
          for (let ring = 0; ring < 6; ring++) {
            const ang = (2 * Math.PI * ring) / 6;
            sites.push({
              s,
              u: 1.05 * Math.cos(ang),
              v: 1.05 * Math.sin(ang),
              isChemArrow: false,
            });
          }
        }
      } else {
        const count = Math.max(4, Math.round(span / 0.9));
        for (let k = 0; k < count; k++) {
          const s = seg.sStart + ((k + 0.5) / count) * span;
          sites.push({ s, u: 0, v: 0.55, isChemArrow: false });
        }
      }
    }

    this.eSites = sites;

    const shaftGeom = this.track(new THREE.CylinderGeometry(0.03, 0.03, 1, 8));
    shaftGeom.rotateX(Math.PI * 0.5);
    shaftGeom.translate(0, 0, 0.5);

    const headGeom = this.track(new THREE.ConeGeometry(0.085, 0.24, 10));
    headGeom.rotateX(Math.PI * 0.5);

    const mat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.eShaftMesh = new THREE.InstancedMesh(shaftGeom, mat, sites.length);
    this.eHeadMesh = new THREE.InstancedMesh(headGeom, mat, sites.length);
    this.eShaftMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eHeadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eShaftMesh.frustumCulled = false;
    this.eHeadMesh.frustumCulled = false;

    for (let i = 0; i < sites.length; i++) {
      this.eShaftMesh.setColorAt(i, this.violetCol);
      this.eHeadMesh.setColorAt(i, this.violetCol);
    }

    this.group.add(this.eShaftMesh, this.eHeadMesh);
  }

  private buildSurfaceChargeInstances(path: PathGeometry): void {
    const a = path.anchors;
    const samples = path.getUniformSamples();
    const numRings = 112;
    const perRing = 8;
    const sites: SurfaceChargeSite[] = [];

    for (let r = 0; r < numRings; r++) {
      const s = (r / numRings) * path.totalLength;
      if (
        a.capGapStart !== null &&
        a.capGapEnd !== null &&
        s > a.capGapStart - 0.1 &&
        s < a.capGapEnd + 0.1
      ) {
        continue;
      }
      const frame = path.sampleFrame(s);
      const rad = frame.tubeRadius + 0.17;
      for (let k = 0; k < perRing; k++) {
        const theta = (2 * Math.PI * k) / perRing;
        const pos = frame.pos
          .clone()
          .addScaledVector(frame.normal, rad * Math.cos(theta))
          .addScaledVector(frame.binormal, rad * Math.sin(theta));
        sites.push({
          s,
          theta,
          pos,
          curvature: frame.curvature,
        });
      }
    }

    void samples;
    this.sigmaSites = sites;

    const geom = this.track(new THREE.SphereGeometry(0.082, 8, 8));
    const mat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.sigmaMesh = new THREE.InstancedMesh(geom, mat, sites.length);
    this.sigmaMesh.frustumCulled = false;

    this.tmpQuat.identity();
    this.tmpScale.set(1, 1, 1);
    for (let i = 0; i < sites.length; i++) {
      this.tmpMat.compose(sites[i].pos, this.tmpQuat, this.tmpScale);
      this.sigmaMesh.setMatrixAt(i, this.tmpMat);
      this.sigmaMesh.setColorAt(i, this.neutralCol);
    }
    this.sigmaMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.sigmaMesh);
  }

  private buildPotentialLandscape(path: PathGeometry): void {
    const count = 300;
    const positions = new Float32Array((count + 1) * 2 * 3);
    const colors = new Float32Array((count + 1) * 2 * 3);
    const topPos = new Float32Array(count * 3);
    const indices: number[] = [];

    this.potentialSValues = new Array<number>(count + 1);
    for (let i = 0; i <= count; i++) {
      this.potentialSValues[i] = ((i % count) / count) * path.totalLength;
    }

    for (let i = 0; i < count; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geom = this.track(new THREE.BufferGeometry());
    this.potentialPosAttr = new THREE.BufferAttribute(positions, 3);
    this.potentialPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.potentialColAttr = new THREE.BufferAttribute(colors, 3);
    this.potentialColAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', this.potentialPosAttr);
    geom.setAttribute('color', this.potentialColAttr);
    geom.setIndex(indices);

    const mat = this.track(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.potentialMesh = new THREE.Mesh(geom, mat);
    this.potentialGroup.add(this.potentialMesh);

    const lineGeom = this.track(new THREE.BufferGeometry());
    this.potentialTopAttr = new THREE.BufferAttribute(topPos, 3);
    this.potentialTopAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeom.setAttribute('position', this.potentialTopAttr);
    const lineMat = this.track(
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.potentialTopLine = new THREE.LineLoop(lineGeom, lineMat);
    this.potentialGroup.add(this.potentialTopLine);
  }

  private buildMagneticFieldInstances(path: PathGeometry): void {
    const a = path.anchors;
    const numRings = 56;
    const sites: BFieldRingSite[] = [];
    for (let i = 0; i < numRings; i++) {
      const s = ((i + 0.5) / numRings) * path.totalLength;
      if (
        a.capGapStart !== null &&
        a.capGapEnd !== null &&
        s > a.capGapStart - 0.15 &&
        s < a.capGapEnd + 0.15
      ) {
        continue;
      }
      const frame = path.sampleFrame(s);
      sites.push({ s, radius: frame.tubeRadius + 0.45 });
    }
    this.bSites = sites;

    const ringGeom = this.track(new THREE.TorusGeometry(1, 0.024, 8, 28));
    const ringMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.55,
      }),
    );
    this.bRingMesh = new THREE.InstancedMesh(ringGeom, ringMat, sites.length);
    this.bRingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bRingMesh.frustumCulled = false;
    this.bGroup.add(this.bRingMesh);

    const headGeom = this.track(new THREE.ConeGeometry(0.068, 0.2, 8));
    headGeom.rotateX(Math.PI * 0.5);
    const headMat = this.track(new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
    this.bRingHeadMesh = new THREE.InstancedMesh(headGeom, headMat, sites.length);
    this.bRingHeadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bRingHeadMesh.frustumCulled = false;
    this.bGroup.add(this.bRingHeadMesh);

    // Inductor solenoidal magnetic flux loops + induced back-EMF arrows (RLC)
    if (a.inductorStart !== null && a.inductorEnd !== null) {
      const loopCount = 6;
      for (let k = 0; k < loopCount; k++) {
        const ang = (2 * Math.PI * k) / loopCount;
        const rx = 1.15 * Math.cos(ang);
        const ry = 1.15 * Math.sin(ang);
        // Closed flux loop passing down coil core at (-16, 0, z) and returning outside coil
        const pts: THREE.Vector3[] = [];
        const zSpan = 7.4;
        const returnR = 4.3;
        for (let j = 0; j < 24; j++) {
          const z = zSpan - (2 * zSpan * j) / 23;
          pts.push(new THREE.Vector3(-16 + rx * 0.45, ry * 0.45, z));
        }
        for (let j = 0; j < 24; j++) {
          const t = j / 23;
          const z = -zSpan + 2 * zSpan * t;
          const arch = Math.sin(t * Math.PI);
          pts.push(
            new THREE.Vector3(
              -16 + Math.cos(ang) * (0.5 + returnR * arch),
              Math.sin(ang) * (0.5 + returnR * arch),
              z,
            ),
          );
        }
        const geom = this.track(new THREE.BufferGeometry().setFromPoints(pts));
        const mat = this.track(
          new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.0,
          }),
        );
        const line = new THREE.LineLoop(geom, mat);
        this.bGroup.add(line);
        this.fluxLoopLines.push(line);
        this.fluxLoopMats.push(mat);
      }

      // Induced back-EMF arrows along coil
      const indSpan = a.inductorEnd - a.inductorStart;
      for (let k = 0; k < 12; k++) {
        this.indEmfS.push(a.inductorStart + ((k + 0.5) / 12) * indSpan);
      }
      const shaftGeom = this.track(new THREE.CylinderGeometry(0.036, 0.036, 1, 8));
      shaftGeom.rotateX(Math.PI * 0.5);
      shaftGeom.translate(0, 0, 0.5);
      const headGeom = this.track(new THREE.ConeGeometry(0.1, 0.28, 10));
      headGeom.rotateX(Math.PI * 0.5);
      const emfMat = this.track(new THREE.MeshBasicMaterial({ color: this.backEmfCol }));
      this.indEmfShafts = new THREE.InstancedMesh(shaftGeom, emfMat, this.indEmfS.length);
      this.indEmfHeads = new THREE.InstancedMesh(headGeom, emfMat, this.indEmfS.length);
      this.indEmfShafts.frustumCulled = false;
      this.indEmfHeads.frustumCulled = false;
      this.bGroup.add(this.indEmfShafts, this.indEmfHeads);
    }
  }

  public update(
    dt: number,
    circuit: CircuitModel,
    state: CircuitState,
    params: SimParams,
  ): void {
    const frame = this.path.sampleFrame(0);

    // 1. Electric Field Vectors
    this.eShaftMesh.visible = params.layers.electricField;
    this.eHeadMesh.visible = params.layers.electricField;
    if (params.layers.electricField) {
      for (let i = 0; i < this.eSites.length; i++) {
        const site = this.eSites[i];
        const sampled = circuit.sampleAtS(site.s);
        this.path.sampleFrame(site.s, frame);

        const fieldVal = site.isChemArrow ? sampled.f_chem : sampled.E_axial;
        const mag = Math.abs(fieldVal);
        if (mag < 1e-6) {
          this.tmpScale.set(0, 0, 0);
          this.tmpMat.compose(frame.pos, this.tmpQuat.identity(), this.tmpScale);
          this.eShaftMesh.setMatrixAt(i, this.tmpMat);
          this.eHeadMesh.setMatrixAt(i, this.tmpMat);
          continue;
        }

        // Logarithmic visual scaling so mV/m copper field and 100+ V/m resistor field are both legible
        const lenNorm = Math.min(1, Math.log10(1 + mag * 180) / 4.2);
        const arrowLen = 0.22 + lenNorm * 0.95;

        this.tmpDir.copy(frame.tangent).multiplyScalar(fieldVal >= 0 ? 1 : -1);
        this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);

        this.tmpVec
          .copy(frame.pos)
          .addScaledVector(frame.normal, site.u)
          .addScaledVector(frame.binormal, site.v)
          .addScaledVector(this.tmpDir, -arrowLen * 0.5);

        this.tmpScale.set(0.85 + lenNorm * 0.35, 0.85 + lenNorm * 0.35, arrowLen);
        this.tmpMat.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        this.eShaftMesh.setMatrixAt(i, this.tmpMat);

        this.tmpVec.addScaledVector(this.tmpDir, arrowLen + 0.08);
        this.tmpScale.set(0.85 + lenNorm * 0.45, 0.85 + lenNorm * 0.45, 0.85 + lenNorm * 0.45);
        this.tmpMat.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        this.eHeadMesh.setMatrixAt(i, this.tmpMat);

        if (site.isChemArrow) {
          this.tmpCol.copy(this.chemCol).multiplyScalar(1.2);
        } else {
          this.tmpCol.copy(this.violetCol).lerp(this.magentaCol, lenNorm);
          this.tmpCol.multiplyScalar(0.8 + lenNorm * 0.9);
        }
        this.eShaftMesh.setColorAt(i, this.tmpCol);
        this.eHeadMesh.setColorAt(i, this.tmpCol);
      }
      this.eShaftMesh.instanceMatrix.needsUpdate = true;
      this.eHeadMesh.instanceMatrix.needsUpdate = true;
      if (this.eShaftMesh.instanceColor) this.eShaftMesh.instanceColor.needsUpdate = true;
      if (this.eHeadMesh.instanceColor) this.eHeadMesh.instanceColor.needsUpdate = true;
    }

    // 2. Surface Charge Rings
    this.sigmaMesh.visible = params.layers.surfaceCharge;
    if (params.layers.surfaceCharge) {
      const flowSign = Math.abs(state.current) > 1e-5 ? Math.sign(state.current) : 0;
      for (let i = 0; i < this.sigmaSites.length; i++) {
        const site = this.sigmaSites[i];
        const sampled = circuit.sampleAtS(site.s);
        // Corner dipole bias: outer wall (+N) gathers excess negative charge to steer electrons inward (-N)
        const cornerBias = -0.55 * site.curvature * Math.cos(site.theta) * flowSign;
        const sigmaLocal = Math.max(-1, Math.min(1, sampled.sigma + cornerBias));

        if (sigmaLocal >= 0) {
          this.tmpCol.copy(this.neutralCol).lerp(this.crimsonCol, sigmaLocal);
        } else {
          this.tmpCol.copy(this.neutralCol).lerp(this.cobaltCol, -sigmaLocal);
        }
        const boost = 0.65 + 0.65 * Math.abs(sigmaLocal);
        this.tmpCol.multiplyScalar(boost);
        this.sigmaMesh.setColorAt(i, this.tmpCol);
      }
      if (this.sigmaMesh.instanceColor) this.sigmaMesh.instanceColor.needsUpdate = true;
    }

    // 3. Electrostatic Potential Energy Landscape (U = -eV)
    this.potentialGroup.visible = params.layers.potentialLandscape;
    if (params.layers.potentialLandscape) {
      let minU = Infinity;
      let maxU = -Infinity;
      const count = this.potentialSValues.length - 1;
      const uArr = new Float32Array(count + 1);
      for (let i = 0; i <= count; i++) {
        const uVal = circuit.sampleAtS(this.potentialSValues[i]).localU_eV;
        uArr[i] = uVal;
        if (uVal < minU) minU = uVal;
        if (uVal > maxU) maxU = uVal;
      }
      const uSpan = Math.max(0.25, maxU - minU);
      const posArr = this.potentialPosAttr.array as Float32Array;
      const colArr = this.potentialColAttr.array as Float32Array;
      const topArr = this.potentialTopAttr.array as Float32Array;
      const baseY = -2.2;

      for (let i = 0; i <= count; i++) {
        this.path.sampleFrame(this.potentialSValues[i], frame);
        const normU = (uArr[i] - minU) / uSpan;
        const h = 0.25 + normU * 4.2;

        const botIdx = i * 6;
        const topIdx = botIdx + 3;

        posArr[botIdx] = frame.pos.x;
        posArr[botIdx + 1] = baseY;
        posArr[botIdx + 2] = frame.pos.z;

        posArr[topIdx] = frame.pos.x;
        posArr[topIdx + 1] = baseY + h;
        posArr[topIdx + 2] = frame.pos.z;

        if (i < count) {
          topArr[i * 3] = frame.pos.x;
          topArr[i * 3 + 1] = baseY + h;
          topArr[i * 3 + 2] = frame.pos.z;
        }

        this.tmpCol.copy(this.lowUCol).lerp(this.highUCol, normU);
        colArr[botIdx] = this.tmpCol.r * 0.25;
        colArr[botIdx + 1] = this.tmpCol.g * 0.25;
        colArr[botIdx + 2] = this.tmpCol.b * 0.25;
        colArr[topIdx] = this.tmpCol.r;
        colArr[topIdx + 1] = this.tmpCol.g;
        colArr[topIdx + 2] = this.tmpCol.b;
      }

      this.potentialPosAttr.needsUpdate = true;
      this.potentialColAttr.needsUpdate = true;
      this.potentialTopAttr.needsUpdate = true;
    }

    // 4. Magnetic Field Rings & Inductor Flux/Back-EMF
    const showB = params.layers.magneticField;
    const absI = Math.abs(state.current);
    this.bGroup.visible = showB;
    if (showB) {
      const ringVisible = absI > 1e-4;
      this.bRingMesh.visible = ringVisible;
      this.bRingHeadMesh.visible = ringVisible;
      if (ringVisible) {
        const curlSign = state.current >= 0 ? -1 : 1; // right-hand rule for conventional current along -T
        const spinSpeed = Math.max(0.5, Math.min(5.5, absI * 4.2)) * curlSign;
        this.bPhase += dt * spinSpeed;
        const radScale = Math.min(1.45, 0.8 + Math.log10(1 + absI * 5) * 0.55);

        for (let i = 0; i < this.bSites.length; i++) {
          const site = this.bSites[i];
          this.path.sampleFrame(site.s, frame);
          this.tmpMat.makeBasis(frame.normal, frame.binormal, frame.tangent);
          this.tmpQuat.setFromRotationMatrix(this.tmpMat);

          const phi = this.bPhase + i * 0.35;
          const r = site.radius * radScale;
          this.tmpScale.set(r, r, 1);
          this.tmpMat.compose(frame.pos, this.tmpQuat, this.tmpScale);
          this.bRingMesh.setMatrixAt(i, this.tmpMat);

          // Position directional curl cone on ring and orient along B curl direction
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);
          this.tmpVec
            .copy(frame.pos)
            .addScaledVector(frame.normal, r * cosP)
            .addScaledVector(frame.binormal, r * sinP);
          this.tmpDir
            .set(0, 0, 0)
            .addScaledVector(frame.normal, -sinP * curlSign)
            .addScaledVector(frame.binormal, cosP * curlSign)
            .normalize();
          this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);
          this.tmpScale.set(1, 1, 1);
          this.tmpMat.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
          this.bRingHeadMesh.setMatrixAt(i, this.tmpMat);
        }
        this.bRingMesh.instanceMatrix.needsUpdate = true;
        this.bRingHeadMesh.instanceMatrix.needsUpdate = true;
      }

      // Inductor solenoidal flux loops
      const fluxOpacity = Math.min(0.85, Math.log10(1 + absI * 10) * 0.65);
      for (const mat of this.fluxLoopMats) {
        mat.opacity = fluxOpacity;
      }

      // Inductor induced back-EMF arrows proportional to dI/dt
      if (this.indEmfShafts && this.indEmfHeads) {
        const backEmfMag = Math.abs(state.inductorBackEmf);
        const showEmf = backEmfMag > 0.02;
        this.indEmfShafts.visible = showEmf;
        this.indEmfHeads.visible = showEmf;
        if (showEmf) {
          const lenNorm = Math.min(1, backEmfMag / 6.0);
          const arrowLen = 0.35 + lenNorm * 1.1;
          // When dI/dt > 0 (conventional I growing along -T), E_ind = -dA/dt points along +T
          const dirSign = state.dIdt >= 0 ? 1 : -1;

          for (let i = 0; i < this.indEmfS.length; i++) {
            this.path.sampleFrame(this.indEmfS[i], frame);
            this.tmpDir.copy(frame.tangent).multiplyScalar(dirSign);
            this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);

            this.tmpVec.copy(frame.pos).addScaledVector(this.tmpDir, -arrowLen * 0.5);
            this.tmpScale.set(1, 1, arrowLen);
            this.tmpMat.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
            this.indEmfShafts.setMatrixAt(i, this.tmpMat);

            this.tmpVec.addScaledVector(this.tmpDir, arrowLen + 0.1);
            this.tmpScale.set(1, 1, 1);
            this.tmpMat.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
            this.indEmfHeads.setMatrixAt(i, this.tmpMat);
          }
          this.indEmfShafts.instanceMatrix.needsUpdate = true;
          this.indEmfHeads.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  public dispose(): void {
    this.clear();
  }
}
