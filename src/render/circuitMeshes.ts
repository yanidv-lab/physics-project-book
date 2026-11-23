import * as THREE from 'three';
import type { CircuitState, SimParams } from '../types/simulation';
import { PathGeometry } from '../physics/pathGeometry';
import { CircuitModel } from '../physics/circuitModel';
import { createRadialGlowTexture, createSymbolBadgeTexture } from './visualAssets';

const FRESNEL_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRESNEL_FRAGMENT_SHADER = `
  uniform vec3 uClipNormal;
  uniform float uClipConstant;
  uniform float uTime;
  uniform float uFlowSign;
  uniform float uFlowIntensity;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    if (dot(vWorldPos, uClipNormal) + uClipConstant < 0.0) {
      discard;
    }

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndotv = abs(dot(normalize(vWorldNormal), viewDir));
    float fresnel = pow(clamp(1.0 - ndotv, 0.0, 1.0), 2.35);

    float wave = 0.5 + 0.5 * sin(vUv.x * 180.0 - uTime * 3.8 * uFlowSign);
    vec3 baseCol = vec3(0.08, 0.16, 0.29);
    vec3 rimCol = vec3(0.14, 0.72, 0.96);
    vec3 pulseCol = vec3(0.0, 0.55, 0.75) * wave * uFlowIntensity;

    vec3 color = mix(baseCol, rimCol, fresnel) + pulseCol * (0.28 + 0.5 * fresnel);
    float alpha = clamp(0.032 + fresnel * 0.34 + wave * uFlowIntensity * 0.045, 0.03, 0.52);

    gl_FragColor = vec4(color, alpha);
  }
`;

interface ResistorVisual {
  id: string;
  material: THREE.MeshStandardMaterial;
  coreMaterial: THREE.MeshBasicMaterial;
}

interface EscalatorRing {
  mesh: THREE.Mesh;
  phaseOffset: number;
}

interface DisplacementWave {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  phaseOffset: number;
}

/**
 * Builds and animates the 3D Fresnel-glass conductor tunnel, battery EMF escalator,
 * constricted resistor housings, parallel-plate capacitor + displacement waves,
 * and helical inductor core.
 */
export class CircuitMeshes {
  public readonly group = new THREE.Group();
  public readonly clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);

  private readonly fresnelUniforms = {
    uClipNormal: { value: new THREE.Vector3(0, 1, 0) },
    uClipConstant: { value: 1e6 },
    uTime: { value: 0 },
    uFlowSign: { value: 1 },
    uFlowIntensity: { value: 0 },
  };

  private path!: PathGeometry;
  private hitTargets: THREE.Object3D[] = [];
  private resistorVisuals: ResistorVisual[] = [];
  private escalatorRings: EscalatorRing[] = [];
  private escalatorPhase = 0;

  private capNegHaloMat: THREE.MeshBasicMaterial | null = null;
  private capPosHaloMat: THREE.MeshBasicMaterial | null = null;
  private capNegCoronaMat: THREE.SpriteMaterial | null = null;
  private capPosCoronaMat: THREE.SpriteMaterial | null = null;
  private displacementWaves: DisplacementWave[] = [];
  private displacementPhase = 0;
  private capGapStart = 0;
  private capGapEnd = 0;

  private inductorCoreMat: THREE.MeshStandardMaterial | null = null;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(path: PathGeometry, circuit: CircuitModel) {
    this.rebuild(path, circuit);
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public setCutawayPlane(active: boolean, normal?: THREE.Vector3, pointOnPlane?: THREE.Vector3): void {
    if (!active || !normal || !pointOnPlane) {
      this.clipPlane.normal.set(0, 1, 0);
      this.clipPlane.constant = 1e6;
    } else {
      this.clipPlane.setFromNormalAndCoplanarPoint(normal, pointOnPlane);
    }
    this.fresnelUniforms.uClipNormal.value.copy(this.clipPlane.normal);
    this.fresnelUniforms.uClipConstant.value = this.clipPlane.constant;
  }

  public rebuild(path: PathGeometry, circuit: CircuitModel): void {
    this.clear();
    this.path = path;

    this.buildConductorShell(path);
    this.buildGuideRails(path);
    this.buildBatteryAssembly(path);
    this.buildResistors(path, circuit);
    this.buildCapacitorAssembly(path);
    this.buildInductorCore(path);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.hitTargets = [];
    this.resistorVisuals = [];
    this.escalatorRings = [];
    this.displacementWaves = [];
    this.capNegHaloMat = null;
    this.capPosHaloMat = null;
    this.capNegCoronaMat = null;
    this.capPosCoronaMat = null;
    this.inductorCoreMat = null;
  }

  private isInGap(s: number, path: PathGeometry): boolean {
    const a = path.anchors;
    return (
      a.capGapStart !== null &&
      a.capGapEnd !== null &&
      s > a.capGapStart &&
      s < a.capGapEnd
    );
  }

  private buildConductorShell(path: PathGeometry): void {
    const samples = path.getUniformSamples();
    const N = samples.length;
    const radialSegs = 24;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= N; i++) {
      const samp = samples[i % N];
      const uFrac = i / N;
      for (let j = 0; j <= radialSegs; j++) {
        const theta = (2 * Math.PI * j) / radialSegs;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);

        const nx = samp.normal.x * cos + samp.binormal.x * sin;
        const ny = samp.normal.y * cos + samp.binormal.y * sin;
        const nz = samp.normal.z * cos + samp.binormal.z * sin;

        const r = samp.tubeRadius;
        positions.push(samp.pos.x + nx * r, samp.pos.y + ny * r, samp.pos.z + nz * r);
        normals.push(nx, ny, nz);
        uvs.push(uFrac, j / radialSegs);
      }
    }

    const ringStride = radialSegs + 1;
    for (let i = 0; i < N; i++) {
      const s0 = samples[i].s;
      const s1 = samples[(i + 1) % N].s;
      if (this.isInGap(s0, path) || this.isInGap(s1, path)) {
        continue;
      }
      for (let j = 0; j < radialSegs; j++) {
        const a = i * ringStride + j;
        const b = (i + 1) * ringStride + j;
        const c = (i + 1) * ringStride + (j + 1);
        const d = i * ringStride + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const geom = this.track(new THREE.BufferGeometry());
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);

    const mat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: FRESNEL_VERTEX_SHADER,
        fragmentShader: FRESNEL_FRAGMENT_SHADER,
        uniforms: this.fresnelUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.hitTargets.push(mesh);
  }

  private buildGuideRails(path: PathGeometry): void {
    const samples = path.getUniformSamples();
    const N = samples.length;
    const railAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    const verts: number[] = [];

    for (const angle of railAngles) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (let i = 0; i < N; i++) {
        const s0 = samples[i];
        const s1 = samples[(i + 1) % N];
        if (this.isInGap(s0.s, path) || this.isInGap(s1.s, path)) continue;
        const r0 = s0.tubeRadius * 1.015;
        const r1 = s1.tubeRadius * 1.015;
        verts.push(
          s0.pos.x + (s0.normal.x * cos + s0.binormal.x * sin) * r0,
          s0.pos.y + (s0.normal.y * cos + s0.binormal.y * sin) * r0,
          s0.pos.z + (s0.normal.z * cos + s0.binormal.z * sin) * r0,
          s1.pos.x + (s1.normal.x * cos + s1.binormal.x * sin) * r1,
          s1.pos.y + (s1.normal.y * cos + s1.binormal.y * sin) * r1,
          s1.pos.z + (s1.normal.z * cos + s1.binormal.z * sin) * r1,
        );
      }
    }

    const geom = this.track(new THREE.BufferGeometry());
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = this.track(
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        clippingPlanes: [this.clipPlane],
      }),
    );
    this.group.add(new THREE.LineSegments(geom, mat));
  }

  private orientObjectToFrame(obj: THREE.Object3D, frame: ReturnType<PathGeometry['sampleFrame']>): void {
    const m = new THREE.Matrix4().makeBasis(frame.normal, frame.binormal, frame.tangent);
    obj.position.copy(frame.pos);
    obj.quaternion.setFromRotationMatrix(m);
  }

  private buildBatteryAssembly(path: PathGeometry): void {
    const { batteryStart, batteryEnd } = path.anchors;
    const batLen = batteryEnd - batteryStart;
    const batMid = 0.5 * (batteryStart + batteryEnd);
    const frameMid = path.sampleFrame(batMid);

    // Translucent emerald-gold EMF chamber cylinder
    const housingGeom = this.track(new THREE.CylinderGeometry(1.78, 1.78, batLen, 32, 1, true));
    housingGeom.rotateX(Math.PI * 0.5);
    const housingMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x065f46,
        emissive: 0x10b981,
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        clippingPlanes: [this.clipPlane],
      }),
    );
    const housing = new THREE.Mesh(housingGeom, housingMat);
    this.orientObjectToFrame(housing, frameMid);
    this.group.add(housing);
    this.hitTargets.push(housing);

    // (+) terminal crimson ring + metallic collar + glowing + badge sprite
    const ringGeom = this.track(new THREE.TorusGeometry(1.8, 0.12, 14, 32));
    const posRingMat = this.track(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    const posFrame = path.sampleFrame(batteryStart + 0.08);
    const posRing = new THREE.Mesh(ringGeom, posRingMat);
    this.orientObjectToFrame(posRing, posFrame);
    this.group.add(posRing);

    const posBadgeMat = this.track(
      new THREE.SpriteMaterial({
        map: createSymbolBadgeTexture('+', 'rgba(127, 29, 29, 0.85)', '#ef4444', '#fecaca'),
        transparent: true,
        depthWrite: false,
      }),
    );
    const posBadge = new THREE.Sprite(posBadgeMat);
    posBadge.position.copy(posFrame.pos).addScaledVector(posFrame.binormal, 2.55);
    posBadge.scale.set(1.15, 1.15, 1);
    this.group.add(posBadge);

    // (-) terminal cobalt ring + glowing - badge sprite
    const negRingMat = this.track(new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    const negFrame = path.sampleFrame(batteryEnd - 0.08);
    const negRing = new THREE.Mesh(ringGeom, negRingMat);
    this.orientObjectToFrame(negRing, negFrame);
    this.group.add(negRing);

    const negBadgeMat = this.track(
      new THREE.SpriteMaterial({
        map: createSymbolBadgeTexture('−', 'rgba(30, 58, 138, 0.85)', '#3b82f6', '#bfdbfe'),
        transparent: true,
        depthWrite: false,
      }),
    );
    const negBadge = new THREE.Sprite(negBadgeMat);
    negBadge.position.copy(negFrame.pos).addScaledVector(negFrame.binormal, 2.55);
    negBadge.scale.set(1.15, 1.15, 1);
    this.group.add(negBadge);

    // Chemical energy escalator chevrons gliding inside from + to -
    const escGeom = this.track(new THREE.TorusGeometry(1.18, 0.058, 8, 28));
    const escMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.78,
      }),
    );
    const count = 6;
    for (let i = 0; i < count; i++) {
      const ring = new THREE.Mesh(escGeom, escMat);
      this.group.add(ring);
      this.escalatorRings.push({
        mesh: ring,
        phaseOffset: i / count,
      });
    }
  }

  private buildResistors(path: PathGeometry, circuit: CircuitModel): void {
    const segs = circuit.getSegments();
    const collarGeom = this.track(new THREE.TorusGeometry(1.38, 0.14, 12, 28));
    const collarMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.75,
        roughness: 0.25,
      }),
    );

    const bandColors = [0xf59e0b, 0xef4444, 0x38bdf8, 0xfbbf24];
    const bandGeom = this.track(new THREE.TorusGeometry(1.14, 0.045, 8, 28));

    for (const seg of segs) {
      if (seg.kind !== 'resistor' && seg.kind !== 'resistor2') continue;
      const len = seg.sEnd - seg.sStart;
      const mid = 0.5 * (seg.sStart + seg.sEnd);
      const frameMid = path.sampleFrame(mid);

      // Constricted ceramic resistor sleeve
      const sleeveGeom = this.track(
        new THREE.CylinderGeometry(seg.tubeRadius * 1.18, seg.tubeRadius * 1.18, len, 28, 1, true),
      );
      sleeveGeom.rotateX(Math.PI * 0.5);
      const sleeveMat = this.track(
        new THREE.MeshStandardMaterial({
          color: 0x292524,
          emissive: 0xff4500,
          emissiveIntensity: 0.15,
          transparent: true,
          opacity: 0.26,
          depthWrite: false,
          side: THREE.DoubleSide,
          clippingPlanes: [this.clipPlane],
        }),
      );
      const sleeve = new THREE.Mesh(sleeveGeom, sleeveMat);
      this.orientObjectToFrame(sleeve, frameMid);
      this.group.add(sleeve);
      this.hitTargets.push(sleeve);

      // Inner glowing thermal plasma sheath
      const coreGeom = this.track(
        new THREE.CylinderGeometry(seg.tubeRadius * 1.04, seg.tubeRadius * 1.04, len * 0.96, 24, 1, true),
      );
      coreGeom.rotateX(Math.PI * 0.5);
      const coreMat = this.track(
        new THREE.MeshBasicMaterial({
          color: 0xff3b30,
          transparent: true,
          opacity: 0.04,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          clippingPlanes: [this.clipPlane],
        }),
      );
      const core = new THREE.Mesh(coreGeom, coreMat);
      this.orientObjectToFrame(core, frameMid);
      this.group.add(core);

      // Precision color-code bands
      for (let b = 0; b < 4; b++) {
        const bMat = this.track(
          new THREE.MeshBasicMaterial({
            color: bandColors[b],
            transparent: true,
            opacity: 0.55,
          }),
        );
        const band = new THREE.Mesh(bandGeom, bMat);
        const sBand = seg.sStart + len * (0.2 + b * 0.2);
        this.orientObjectToFrame(band, path.sampleFrame(sBand));
        this.group.add(band);
      }

      const collarStart = new THREE.Mesh(collarGeom, collarMat);
      this.orientObjectToFrame(collarStart, path.sampleFrame(seg.sStart));
      this.group.add(collarStart);

      const collarEnd = new THREE.Mesh(collarGeom, collarMat);
      this.orientObjectToFrame(collarEnd, path.sampleFrame(seg.sEnd));
      this.group.add(collarEnd);

      this.resistorVisuals.push({
        id: seg.id,
        material: sleeveMat,
        coreMaterial: coreMat,
      });
    }
  }

  private buildCapacitorAssembly(path: PathGeometry): void {
    const { capGapStart, capGapEnd } = path.anchors;
    if (capGapStart === null || capGapEnd === null) return;

    this.capGapStart = capGapStart;
    this.capGapEnd = capGapEnd;
    const gapLen = capGapEnd - capGapStart;
    const gapMid = 0.5 * (capGapStart + capGapEnd);

    const plateGeom = this.track(new THREE.CylinderGeometry(2.18, 2.18, 0.14, 32));
    plateGeom.rotateX(Math.PI * 0.5);

    const plateMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.88,
        roughness: 0.2,
        clippingPlanes: [this.clipPlane],
      }),
    );

    const negFrame = path.sampleFrame(capGapStart);
    const posFrame = path.sampleFrame(capGapEnd);

    const negPlate = new THREE.Mesh(plateGeom, plateMat);
    this.orientObjectToFrame(negPlate, negFrame);
    this.group.add(negPlate);

    const posPlate = new THREE.Mesh(plateGeom, plateMat);
    this.orientObjectToFrame(posPlate, posFrame);
    this.group.add(posPlate);

    // Luminous charge halos on inner faces
    const haloGeom = this.track(new THREE.TorusGeometry(2.08, 0.095, 10, 32));
    this.capNegHaloMat = this.track(
      new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15 }),
    );
    this.capPosHaloMat = this.track(
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.15 }),
    );

    const negHalo = new THREE.Mesh(haloGeom, this.capNegHaloMat);
    this.orientObjectToFrame(negHalo, path.sampleFrame(capGapStart + 0.08));
    this.group.add(negHalo);

    const posHalo = new THREE.Mesh(haloGeom, this.capPosHaloMat);
    this.orientObjectToFrame(posHalo, path.sampleFrame(capGapEnd - 0.08));
    this.group.add(posHalo);

    // Radial charge corona sprites
    this.capNegCoronaMat = this.track(
      new THREE.SpriteMaterial({
        map: createRadialGlowTexture('rgba(96, 165, 250, 0.9)', 'rgba(59, 130, 246, 0.18)'),
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const negCorona = new THREE.Sprite(this.capNegCoronaMat);
    negCorona.position.copy(negFrame.pos);
    negCorona.scale.set(5.4, 5.4, 1);
    this.group.add(negCorona);

    this.capPosCoronaMat = this.track(
      new THREE.SpriteMaterial({
        map: createRadialGlowTexture('rgba(248, 113, 113, 0.9)', 'rgba(239, 68, 68, 0.18)'),
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const posCorona = new THREE.Sprite(this.capPosCoronaMat);
    posCorona.position.copy(posFrame.pos);
    posCorona.scale.set(5.4, 5.4, 1);
    this.group.add(posCorona);

    // Insulating glass dielectric slab
    const dielGeom = this.track(new THREE.CylinderGeometry(2.04, 2.04, Math.max(0.2, gapLen - 0.16), 32));
    dielGeom.rotateX(Math.PI * 0.5);
    const dielMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0369a1,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        clippingPlanes: [this.clipPlane],
      }),
    );
    const diel = new THREE.Mesh(dielGeom, dielMat);
    this.orientObjectToFrame(diel, path.sampleFrame(gapMid));
    this.group.add(diel);
    this.hitTargets.push(diel);

    // Displacement current pulse wavefront rings crossing dielectric gap
    const waveGeom = this.track(new THREE.TorusGeometry(1.38, 0.05, 8, 28));
    for (let i = 0; i < 4; i++) {
      const waveMat = this.track(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0,
        }),
      );
      const wave = new THREE.Mesh(waveGeom, waveMat);
      this.group.add(wave);
      this.displacementWaves.push({
        mesh: wave,
        material: waveMat,
        phaseOffset: i / 4,
      });
    }
  }

  private buildInductorCore(path: PathGeometry): void {
    const { inductorStart, inductorEnd } = path.anchors;
    if (inductorStart === null || inductorEnd === null) return;

    const coreGeom = this.track(new THREE.CylinderGeometry(0.7, 0.7, 13.0, 24));
    coreGeom.rotateX(Math.PI * 0.5);
    this.inductorCoreMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0284c7,
        emissiveIntensity: 0.15,
        metalness: 0.75,
        roughness: 0.32,
      }),
    );
    const core = new THREE.Mesh(coreGeom, this.inductorCoreMat);
    core.position.set(-16, 0, 0);
    this.group.add(core);
  }

  public update(dt: number, state: CircuitState, params: SimParams): void {
    this.fresnelUniforms.uTime.value += dt;
    this.fresnelUniforms.uFlowSign.value = state.current >= 0 ? 1 : -1;
    this.fresnelUniforms.uFlowIntensity.value = Math.min(1, Math.abs(state.current) * 1.4);

    const { batteryStart, batteryEnd } = this.path.anchors;
    const batSpan = batteryEnd - batteryStart;

    // 1. Animate Battery chemical escalator chevrons
    const effectiveV = params.topology === 'rc' && params.rcDischarging ? 0 : state.sourceVoltage;
    const escActive = Math.abs(effectiveV) > 0.05;
    const escDir = effectiveV >= 0 ? 1 : -1;
    this.escalatorPhase = (this.escalatorPhase + dt * 0.45 * escDir * Math.min(2, Math.abs(effectiveV) / 4)) % 1;
    if (this.escalatorPhase < 0) this.escalatorPhase += 1;

    for (const item of this.escalatorRings) {
      item.mesh.visible = escActive;
      if (!escActive) continue;
      const frac = (item.phaseOffset + this.escalatorPhase) % 1;
      const sPos = batteryStart + 0.35 + frac * (batSpan - 0.7);
      this.orientObjectToFrame(item.mesh, this.path.sampleFrame(sPos));
    }

    // 2. Update resistor thermal emissive glow proportional to I^2 R
    for (const rv of this.resistorVisuals) {
      const p = state.segmentFields[rv.id]?.power ?? 0;
      const glow = Math.min(2.2, Math.log10(1 + p * 3.0) * 1.15);
      rv.material.emissiveIntensity = 0.14 + glow;
      rv.coreMaterial.opacity = Math.min(0.32, 0.03 + glow * 0.12);
    }

    // 3. Update capacitor plate halos, coronas & displacement current wavefronts
    if (this.capNegHaloMat && this.capPosHaloMat && this.capNegCoronaMat && this.capPosCoronaMat) {
      const vc = state.capacitorVoltage;
      const mag = Math.min(1, Math.abs(vc) / 8);
      if (vc >= 0) {
        this.capNegHaloMat.color.setHex(0x3b82f6);
        this.capPosHaloMat.color.setHex(0xef4444);
        this.capNegCoronaMat.color.setHex(0x3b82f6);
        this.capPosCoronaMat.color.setHex(0xef4444);
      } else {
        this.capNegHaloMat.color.setHex(0xef4444);
        this.capPosHaloMat.color.setHex(0x3b82f6);
        this.capNegCoronaMat.color.setHex(0xef4444);
        this.capPosCoronaMat.color.setHex(0x3b82f6);
      }
      this.capNegHaloMat.opacity = 0.12 + 0.78 * mag;
      this.capPosHaloMat.opacity = 0.12 + 0.78 * mag;
      this.capNegCoronaMat.opacity = 0.06 + 0.45 * mag;
      this.capPosCoronaMat.opacity = 0.06 + 0.45 * mag;

      const cur = state.current;
      const waveAmp = Math.min(1, Math.abs(cur) * 1.8);
      if (waveAmp > 0.02) {
        this.displacementPhase = (this.displacementPhase + dt * 0.9 * Math.sign(cur)) % 1;
        if (this.displacementPhase < 0) this.displacementPhase += 1;
      }
      const gapSpan = Math.max(0.2, this.capGapEnd - this.capGapStart);
      for (const w of this.displacementWaves) {
        w.mesh.visible = waveAmp > 0.02;
        if (!w.mesh.visible) continue;
        const frac = (w.phaseOffset + this.displacementPhase) % 1;
        const sPos = this.capGapStart + 0.15 + frac * (gapSpan - 0.3);
        this.orientObjectToFrame(w.mesh, this.path.sampleFrame(sPos));
        const edgeFade = Math.sin(frac * Math.PI);
        w.material.opacity = waveAmp * edgeFade * 0.88;
      }
    }

    // 4. Inductor ferrite core glow
    if (this.inductorCoreMat) {
      this.inductorCoreMat.emissiveIntensity = 0.12 + Math.min(1.3, Math.abs(state.current) * 0.95);
    }
  }

  public dispose(): void {
    this.clear();
  }
}
