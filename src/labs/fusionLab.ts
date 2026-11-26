import * as THREE from 'three';
import {
  computeIcfYield,
  computeLawsonMetrics,
  computeStellarCore,
  gamowTunnelingFactor,
} from '../physics/fusionPhysics';
import { attachModel } from '../render/modelLibrary';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

interface HelicalIon {
  toroidalAngle: number;
  poloidalPhase: number;
  minorR: number;
  speed: number;
}

interface SolarLoopBead {
  loopIdx: number;
  t: number;
  speed: number;
}

// ---------------- CUSTOM GLSL SHADERS (ENHANCED VOL. XI VISUALS) ----------------

const PLASMA_TORUS_VERT = `
  uniform float uTime;
  uniform float uTwist;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    // Subtle magnetic MHD breathing ripple along the plasma surface
    float ripple = sin(uv.x * 37.699 + uv.y * 12.566 * uTwist - uTime * 5.2) * 0.045;
    vec3 displaced = position + normal * ripple;
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PLASMA_TORUS_FRAG = `
  uniform float uTime;
  uniform float uHeat;
  uniform float uTwist;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Helical magnetic flux filaments racing around the tokamak torus
    float helix1 = sin((vUv.x * 18.0 + vUv.y * 6.0 * uTwist) * 3.14159 - uTime * 6.5);
    float helix2 = sin((vUv.x * 32.0 - vUv.y * 4.0) * 3.14159 + uTime * 4.2);
    float filament = smoothstep(-0.2, 0.95, 0.65 * helix1 + 0.35 * helix2);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 1.9);

    vec3 violet = vec3(0.42, 0.08, 0.85);
    vec3 magenta = vec3(0.98, 0.22, 0.68);
    vec3 whiteHot = vec3(0.95, 0.96, 1.0);

    vec3 coreCol = mix(violet, magenta, clamp(uHeat * 0.75 + filament * 0.45, 0.0, 1.0));
    coreCol = mix(coreCol, whiteHot, clamp((uHeat - 0.55) * 1.4 * filament, 0.0, 0.9));
    vec3 col = coreCol * (0.85 + fresnel * 1.15);
    float alpha = clamp(0.46 + fresnel * 0.48 + filament * 0.16, 0.25, 0.96);
    gl_FragColor = vec4(col, alpha);
  }
`;

const COULOMB_BARRIER_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const COULOMB_BARRIER_FRAG = `
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.8);
    float waves = 0.5 + 0.5 * sin(length(vLocalPos.xy) * 9.0 - uTime * 7.0);
    vec3 col = mix(vec3(0.05, 0.78, 1.0), vec3(0.95, 0.45, 1.0), waves * 0.6 + uPulse * 0.4);
    float alpha = clamp((fresnel * 0.75 + waves * 0.12) * (0.55 + uPulse * 0.65), 0.0, 0.85);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col * (1.0 + uPulse * 0.9), alpha);
  }
`;

const SOLAR_SURFACE_VERT = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vGranule;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.1 + vec3(0.2, -0.15, 0.12);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float g = fbm(normal * 3.6 + vec3(uTime * 0.28, -uTime * 0.22, uTime * 0.16));
    vGranule = g;
    vec3 displaced = position + normal * ((g - 0.5) * 0.22);
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const SOLAR_SURFACE_FRAG = `
  uniform float uTempFactor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vGranule;

  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.3);
    vec3 deepOrange = vec3(0.85, 0.22, 0.02);
    vec3 solarGold = vec3(1.0, 0.68, 0.12);
    vec3 brightCore = mix(vec3(1.0, 0.96, 0.78), vec3(0.78, 0.92, 1.0), clamp((uTempFactor - 1.0) * 0.6, 0.0, 1.0));
    vec3 col = mix(deepOrange, solarGold, smoothstep(0.22, 0.62, vGranule));
    col = mix(col, brightCore, smoothstep(0.58, 0.92, vGranule));
    col += vec3(1.0, 0.55, 0.18) * fresnel * 0.95;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class FusionLab implements LabModule {
  public readonly topicId = 'fusion' as const;
  public readonly group = new THREE.Group();

  private chapterId = 'fus-tokamak';
  private disposables: Array<{ dispose: () => void }> = [];
  private hitTargets: THREE.Object3D[] = [];
  private simTime = 0;

  // Chapter 1: D-T Quantum Tunneling
  private tunnelTempMK = 150;
  private tunnelPhase = 0;
  private deuteriumGroup: THREE.Group | null = null;
  private tritiumGroup: THREE.Group | null = null;
  private heliumGroup: THREE.Group | null = null;
  private fastNeutron: THREE.Mesh | null = null;
  private barrierUniforms: { uTime: { value: number }; uPulse: { value: number } } | null = null;
  private waveCloudInst: THREE.InstancedMesh | null = null;
  private fusionRings: THREE.Mesh[] = [];

  // Chapter 2: Tokamak Magnetic Confinement
  private bTesla = 8.5;
  private tokamakTempMK = 150;
  private confinementSec = 3.2;
  private plasmaUniforms: {
    uTime: { value: number };
    uHeat: { value: number };
    uTwist: { value: number };
  } | null = null;
  private ionInst: THREE.InstancedMesh | null = null;
  private helicalIons: HelicalIon[] = [];

  // Chapter 3: Laser ICF Ignition
  private laserMJ = 2.2;
  private icfPhase = 0;
  private laserBeams: THREE.Mesh[] = [];
  private fuelPellet: THREE.Mesh | null = null;
  private fuelPelletMat: THREE.MeshStandardMaterial | null = null;
  private icfFlashRing: THREE.Mesh | null = null;
  private icfShellWave: THREE.Mesh | null = null;

  // Chapter 4: Stellar Core & Coronal Loops
  private solarMasses = 1.0;
  private solarUniforms: { uTime: { value: number }; uTempFactor: { value: number } } | null = null;
  private starMesh: THREE.Mesh | null = null;
  private loopCurves: THREE.CatmullRomCurve3[] = [];
  private loopBeadInst: THREE.InstancedMesh | null = null;
  private loopBeads: SolarLoopBead[] = [];

  private readonly dummy = new THREE.Object3D();
  private readonly tmpVec = new THREE.Vector3();

  constructor() {
    this.rebuildScene();
  }

  public activate(chapterId: string): void {
    this.chapterId = chapterId;
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (typeof apply.tunnelTempMK === 'number') this.tunnelTempMK = apply.tunnelTempMK;
    if (typeof apply.bTesla === 'number') this.bTesla = apply.bTesla;
    if (typeof apply.tokamakTempMK === 'number') this.tokamakTempMK = apply.tokamakTempMK;
    if (typeof apply.confinementSec === 'number') this.confinementSec = apply.confinementSec;
    if (typeof apply.laserMJ === 'number') this.laserMJ = apply.laserMJ;
    if (typeof apply.solarMasses === 'number') this.solarMasses = apply.solarMasses;
    if (apply.fireLasers === true) this.icfPhase = 0;
    if (apply.triggerFusion === true) this.tunnelPhase = 0;
    this.rebuildScene();
  }

  public reset(): void {
    this.simTime = 0;
    this.tunnelPhase = 0;
    this.icfPhase = 0;
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
    this.deuteriumGroup = null;
    this.tritiumGroup = null;
    this.heliumGroup = null;
    this.fastNeutron = null;
    this.barrierUniforms = null;
    this.waveCloudInst = null;
    this.fusionRings = [];
    this.plasmaUniforms = null;
    this.ionInst = null;
    this.helicalIons = [];
    this.laserBeams = [];
    this.fuelPellet = null;
    this.fuelPelletMat = null;
    this.icfFlashRing = null;
    this.icfShellWave = null;
    this.solarUniforms = null;
    this.starMesh = null;
    this.loopCurves = [];
    this.loopBeadInst = null;
    this.loopBeads = [];
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;
    if (this.chapterId === 'fus-tunnel') this.buildTunnelScene();
    else if (this.chapterId === 'fus-tokamak') this.buildTokamakScene();
    else if (this.chapterId === 'fus-icf') this.buildIcfScene();
    else this.buildStellarScene();
  }

  private makeNucleonCluster(protons: number, neutrons: number): THREE.Group {
    const g = new THREE.Group();
    const sG = this.track(new THREE.SphereGeometry(0.42, 20, 16));
    const pMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 0.7, roughness: 0.25 }),
    );
    const nMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.65, roughness: 0.25 }),
    );
    const offsets: Array<[number, number, number]> = [
      [-0.32, 0.2, 0],
      [0.32, -0.2, 0.12],
      [0.0, 0.25, -0.32],
      [0.0, -0.25, 0.32],
    ];
    let idx = 0;
    for (let i = 0; i < protons; i++) {
      const m = new THREE.Mesh(sG, pMat);
      const o = offsets[idx++ % offsets.length];
      m.position.set(o[0], o[1], o[2]);
      g.add(m);
    }
    for (let i = 0; i < neutrons; i++) {
      const m = new THREE.Mesh(sG, nMat);
      const o = offsets[idx++ % offsets.length];
      m.position.set(o[0], o[1], o[2]);
      g.add(m);
    }
    return g;
  }

  // ---------------- 1. D-T QUANTUM TUNNELING FUSION ----------------
  private buildTunnelScene(): void {
    this.tunnelPhase = 0;

    // Shimmering GLSL Quantum Coulomb Barrier Sphere at center
    this.barrierUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };
    const barrierMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: COULOMB_BARRIER_VERT,
        fragmentShader: COULOMB_BARRIER_FRAG,
        uniforms: this.barrierUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const barrier = new THREE.Mesh(this.track(new THREE.SphereGeometry(2.3, 40, 28)), barrierMat);
    this.attachStudy(barrier, {
      key: 'fus-barrier',
      title: 'Coulomb Repulsion Barrier & Quantum Tunneling',
      badge: 'GAMOW PEAK',
      accent: '#38bdf8',
      simple: 'Both nuclei carry positive charge and fiercely repel each other—yet at 150 million K, their quantum waves overlap and tunnel straight through!',
      deeper: 'Gamow tunneling factor P ∝ exp(−√(E_G/E)) allows D-T fusion at ~15 keV, far below the ~400 keV classical Coulomb peak.',
    });
    this.group.add(barrier);

    // Deuterium (1p + 1n) & Tritium (1p + 2n) incoming clusters
    this.deuteriumGroup = this.makeNucleonCluster(1, 1);
    this.tritiumGroup = this.makeNucleonCluster(1, 2);
    this.group.add(this.deuteriumGroup, this.tritiumGroup);

    // Outgoing Helium-4 (2p + 2n) alpha particle + 14.1 MeV fast neutron
    this.heliumGroup = this.makeNucleonCluster(2, 2);
    this.heliumGroup.visible = false;
    this.group.add(this.heliumGroup);

    this.fastNeutron = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.36, 18, 16)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.2 })),
    );
    this.fastNeutron.visible = false;
    this.group.add(this.fastNeutron);

    // Authentic 3D translucent Coulomb potential-well + repulsive barrier volcano mesh
    const wellGeom = this.track(new THREE.PlaneGeometry(14, 14, 52, 52));
    wellGeom.rotateX(-Math.PI * 0.5);
    const posAttr = wellGeom.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const r = Math.hypot(x, z);
      // Repulsive 1/r Coulomb ridge peaking around r ~ 2.1, plunging into deep strong-force well at r < 1.3
      const ridge = 2.6 * Math.exp(-Math.pow((r - 2.15) / 1.35, 2));
      const nuclearWell = -3.4 * Math.exp(-Math.pow(r / 1.15, 2));
      posAttr.setY(i, ridge + nuclearWell - 2.4);
    }
    wellGeom.computeVertexNormals();
    const wellMesh = new THREE.Mesh(
      wellGeom,
      this.track(
        new THREE.MeshPhysicalMaterial({
          color: 0x0ea5e9,
          emissive: 0x0369a1,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.28,
          roughness: 0.25,
          side: THREE.DoubleSide,
          wireframe: true,
        }),
      ),
    );
    this.group.add(wellMesh);

    // 180-particle GPU InstancedMesh quantum wave-packet probability density cloud
    const CLOUD_N = 180;
    const wcGeom = this.track(new THREE.SphereGeometry(0.085, 8, 6));
    const wcMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.waveCloudInst = new THREE.InstancedMesh(wcGeom, wcMat, CLOUD_N);
    this.waveCloudInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.waveCloudInst);

    // Twin expanding energy shock rings on fusion
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(1.0, 0.08, 12, 48)),
        this.track(
          new THREE.MeshBasicMaterial({
            color: i === 0 ? 0x00f0ff : 0xf472b6,
            transparent: true,
            opacity: 0,
          }),
        ),
      );
      r.rotation.x = i === 0 ? Math.PI * 0.5 : 0;
      this.group.add(r);
      this.fusionRings.push(r);
    }
  }

  // ---------------- 2. TOKAMAK MAGNETIC CONFINEMENT ----------------
  private buildTokamakScene(): void {
    // Blender cutaway superconducting tokamak vessel!
    const vesselProxy = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(11.5, 4.6, 11.5)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.7 })),
    );
    this.attachStudy(vesselProxy, {
      key: 'fus-tokamak-vessel',
      title: 'Superconducting Tokamak Magnetic Cage',
      badge: 'TOROIDAL FIELD',
      accent: '#38bdf8',
      simple: 'No solid wall can touch 150-million-degree plasma without melting—so cryogenic superconducting magnets levitate the plasma in a floating donut!',
      deeper: 'Combined toroidal B_φ and poloidal B_θ fields twist magnetic flux surfaces into helices with safety factor q > 2.',
    });
    this.group.add(vesselProxy);
    void attachModel(vesselProxy, 'tokamak_vessel', { fit: 'x' });

    // Custom GLSL Swirling Volumetric Plasma Torus floating inside the coils
    this.plasmaUniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0.85 },
      uTwist: { value: 2.2 },
    };
    const plasmaMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: PLASMA_TORUS_VERT,
        fragmentShader: PLASMA_TORUS_FRAG,
        uniforms: this.plasmaUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const plasmaTorus = new THREE.Mesh(this.track(new THREE.TorusGeometry(4.0, 1.05, 32, 96)), plasmaMat);
    plasmaTorus.rotation.x = Math.PI * 0.5;
    this.attachStudy(plasmaTorus, {
      key: 'fus-plasma',
      title: '150 Million K Burning D-T Plasma',
      badge: 'LAWSON TRIPLE PRODUCT',
      accent: '#f472b6',
      simple: 'Ten times hotter than the core of the Sun! Watch the helical filaments twist as plasma ions spiral tightly around the magnetic cage.',
      deeper: 'Ignition requires n · T · τ_E ≥ 3 × 10²¹ keV·s/m³ so alpha-particle self-heating sustains the burn.',
    });
    this.group.add(plasmaTorus);

    // Explicit 3D helical magnetic field streamlines winding around the plasma torus (q ≈ 3)
    const streamlineMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    for (let s = 0; s < 3; s++) {
      const phase0 = (s / 3) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      const steps = 96;
      for (let k = 0; k <= steps; k++) {
        const phi = (k / steps) * Math.PI * 2;
        const theta = phi * 3.0 + phase0;
        const rLocal = 4.0 + 1.18 * Math.cos(theta);
        pts.push(new THREE.Vector3(rLocal * Math.cos(phi), 1.18 * Math.sin(theta), rLocal * Math.sin(phi)));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const tube = new THREE.Mesh(this.track(new THREE.TubeGeometry(curve, 96, 0.032, 6, true)), streamlineMat);
      this.group.add(tube);
    }

    // 260 live helical streaming plasma ions (GPU InstancedMesh)
    const ION_N = 260;
    const ionG = this.track(new THREE.SphereGeometry(0.085, 8, 8));
    const ionM = this.track(new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    this.ionInst = new THREE.InstancedMesh(ionG, ionM, ION_N);
    this.ionInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < ION_N; i++) {
      this.helicalIons.push({
        toroidalAngle: (i / ION_N) * Math.PI * 2,
        poloidalPhase: (i * 1.61803) % (Math.PI * 2),
        minorR: 0.35 + ((i * 29) % 100) / 150,
        speed: 1.4 + ((i * 17) % 100) / 80,
      });
    }
    this.group.add(this.ionInst);
  }

  // ---------------- 3. LASER INERTIAL CONFINEMENT (NIF-STYLE ICF) ----------------
  private buildIcfScene(): void {
    this.icfPhase = 0;

    // Blender gold open-cage hohlraum cavity at center
    const hohlraum = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(1.75, 1.75, 3.6, 24)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.65 })),
    );
    this.attachStudy(hohlraum, {
      key: 'fus-hohlraum',
      title: 'Gold Hohlraum X-Ray Cavity',
      badge: 'INDIRECT DRIVE ICF',
      accent: '#fbbf24',
      simple: 'Sixteen synchronized ultraviolet laser beams slam into the inner gold walls, converting laser light into a uniform X-ray oven that crushes the fuel pellet!',
      deeper: 'At the National Ignition Facility, 2.05 MJ of UV laser light compressed a millimeter D-T capsule to >100× lead density, yielding 3.15 MJ (Q > 1.5).',
    });
    this.group.add(hohlraum);
    void attachModel(hohlraum, 'fusion_hohlraum', { fit: 'y' });

    // Central cryogenic D-T fuel pellet
    this.fuelPelletMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.0, roughness: 0.2 }),
    );
    this.fuelPellet = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.65, 32, 24)), this.fuelPelletMat);
    this.group.add(this.fuelPellet);

    // 16 converging UV laser beams + Blender laser injector nozzles (8 top cone + 8 bottom cone)
    const beamG = this.track(new THREE.CylinderGeometry(0.065, 0.11, 7.2, 10));
    const beamM = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const nozzleG = this.track(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 16));
    const nozzleM = this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.7 }));

    for (const sy of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const outer = new THREE.Vector3(Math.cos(a) * 5.2, sy * 6.4, Math.sin(a) * 5.2);
        const inner = new THREE.Vector3(Math.cos(a) * 0.45, sy * 1.4, Math.sin(a) * 0.45);
        const mid = outer.clone().add(inner).multiplyScalar(0.5);
        const dir = inner.clone().sub(outer).normalize();

        const beam = new THREE.Mesh(beamG, beamM.clone());
        this.track(beam.material as THREE.Material);
        beam.position.copy(mid);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.group.add(beam);
        this.laserBeams.push(beam);

        const nozzle = new THREE.Mesh(nozzleG, nozzleM);
        nozzle.position.copy(outer);
        nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        this.group.add(nozzle);
        void attachModel(nozzle, 'laser_injector', { fit: 'y' });
      }
    }

    // Ignition shockwave ring & expanding alpha-heating shell
    this.icfFlashRing = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(1.0, 0.09, 12, 48)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0 })),
    );
    this.icfFlashRing.rotation.x = Math.PI * 0.5;
    this.group.add(this.icfFlashRing);

    this.icfShellWave = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(1.0, 32, 24)),
      this.track(
        new THREE.ShaderMaterial({
          vertexShader: COULOMB_BARRIER_VERT,
          fragmentShader: COULOMB_BARRIER_FRAG,
          uniforms: { uTime: { value: 0 }, uPulse: { value: 1.0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    this.icfShellWave.visible = false;
    this.group.add(this.icfShellWave);
  }

  // ---------------- 4. STELLAR CORE & MAGNETIC CORONAL LOOPS ----------------
  private buildStellarScene(): void {
    this.solarUniforms = { uTime: { value: 0 }, uTempFactor: { value: this.solarMasses } };
    const starMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: SOLAR_SURFACE_VERT,
        fragmentShader: SOLAR_SURFACE_FRAG,
        uniforms: this.solarUniforms,
      }),
    );
    const rStar = 2.6 + (this.solarMasses - 1.0) * 0.85;
    this.starMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(rStar, 56, 40)), starMat);
    this.attachStudy(this.starMesh, {
      key: 'fus-star',
      title: 'Stellar Photosphere & Proton-Proton Core',
      badge: 'L ∝ M³·⁵',
      accent: '#fbbf24',
      simple: 'Deep inside our Sun, gravity crushes hydrogen at 15.7 million K—fusing 600 million tonnes every second and converting 4.26 million tonnes straight into starlight!',
      deeper: 'Hydrostatic equilibrium balances inward gravity against outward radiation pressure; luminosity scales steeply as L ∝ M^3.5.',
    });
    this.group.add(this.starMesh);

    // Outer volumetric Fresnel corona halo atmosphere
    const coronaMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(rStar * 1.24, 36, 24)),
      this.track(
        new THREE.ShaderMaterial({
          vertexShader: COULOMB_BARRIER_VERT,
          fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            void main() {
              float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 3.0);
              vec3 col = vec3(1.0, 0.56, 0.12) * fresnel * 1.35;
              gl_FragColor = vec4(col, clamp(fresnel * 0.68, 0.0, 0.72));
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    this.group.add(coronaMesh);

    // 6 Animated 3D Magnetic Coronal Prominence Loops arching out of the star
    const loopMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    for (let i = 0; i < 6; i++) {
      const az = (i / 6) * Math.PI * 2;
      const tilt = ((i % 3) - 1) * 0.55;
      const archH = rStar + 1.55 + (i % 2) * 0.8;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const span = (u - 0.5) * 1.15;
        const r = rStar * 0.96 + Math.sin(u * Math.PI) * (archH - rStar);
        const p = new THREE.Vector3(
          r * Math.cos(az + span),
          r * Math.sin(tilt + span * 0.45) * 0.85,
          r * Math.sin(az + span),
        );
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      this.loopCurves.push(curve);
      const tube = new THREE.Mesh(this.track(new THREE.TubeGeometry(curve, 32, 0.065, 8, false)), loopMat);
      this.group.add(tube);
    }

    // 96 glowing plasma beads streaming along the magnetic coronal arches
    const BEAD_N = 96;
    const bG = this.track(new THREE.SphereGeometry(0.11, 8, 8));
    const bM = this.track(new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    this.loopBeadInst = new THREE.InstancedMesh(bG, bM, BEAD_N);
    this.loopBeadInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < BEAD_N; i++) {
      this.loopBeads.push({
        loopIdx: i % this.loopCurves.length,
        t: (i / BEAD_N) % 1.0,
        speed: 0.28 + ((i * 19) % 100) / 320,
      });
    }
    this.group.add(this.loopBeadInst);
  }

  public update(dt: number): void {
    this.simTime += dt;
    if (this.chapterId === 'fus-tunnel') this.updateTunnel(dt);
    else if (this.chapterId === 'fus-tokamak') this.updateTokamak(dt);
    else if (this.chapterId === 'fus-icf') this.updateIcf(dt);
    else this.updateStellar(dt);
  }

  private updateTunnel(dt: number): void {
    const prob = gamowTunnelingFactor(this.tunnelTempMK);
    this.tunnelPhase = (this.tunnelPhase + dt * (0.28 + prob * 0.14)) % 1.0;
    const p = this.tunnelPhase;
    const fuses = prob > 0.18;

    if (this.barrierUniforms) {
      this.barrierUniforms.uTime.value = this.simTime;
      this.barrierUniforms.uPulse.value = p > 0.42 && p < 0.65 ? Math.sin(((p - 0.42) / 0.23) * Math.PI) : 0.12;
    }

    if (p < 0.5) {
      // Smooth cubic ease-in approach from +/-6.2 toward origin
      const t = p / 0.5;
      const dist = fuses ? 6.2 * (1 - t * t) : 6.2 - 3.6 * Math.sin(t * Math.PI);
      if (this.deuteriumGroup) {
        this.deuteriumGroup.visible = true;
        this.deuteriumGroup.position.set(-dist, Math.sin(t * 6) * 0.15, 0);
        this.deuteriumGroup.rotation.y += dt * 3.0;
      }
      if (this.tritiumGroup) {
        this.tritiumGroup.visible = true;
        this.tritiumGroup.position.set(dist, -Math.sin(t * 6) * 0.15, 0);
        this.tritiumGroup.rotation.y -= dt * 3.0;
      }
      if (this.heliumGroup) this.heliumGroup.visible = false;
      if (this.fastNeutron) this.fastNeutron.visible = false;
      for (const r of this.fusionRings) (r.material as THREE.MeshBasicMaterial).opacity = 0;
    } else if (fuses) {
      // Post-fusion recoil! He-4 (3.5 MeV) recoils slower left-up, fast neutron (14.1 MeV) rockets right-down!
      const post = (p - 0.5) / 0.5;
      if (this.deuteriumGroup) this.deuteriumGroup.visible = false;
      if (this.tritiumGroup) this.tritiumGroup.visible = false;
      if (this.heliumGroup) {
        this.heliumGroup.visible = true;
        this.heliumGroup.position.set(-post * 3.4, post * 1.4, 0.3 * post);
        this.heliumGroup.rotation.x += dt * 4.0;
      }
      if (this.fastNeutron) {
        this.fastNeutron.visible = true;
        this.fastNeutron.position.set(post * 9.8, -post * 3.6, -0.5 * post);
      }
      for (let i = 0; i < this.fusionRings.length; i++) {
        const ring = this.fusionRings[i];
        const s = 0.8 + post * (7.5 + i * 2.5);
        ring.scale.setScalar(s);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - post) * 0.9);
      }
    } else {
      // Too cold -> Coulomb bounce back!
      const bounce = (p - 0.5) / 0.5;
      const dist = 2.6 + bounce * 3.6;
      if (this.deuteriumGroup) this.deuteriumGroup.position.set(-dist, 0, 0);
      if (this.tritiumGroup) this.tritiumGroup.position.set(dist, 0, 0);
    }

    // Animate 180-particle GPU InstancedMesh wave-packet probability density cloud
    if (this.waveCloudInst) {
      const spread = 1.15 + prob * 1.35;
      const leftX = this.deuteriumGroup?.visible ? this.deuteriumGroup.position.x : -1.2;
      const rightX = this.tritiumGroup?.visible ? this.tritiumGroup.position.x : 1.2;
      for (let i = 0; i < 180; i++) {
        const isLeft = i % 2 === 0;
        const cx = p >= 0.5 && fuses ? 0 : isLeft ? leftX : rightX;
        const a = i * 2.399963 + this.simTime * (1.2 + (i % 7) * 0.18);
        const r = ((i * 37) % 100) / 100 * spread;
        const elev = Math.sin(i * 1.7 + this.simTime * 2.4) * spread * 0.55;
        this.dummy.position.set(cx + Math.cos(a) * r, elev, Math.sin(a) * r);
        const pulse = 0.45 + 0.55 * Math.sin(this.simTime * 5.0 + i);
        this.dummy.scale.setScalar((p >= 0.5 && fuses ? 0.35 : 0.9) * pulse);
        this.dummy.updateMatrix();
        this.waveCloudInst.setMatrixAt(i, this.dummy.matrix);
      }
      this.waveCloudInst.instanceMatrix.needsUpdate = true;
    }
  }

  private updateTokamak(dt: number): void {
    const heatNorm = Math.min(1.0, this.tokamakTempMK / 200);
    const twist = 1.4 + this.bTesla * 0.22;
    if (this.plasmaUniforms) {
      this.plasmaUniforms.uTime.value = this.simTime;
      this.plasmaUniforms.uHeat.value = heatNorm;
      this.plasmaUniforms.uTwist.value = twist;
    }

    if (this.ionInst) {
      const R = 4.0;
      for (let i = 0; i < this.helicalIons.length; i++) {
        const ion = this.helicalIons[i];
        ion.toroidalAngle += dt * ion.speed * (0.7 + heatNorm * 0.9);
        const phi = ion.toroidalAngle;
        const theta = phi * twist + ion.poloidalPhase;
        const rLocal = R + ion.minorR * Math.cos(theta);
        this.dummy.position.set(
          rLocal * Math.cos(phi),
          ion.minorR * Math.sin(theta),
          rLocal * Math.sin(phi),
        );
        this.dummy.scale.setScalar(0.85 + heatNorm * 0.45);
        this.dummy.updateMatrix();
        this.ionInst.setMatrixAt(i, this.dummy.matrix);
      }
      this.ionInst.instanceMatrix.needsUpdate = true;
    }
  }

  private updateIcf(dt: number): void {
    const icf = computeIcfYield(this.laserMJ);
    this.icfPhase = (this.icfPhase + dt * 0.34) % 1.0;
    const p = this.icfPhase;

    // 0.00 - 0.48: 16 UV lasers fire and pulse intensely into the gold hohlraum, compressing the pellet
    // 0.48 - 1.00: Thermonuclear ignition flash & expanding shockwave!
    const laserPulse = p < 0.48 ? Math.sin((p / 0.48) * Math.PI) : 0;
    for (let i = 0; i < this.laserBeams.length; i++) {
      const mat = this.laserBeams[i].material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + laserPulse * 0.92;
      mat.color.setHex(icf.ignited && p > 0.35 ? 0xfef08a : 0x38bdf8);
    }

    if (this.fuelPellet && this.fuelPelletMat) {
      if (p < 0.48) {
        const s = 1.0 - (p / 0.48) * 0.62;
        this.fuelPellet.scale.setScalar(s);
        this.fuelPelletMat.color.setHex(0x38bdf8);
        this.fuelPelletMat.emissive.setHex(0x0ea5e9);
        this.fuelPelletMat.emissiveIntensity = 1.0 + laserPulse * 2.5;
      } else {
        const post = (p - 0.48) / 0.52;
        const boost = icf.ignited ? 3.2 : 1.3;
        const s = 0.38 + Math.sin(post * Math.PI) * boost;
        this.fuelPellet.scale.setScalar(s);
        this.fuelPelletMat.color.setHex(icf.ignited ? 0xffffff : 0xf97316);
        this.fuelPelletMat.emissive.setHex(icf.ignited ? 0xfef08a : 0xea580c);
        this.fuelPelletMat.emissiveIntensity = icf.ignited ? 3.5 * (1 - post * 0.6) : 1.2;
      }
    }

    if (this.icfFlashRing) {
      const mat = this.icfFlashRing.material as THREE.MeshBasicMaterial;
      if (p >= 0.48) {
        const post = (p - 0.48) / 0.52;
        const s = 0.7 + post * (icf.ignited ? 9.5 : 4.2);
        this.icfFlashRing.scale.setScalar(s);
        mat.opacity = Math.max(0, (1 - post) * (icf.ignited ? 0.95 : 0.45));
      } else {
        mat.opacity = 0;
      }
    }

    if (this.icfShellWave) {
      if (p >= 0.48 && icf.ignited) {
        const post = (p - 0.48) / 0.52;
        this.icfShellWave.visible = true;
        this.icfShellWave.scale.setScalar(0.8 + post * 7.8);
        const sm = this.icfShellWave.material as THREE.ShaderMaterial;
        sm.uniforms.uTime.value = this.simTime;
        sm.uniforms.uPulse.value = Math.max(0, 1 - post);
      } else {
        this.icfShellWave.visible = false;
      }
    }
  }

  private updateStellar(dt: number): void {
    if (this.solarUniforms) {
      this.solarUniforms.uTime.value = this.simTime;
      this.solarUniforms.uTempFactor.value = this.solarMasses;
    }
    if (this.starMesh) {
      this.starMesh.rotation.y += dt * 0.14;
    }
    if (this.loopBeadInst && this.loopCurves.length > 0) {
      for (let i = 0; i < this.loopBeads.length; i++) {
        const b = this.loopBeads[i];
        b.t = (b.t + Math.max(0, dt) * b.speed) % 1.0;
        const u = Math.max(0, Math.min(0.999, Number.isFinite(b.t) ? b.t : 0));
        this.loopCurves[b.loopIdx].getPointAt(u, this.tmpVec);
        this.dummy.position.copy(this.tmpVec);
        const edgeFade = Math.sin(b.t * Math.PI);
        this.dummy.scale.setScalar(0.4 + edgeFade * 0.95);
        this.dummy.updateMatrix();
        this.loopBeadInst.setMatrixAt(i, this.dummy.matrix);
      }
      this.loopBeadInst.instanceMatrix.needsUpdate = true;
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'fus-tunnel') {
      return {
        sliders: [
          {
            key: 'tunnelTempMK',
            label: 'Plasma Temperature',
            min: 15,
            max: 240,
            step: 5,
            value: this.tunnelTempMK,
            unit: ' MK',
            noteTitle: 'Gamow Tunneling Threshold',
            noteText: 'Below ~40 million K, nuclei bounce off their electric repulsion. Above ~100 million K, quantum tunneling unlocks D-T fusion!',
          },
        ],
        toggles: [],
        actions: [{ id: 'trigger-fusion', label: 'Collide D + T Nuclei' }],
      };
    }

    if (this.chapterId === 'fus-tokamak') {
      return {
        sliders: [
          {
            key: 'bTesla',
            label: 'Toroidal Magnetic Field B',
            min: 2.0,
            max: 14.0,
            step: 0.5,
            value: this.bTesla,
            unit: ' T',
            noteTitle: 'Magnetic Pressure P_B = B²/2μ₀',
            noteText: 'Stronger superconducting magnets squeeze hotter, denser plasma safely away from the reactor walls.',
          },
          {
            key: 'tokamakTempMK',
            label: 'Core Plasma Temp',
            min: 40,
            max: 240,
            step: 10,
            value: this.tokamakTempMK,
            unit: ' MK',
            noteTitle: 'Peak D-T Reactivity',
            noteText: 'D-T fusion peaks around 150 million K—ten times hotter than the center of the Sun!',
          },
          {
            key: 'confinementSec',
            label: 'Confinement Time τ_E',
            min: 0.5,
            max: 6.0,
            step: 0.25,
            value: this.confinementSec,
            unit: ' s',
            noteTitle: 'Lawson Criterion',
            noteText: 'Holding heat in the plasma longer drives the triple product n·T·τ_E above ignition!',
          },
        ],
        toggles: [],
        actions: [],
      };
    }

    if (this.chapterId === 'fus-icf') {
      return {
        sliders: [
          {
            key: 'laserMJ',
            label: 'UV Laser Drive Energy',
            min: 0.6,
            max: 3.5,
            step: 0.1,
            value: this.laserMJ,
            unit: ' MJ',
            noteTitle: 'Ignition Cliff (Q > 1)',
            noteText: 'Past ~2.0 MJ, alpha self-heating ignites the compressed D-T fuel capsule so fusion output exceeds laser input!',
          },
        ],
        toggles: [],
        actions: [{ id: 'fire-lasers', label: 'Fire 16 UV Lasers' }],
      };
    }

    return {
      sliders: [
        {
          key: 'solarMasses',
          label: 'Stellar Mass',
          min: 0.5,
          max: 2.2,
          step: 0.1,
          value: this.solarMasses,
          unit: ' M☉',
          noteTitle: 'Mass-Luminosity Law (L ∝ M³·⁵)',
          noteText: 'Doubling a star’s mass cranks its fusion luminosity up more than 11× and shifts its color blue-white!',
        },
      ],
      toggles: [],
      actions: [],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'tunnelTempMK' && typeof value === 'number') this.tunnelTempMK = value;
    else if (key === 'bTesla' && typeof value === 'number') this.bTesla = value;
    else if (key === 'tokamakTempMK' && typeof value === 'number') this.tokamakTempMK = value;
    else if (key === 'confinementSec' && typeof value === 'number') this.confinementSec = value;
    else if (key === 'laserMJ' && typeof value === 'number') this.laserMJ = value;
    else if (key === 'solarMasses' && typeof value === 'number') {
      this.solarMasses = value;
      this.rebuildScene();
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'trigger-fusion') this.tunnelPhase = 0;
    else if (actionId === 'fire-lasers') this.icfPhase = 0;
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'fus-tunnel') {
      const p = gamowTunnelingFactor(this.tunnelTempMK);
      return [
        {
          labelSimple: 'Tunneling Chance',
          labelPhysics: 'Gamow Factor',
          value: `${(p * 100).toFixed(1)}%`,
          noteTitle: 'Quantum Wave Overlap',
          noteText: 'Higher thermal energy narrows the barrier, exponentially raising quantum tunneling probability.',
        },
        {
          labelSimple: 'Reaction Outcome',
          labelPhysics: 'D-T State',
          value: p > 0.18 ? 'FUSION (+17.6 MeV)' : 'Coulomb Bounce',
          noteTitle: 'Ignition Threshold',
          noteText: 'Too cold and protons rebound; hot enough and they fuse into He-4 + a 14.1 MeV fast neutron!',
        },
        {
          labelSimple: 'Alpha Particle',
          labelPhysics: 'He-4 Kinetic',
          value: '3.5 MeV',
          noteTitle: 'Self-Heating',
          noteText: 'Charged He-4 stays trapped by magnetic fields, keeping the plasma burning.',
        },
        {
          labelSimple: 'Fast Neutron',
          labelPhysics: 'Neutron Output',
          value: '14.1 MeV',
          noteTitle: 'Power Harvest',
          noteText: 'Carries 80% of the energy out to the reactor blanket to boil steam and generate electricity.',
        },
      ];
    }

    if (this.chapterId === 'fus-tokamak') {
      const m = computeLawsonMetrics(this.bTesla, this.tokamakTempMK, this.confinementSec);
      return [
        {
          labelSimple: 'Fusion Gain Q',
          labelPhysics: 'P_fus / P_in',
          value: `${m.fusionGainQ.toFixed(1)}×`,
          noteTitle: 'Net Energy Gain',
          noteText: 'Q > 1 means more fusion power comes out than heating power goes in; Q > 10 is reactor-grade.',
        },
        {
          labelSimple: 'Triple Product',
          labelPhysics: 'n · T · τ_E',
          value: `${m.tripleProduct1e21.toFixed(2)}e21`,
          noteTitle: 'Lawson Criterion',
          noteText: 'Crossing 3.0 × 10²¹ keV·s/m³ achieves self-sustaining plasma ignition.',
        },
        {
          labelSimple: 'Magnetic Pressure',
          labelPhysics: 'B² / 2μ₀',
          value: `${m.magneticPressureAtm.toFixed(0)} atm`,
          noteTitle: 'Invisible Magnetic Walls',
          noteText: 'Superconducting magnets push inward with hundreds of atmospheres of pure magnetic pressure.',
        },
        {
          labelSimple: 'Plasma Regime',
          labelPhysics: 'Burn State',
          value: m.ignited ? 'IGNITED BURN' : 'Driven Plasma',
          noteTitle: 'Self-Sustaining Burn',
          noteText: 'When ignited, internal helium self-heating sustains 150 MK with zero external heater power.',
        },
      ];
    }

    if (this.chapterId === 'fus-icf') {
      const icf = computeIcfYield(this.laserMJ);
      return [
        {
          labelSimple: 'Fusion Yield',
          labelPhysics: 'Target Output',
          value: `${icf.targetYieldMJ.toFixed(2)} MJ`,
          noteTitle: 'Net Scientific Gain',
          noteText: 'Above 2.0 MJ laser drive, fusion energy output surges past the input laser energy!',
        },
        {
          labelSimple: 'Target Gain Q',
          labelPhysics: 'E_out / E_laser',
          value: `${icf.gainQ.toFixed(2)}×`,
          noteTitle: 'Breakeven Threshold',
          noteText: 'Q > 1.0 marks scientific energy breakeven.',
        },
        {
          labelSimple: 'Fuel Compression',
          labelPhysics: 'ρ / ρ_solid',
          value: `${icf.compressionRatio.toFixed(0)}×`,
          noteTitle: 'Extreme Compression',
          noteText: 'Laser ablation crushes a millimeter pellet to denser than the core of the Sun.',
        },
        {
          labelSimple: 'Shot Outcome',
          labelPhysics: 'ICF Status',
          value: icf.ignited ? 'IGNITION (Q > 1)' : 'Sub-Ignition',
          noteTitle: 'Alpha-Heating Cliff',
          noteText: 'Alpha particles trap inside the dense hotspot, igniting a thermonuclear burn wave.',
        },
      ];
    }

    const st = computeStellarCore(this.solarMasses);
    return [
      {
        labelSimple: 'Luminosity',
        labelPhysics: 'L / L☉ (M³·⁵)',
        value: `${st.luminositySolar.toFixed(2)} L☉`,
        noteTitle: 'Steep Mass Scaling',
        noteText: 'Even a small boost in stellar mass dramatically accelerates core fusion output.',
      },
      {
        labelSimple: 'Core Temperature',
        labelPhysics: 'T_core',
        value: `${st.coreTempMK.toFixed(1)} MK`,
        noteTitle: 'Gravitational Oven',
        noteText: 'Gravity compresses the core to ~15.7 million K in our Sun.',
      },
      {
        labelSimple: 'Mass → Light',
        labelPhysics: 'Δm / dt',
        value: `${st.massConvertedMillionTonnesPerSec.toFixed(1)} Mt/s`,
        noteTitle: 'E = mc² Every Second',
        noteText: 'Our Sun converts 4.26 million tonnes of hydrogen mass into pure sunlight every single second!',
      },
      {
        labelSimple: 'Fusion Fuel',
        labelPhysics: 'Dominant Cycle',
        value: this.solarMasses > 1.3 ? 'CNO Cycle' : 'p-p Chain',
        noteTitle: 'Stellar Fusion Pathway',
        noteText: 'Sun-like stars burn via the proton-proton chain; heavier stars ignite the faster CNO cycle.',
      },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'fus-tunnel') {
      return {
        captionSimple: 'Deuterium and Tritium tunnel through repulsion to release 17.6 MeV!',
        captionPhysics: 'D-T fusion reaction and Gamow tunneling factor:',
        tex: '^2_1\\text{H} + {}^3_1\\text{H} \\longrightarrow\\; ^4_2\\text{He}\\,(3.5\\text{ MeV}) + n\\,(14.1\\text{ MeV})',
      };
    }
    if (this.chapterId === 'fus-tokamak') {
      return {
        captionSimple: 'Strong magnetic pressure confines 150 MK plasma past the Lawson ignition criterion!',
        captionPhysics: 'Lawson triple product & toroidal magnetic pressure:',
        tex: 'n\\, T\\, \\tau_E \\ge 3 \\times 10^{21}\\;\\text{keV}\\cdot\\text{s}/\\text{m}^3, \\qquad P_B = \\frac{B^2}{2\\mu_0}',
      };
    }
    if (this.chapterId === 'fus-icf') {
      return {
        captionSimple: 'Sixteen converging lasers crush a fuel pellet past Q > 1 scientific breakeven!',
        captionPhysics: 'Inertial confinement target energy gain:',
        tex: 'Q = \\frac{E_{\\text{fusion}}}{E_{\\text{laser}}} > 1 \\;\\Longrightarrow\\; \\text{Ignition}',
      };
    }
    return {
      captionSimple: 'Stars fuse 4 protons into Helium, shining with luminosity L ∝ M³·⁵!',
      captionPhysics: 'Solar proton-proton net reaction & mass-luminosity law:',
      tex: '4\\,^1\\text{H} \\longrightarrow\\; ^4\\text{He} + 2e^+ + 2\\nu_e + 26.7\\text{ MeV}, \\qquad L \\propto M^{3.5}',
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'fus-tunnel') {
      const p = gamowTunnelingFactor(this.tunnelTempMK);
      const mev = this.tunnelPhase >= 0.5 && p > 0.18 ? 17.6 : 0;
      return { ch1: p * 100, ch2: mev, ch3: this.tunnelTempMK, labels: ['P_tun', 'MeV', 'T'], units: ['%', 'MeV', 'MK'] };
    }
    if (this.chapterId === 'fus-tokamak') {
      const m = computeLawsonMetrics(this.bTesla, this.tokamakTempMK, this.confinementSec);
      return {
        ch1: m.fusionGainQ,
        ch2: m.tripleProduct1e21,
        ch3: m.magneticPressureAtm,
        labels: ['Q', 'nTτ', 'P_B'],
        units: ['×', 'e21', 'atm'],
      };
    }
    if (this.chapterId === 'fus-icf') {
      const icf = computeIcfYield(this.laserMJ);
      return {
        ch1: icf.targetYieldMJ,
        ch2: icf.gainQ,
        ch3: this.icfPhase < 0.48 ? this.laserMJ : 0,
        labels: ['Out', 'Q', 'Laser'],
        units: ['MJ', '×', 'MJ'],
      };
    }
    const st = computeStellarCore(this.solarMasses);
    return {
      ch1: st.luminositySolar,
      ch2: st.coreTempMK,
      ch3: st.massConvertedMillionTonnesPerSec,
      labels: ['L', 'T_c', 'Δm/s'],
      units: ['L☉', 'MK', 'Mt'],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    if (this.chapterId === 'fus-tunnel') return { label: 'Vol XI · Quantum D-T Fusion', color: '#38bdf8' };
    if (this.chapterId === 'fus-tokamak') return { label: 'Vol XI · Tokamak Plasma Cage', color: '#f472b6' };
    if (this.chapterId === 'fus-icf') return { label: 'Vol XI · Laser ICF Ignition', color: '#fbbf24' };
    return { label: 'Vol XI · Stellar Core & Corona', color: '#f97316' };
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public inspectHit(hitObj: THREE.Object3D): LabHoverData | null {
    let cur: THREE.Object3D | null = hitObj;
    while (cur) {
      if (cur.userData.study) {
        const s = cur.userData.study as StudyMeta;
        return { ...s, metrics: [] };
      }
      cur = cur.parent;
    }
    return null;
  }

  public getCallouts(): LabCalloutPoint[] {
    if (this.chapterId === 'fus-tokamak') {
      return [
        {
          id: 'c-fus-plasma',
          label: '150 MK Toroidal Plasma',
          accent: '#f472b6',
          x: 0,
          y: 2.8,
          z: 0,
          hover: {
            key: 'c-fus-plasma',
            title: 'Magnetically Confined Plasma',
            badge: 'TOKAMAK',
            accent: '#f472b6',
            simple: 'Helical magnetic fields levitate burning plasma ten times hotter than the Sun’s core.',
            deeper: 'Superconducting toroidal + poloidal coils prevent charged ions from touching the wall.',
            metrics: [],
          },
        },
      ];
    }
    if (this.chapterId === 'fus-icf') {
      return [
        {
          id: 'c-fus-icf',
          label: '16 UV Lasers → Gold Hohlraum',
          accent: '#fbbf24',
          x: 0,
          y: 3.1,
          z: 0,
          hover: {
            key: 'c-fus-icf',
            title: 'Inertial Confinement Ignition',
            badge: 'NIF STYLE',
            accent: '#fbbf24',
            simple: 'Synchronized laser pulses crush a millimeter D-T capsule to thermonuclear ignition.',
            deeper: 'Indirect X-ray drive achieves symmetric implosion in billionths of a second.',
            metrics: [],
          },
        },
      ];
    }
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'fus-tunnel') return { position: [0, 3.2, 14.5], target: [0, 0, 0] };
    if (this.chapterId === 'fus-tokamak') return { position: [0, 6.2, 13.8], target: [0, 0, 0] };
    if (this.chapterId === 'fus-icf') return { position: [0, 4.8, 15.2], target: [0, 0, 0] };
    return { position: [0, 4.2, 13.5], target: [0, 0, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
