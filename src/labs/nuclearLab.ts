import * as THREE from 'three';
import {
  computeFissionYield,
  criticalMassKg,
  effectiveMultiplicationFactor,
  liquidDropNeck,
  sedovTaylorRadiusMeters,
} from '../physics/nuclearPhysics';
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

interface ChainAtom {
  pos: THREE.Vector3;
  fissioned: boolean;
  flash: number;
}

interface ChainNeutron {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  alive: boolean;
}

interface CloudParticle {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  seed: number;
}

// ---------------- CUSTOM GLSL SHADERS ----------------

const LIQUID_DROP_VERT = `
  uniform float uTime;
  uniform float uElongation;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vPinch;

  void main() {
    vec3 p = position;
    float r = length(p);
    float cosTheta = p.x / max(r, 0.0001);
    // Quadrupole (P2) stretching + waist pinching
    float p2 = 0.5 * (3.0 * cosTheta * cosTheta - 1.0);
    float wobble = sin(uTime * 10.0 + cosTheta * 4.0) * 0.08 * uElongation;
    float stretchX = 1.0 + uElongation * 1.15;
    float waist = 1.0 - uElongation * 0.72 * exp(-cosTheta * cosTheta * 5.0);
    vec3 displaced = vec3(
      p.x * stretchX,
      p.y * waist * (1.0 + wobble + 0.14 * p2 * uElongation),
      p.z * waist * (1.0 + wobble + 0.14 * p2 * uElongation)
    );
    vPinch = exp(-cosTheta * cosTheta * 6.0) * uElongation;
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normalize(displaced));
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const LIQUID_DROP_FRAG = `
  uniform float uElongation;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vPinch;

  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.4);
    vec3 baseCol = mix(vec3(0.06, 0.52, 0.85), vec3(0.98, 0.45, 0.12), uElongation);
    vec3 hotNeck = vec3(1.0, 0.96, 0.78) * vPinch * 1.4;
    vec3 rimCol = vec3(0.35, 0.95, 1.0) * fresnel * 1.15;
    gl_FragColor = vec4(baseCol + hotNeck + rimCol, 0.96);
  }
`;

const FIREBALL_VERT = `
  uniform float uTime;
  uniform float uTurbulence;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

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
      p = p * 2.05 + vec3(0.15, -0.25, 0.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 sampleP = normal * 2.4 + vec3(0.0, -uTime * 0.85, uTime * 0.35);
    float n = fbm(sampleP);
    vNoise = n;
    vec3 displaced = position + normal * ((n - 0.5) * uTurbulence);
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FIREBALL_FRAG = `
  uniform float uHeat;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vNoise;

  vec3 blackbody(float t) {
    vec3 darkRed = vec3(0.45, 0.05, 0.02);
    vec3 orange = vec3(1.0, 0.36, 0.04);
    vec3 yellow = vec3(1.0, 0.86, 0.35);
    vec3 whiteHot = vec3(0.95, 0.98, 1.0);
    if (t < 0.33) return mix(darkRed, orange, t / 0.33);
    if (t < 0.68) return mix(orange, yellow, (t - 0.33) / 0.35);
    return mix(yellow, whiteHot, clamp((t - 0.68) / 0.32, 0.0, 1.0));
  }

  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.1);
    float temp = clamp(uHeat * (0.55 + vNoise * 0.72) - fresnel * 0.22, 0.05, 1.0);
    vec3 col = blackbody(temp) * (1.15 + fresnel * 0.6);
    gl_FragColor = vec4(col, 0.94);
  }
`;

const SHOCKWAVE_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const SHOCKWAVE_FRAG = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 3.6);
    float alpha = clamp(fresnel * uOpacity * 1.15, 0.0, 0.72);
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(uColor * (0.9 + fresnel * 0.65), alpha);
  }
`;

export class NuclearLab implements LabModule {
  public readonly topicId = 'nuclear' as const;
  public readonly group = new THREE.Group();

  private chapterId = 'nuc-liquiddrop';
  private disposables: Array<{ dispose: () => void }> = [];
  private hitTargets: THREE.Object3D[] = [];
  private simTime = 0;

  // Chapter 1: Liquid-Drop Fission
  private dropPhase = 0; // 0..1 continuous cycle (impact -> wobble -> split -> recoil)
  private dropSpeed = 0.24;
  private dropMesh: THREE.Mesh | null = null;
  private dropUniforms: { uTime: { value: number }; uElongation: { value: number } } | null = null;
  private incomingNeutron: THREE.Mesh | null = null;
  private daughterBa: THREE.Mesh | null = null;
  private daughterKr: THREE.Mesh | null = null;
  private emittedNeutrons: THREE.Mesh[] = [];
  private gammaRing: THREE.Mesh | null = null;

  // Chapter 2: Critical Mass & Chain Reaction
  private coreMassKg = 55; // kg (bare critical ~52 kg)
  private reflectorEff = 0.25; // 0..0.9
  private chainAtoms: ChainAtom[] = [];
  private chainNeutrons: ChainNeutron[] = [];
  private atomInst: THREE.InstancedMesh | null = null;
  private neutronInst: THREE.InstancedMesh | null = null;
  private coreShellMesh: THREE.Mesh | null = null;
  private fissionCount = 0;
  private activeNeutronCount = 0;

  // Chapter 3: Density Compression & Supercriticality (M_c ∝ 1/ρ²)
  private compressionRatio = 1.0; // 1.0x -> 2.5x density
  private implosionAuto = true;
  private implosionPhase = 0;
  private implosionCoreMesh: THREE.Mesh | null = null;
  private implosionCoreMat: THREE.MeshStandardMaterial | null = null;
  private implosionShellMesh: THREE.Mesh | null = null;
  private implosionWaveMesh: THREE.Mesh | null = null;
  private implosionWaveMat: THREE.ShaderMaterial | null = null;

  // Chapter 4: E = mc² Fireball & Shockwave
  private fissionedMassKg = 0.85; // ~15 kt TNT (0.7 g mass defect!)
  private blastClock = 0;
  private blastSpeed = 0.65;
  private fireballMesh: THREE.Mesh | null = null;
  private fireballUniforms: {
    uTime: { value: number };
    uTurbulence: { value: number };
    uHeat: { value: number };
  } | null = null;
  private shockwaveMesh: THREE.Mesh | null = null;
  private shockwaveUniforms: { uColor: { value: THREE.Color }; uOpacity: { value: number } } | null = null;
  private groundRingMesh: THREE.Mesh | null = null;
  private cloudInst: THREE.InstancedMesh | null = null;
  private cloudParticles: CloudParticle[] = [];

  private readonly dummy = new THREE.Object3D();
  private readonly tmpCol = new THREE.Color();

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
    if (typeof apply.dropSpeed === 'number') this.dropSpeed = apply.dropSpeed;
    if (typeof apply.coreMassKg === 'number') this.coreMassKg = apply.coreMassKg;
    if (typeof apply.reflectorEff === 'number') this.reflectorEff = apply.reflectorEff;
    if (typeof apply.compressionRatio === 'number') {
      this.compressionRatio = apply.compressionRatio;
      this.implosionAuto = false;
    }
    if (typeof apply.implosionAuto === 'boolean') this.implosionAuto = apply.implosionAuto;
    if (typeof apply.fissionedMassKg === 'number') this.fissionedMassKg = apply.fissionedMassKg;
    if (apply.triggerBlast === true) this.blastClock = 0;
    if (apply.fireNeutron === true) this.dropPhase = 0;
    this.rebuildScene();
  }

  public reset(): void {
    this.simTime = 0;
    this.dropPhase = 0;
    this.implosionPhase = 0;
    this.blastClock = 0;
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
    this.dropMesh = null;
    this.dropUniforms = null;
    this.incomingNeutron = null;
    this.daughterBa = null;
    this.daughterKr = null;
    this.emittedNeutrons = [];
    this.gammaRing = null;
    this.chainAtoms = [];
    this.chainNeutrons = [];
    this.atomInst = null;
    this.neutronInst = null;
    this.coreShellMesh = null;
    this.fissionCount = 0;
    this.activeNeutronCount = 0;
    this.implosionCoreMesh = null;
    this.implosionCoreMat = null;
    this.implosionShellMesh = null;
    this.implosionWaveMesh = null;
    this.implosionWaveMat = null;
    this.fireballMesh = null;
    this.fireballUniforms = null;
    this.shockwaveMesh = null;
    this.shockwaveUniforms = null;
    this.groundRingMesh = null;
    this.cloudInst = null;
    this.cloudParticles = [];
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;
    if (this.chapterId === 'nuc-liquiddrop') this.buildLiquidDropScene();
    else if (this.chapterId === 'nuc-critical') this.buildCriticalMassScene();
    else if (this.chapterId === 'nuc-implosion') this.buildImplosionScene();
    else this.buildFireballScene();
  }

  // ---------------- 1. LIQUID-DROP FISSION ----------------
  private buildLiquidDropScene(): void {
    this.dropPhase = 0;

    // Blender Neutron Beam Source on the left (-7.2)
    const emitter = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(2.6, 1.2, 1.2)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.65 })),
    );
    emitter.position.set(-7.4, 0, 0);
    this.attachStudy(emitter, {
      key: 'nuc-emitter',
      title: 'Thermal Neutron Source',
      badge: 'TRIGGER PARTICLE',
      accent: '#38bdf8',
      simple: 'Fires a single slow, uncharged neutron straight into the Uranium-235 nucleus—no electric repulsion stops it!',
      deeper: 'Thermal neutrons (~0.025 eV) have a huge U-235 capture cross-section (~585 barns), forming excited U-236*.',
    });
    this.group.add(emitter);
    void attachModel(emitter, 'neutron_emitter', { fit: 'x' });

    // Incoming slow neutron
    this.incomingNeutron = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.28, 16, 16)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.0 })),
    );
    this.incomingNeutron.position.set(-5.8, 0, 0);
    this.group.add(this.incomingNeutron);

    // Custom GLSL Liquid-Drop U-235 Nucleus at origin
    this.dropUniforms = {
      uTime: { value: 0 },
      uElongation: { value: 0 },
    };
    const dropMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: LIQUID_DROP_VERT,
        fragmentShader: LIQUID_DROP_FRAG,
        uniforms: this.dropUniforms,
        transparent: true,
      }),
    );
    this.dropMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(1.75, 48, 36)), dropMat);
    this.attachStudy(this.dropMesh, {
      key: 'nuc-u235',
      title: 'Uranium-235 Nucleus (Liquid-Drop Model)',
      badge: 'STRONG vs COULOMB',
      accent: '#f97316',
      simple: 'Absorbing one extra neutron makes U-236 wobble violently like a water droplet until electric repulsion snaps its thin neck in two!',
      deeper: 'Bohr-Wheeler liquid-drop model: fission occurs when Coulomb repulsion overcomes the strong nuclear surface tension.',
    });
    this.group.add(this.dropMesh);

    // Recoiling daughter nuclei (Ba-141 & Kr-92)
    this.daughterBa = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(1.22, 32, 24)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 0.75, roughness: 0.25 })),
    );
    this.daughterKr = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.98, 32, 24)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.75, roughness: 0.25 })),
    );
    this.daughterBa.visible = false;
    this.daughterKr.visible = false;
    this.attachStudy(this.daughterBa, {
      key: 'nuc-daughters',
      title: 'Fission Fragments (Ba-141 & Kr-92)',
      badge: '~170 MeV KINETIC',
      accent: '#f97316',
      simple: 'Once the neck snaps, 56 protons and 36 protons violently repel each other—carrying away 85% of the fission energy as heat!',
      deeper: 'Total products weigh ~0.186 u less than U-235 + n; by E = Δmc², that tiny mass defect becomes ~200 MeV.',
    });
    this.attachStudy(this.daughterKr, this.daughterBa.userData.study as StudyMeta);
    this.group.add(this.daughterBa, this.daughterKr);

    // 3 Prompt Fast Neutrons emitted after scission
    const nG = this.track(new THREE.SphereGeometry(0.24, 14, 14));
    const nM = this.track(new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x06b6d4, emissiveIntensity: 1.1 }));
    for (let i = 0; i < 3; i++) {
      const n = new THREE.Mesh(nG, nM);
      n.visible = false;
      this.group.add(n);
      this.emittedNeutrons.push(n);
    }

    // Expanding Gamma-Ray Flash Ring
    this.gammaRing = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(1.0, 0.08, 12, 48)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.0 })),
    );
    this.gammaRing.rotation.x = Math.PI * 0.5;
    this.group.add(this.gammaRing);
  }

  // ---------------- 2. CRITICAL MASS & CHAIN REACTION ----------------
  private buildCriticalMassScene(): void {
    const coreRadius = 2.4 + (this.coreMassKg / 85) * 2.8;

    // Translucent outer fissile core cutaway + reflector shell
    this.coreShellMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(coreRadius, 32, 24)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: this.reflectorEff > 0.35 ? 0xfbbf24 : 0x38bdf8,
          transparent: true,
          opacity: 0.14,
          wireframe: true,
        }),
      ),
    );
    this.attachStudy(this.coreShellMesh, {
      key: 'nuc-core-shell',
      title: 'Spherical Fissile Core & Neutron Reflector',
      badge: 'CRITICAL MASS',
      accent: '#38bdf8',
      simple: 'A small lump loses too many neutrons through its surface. Increase mass or add a reflector so each split triggers at least one more!',
      deeper: 'Surface-to-volume ratio 3/R governs neutron leakage; crossing k_eff = 1 turns a fizzle into an exponential chain reaction.',
    });
    this.group.add(this.coreShellMesh);

    // Populate 180 U-235 nuclei uniformly inside the sphere
    const N_ATOMS = 180;
    const atomG = this.track(new THREE.SphereGeometry(0.24, 14, 12));
    const atomM = this.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.25 }));
    this.atomInst = new THREE.InstancedMesh(atomG, atomM, N_ATOMS);
    this.atomInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < N_ATOMS; i++) {
      // Deterministic golden-sphere packing inside coreRadius * 0.9
      const u = (i + 0.5) / N_ATOMS;
      const r = coreRadius * 0.88 * Math.cbrt(u);
      const phi = Math.acos(1 - 2 * ((i * 0.61803398875) % 1));
      const theta = i * 2.399963229728653;
      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
      this.chainAtoms.push({ pos, fissioned: false, flash: 0 });
    }
    this.group.add(this.atomInst);

    // Pool of 360 live neutrons
    const MAX_N = 360;
    const nG = this.track(new THREE.SphereGeometry(0.11, 8, 8));
    const nM = this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    this.neutronInst = new THREE.InstancedMesh(nG, nM, MAX_N);
    this.neutronInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.neutronInst);

    // Seed 3 initial neutrons at center
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.chainNeutrons.push({
        pos: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(Math.cos(a) * 5.2, Math.sin(a * 1.7) * 3.0, Math.sin(a) * 5.2),
        age: 0,
        alive: true,
      });
    }
  }

  // ---------------- 3. DENSITY COMPRESSION (M_c ∝ 1/ρ²) ----------------
  private buildImplosionScene(): void {
    this.implosionPhase = 0;

    // Inner subcritical fissile core (Blender fissile_core model!)
    this.implosionCoreMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.75 }),
    );
    this.implosionCoreMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(2.1, 32, 24)),
      this.implosionCoreMat,
    );
    this.attachStudy(this.implosionCoreMesh, {
      key: 'nuc-implosion-core',
      title: 'Compressed Fissile Core (M_c ∝ 1/ρ²)',
      badge: 'SUPERCRITICAL DENSITY',
      accent: '#f97316',
      simple: 'Squeezing the same mass to 2× density cuts the critical mass by 4×! Nuclei sit closer together so neutrons can barely escape.',
      deeper: 'Neutron mean free path λ = 1/(nσ) shrinks as ρ⁻¹ while core radius scales as ρ⁻¹/³, so critical mass M_c scales strictly as 1/ρ².',
    });
    this.group.add(this.implosionCoreMesh);
    void attachModel(this.implosionCoreMesh, 'fissile_core');

    // Outer symmetric geometric compression array (Blender compression_shell model!)
    this.implosionShellMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(4.6, 24, 18)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.6 })),
    );
    this.attachStudy(this.implosionShellMesh, {
      key: 'nuc-implosion-shell',
      title: 'Symmetric Spherical Compression Wave',
      badge: 'CONVERGING PRESSURE',
      accent: '#fbbf24',
      simple: 'A perfectly symmetric inward pressure wave compresses the core uniformly from all sides without squeezing it out sideways.',
      deeper: 'Spherical symmetry converts an initially subcritical assembly into a deeply supercritical state within microseconds.',
    });
    this.group.add(this.implosionShellMesh);
    void attachModel(this.implosionShellMesh, 'compression_shell');

    // Converging GLSL pressure-wave shell
    this.implosionWaveMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: SHOCKWAVE_VERT,
        fragmentShader: SHOCKWAVE_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(0xfbbf24) },
          uOpacity: { value: 0.85 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.implosionWaveMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(4.4, 36, 24)),
      this.implosionWaveMat,
    );
    this.group.add(this.implosionWaveMesh);
  }

  // ---------------- 4. E = mc² FIREBALL & SHOCKWAVE ----------------
  private buildFireballScene(): void {
    this.blastClock = 0;

    // Ground-zero Blender calorimeter telemetry ring sitting on the floor
    this.groundRingMesh = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(9.0, 9.0, 0.35, 48)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.65 })),
    );
    this.groundRingMesh.position.set(0, -4.6, 0);
    this.attachStudy(this.groundRingMesh, {
      key: 'nuc-calorimeter',
      title: 'Blast Telemetry & Calorimeter Ring',
      badge: '50% BLAST · 35% HEAT · 15% RAD',
      accent: '#38bdf8',
      simple: 'Measures the expanding Sedov-Taylor shockwave: roughly half the energy drives the blast wave, a third radiates as blinding heat, and 15% is nuclear radiation.',
      deeper: 'G. I. Taylor famously deduced the Trinity yield from public fireball photos using R(t) = ξ₀ (E / ρ₀)^(1/5) t^(2/5).',
    });
    this.group.add(this.groundRingMesh);
    void attachModel(this.groundRingMesh, 'blast_calorimeter', { fit: 'x' });

    // Custom GLSL Volumetric Blackbody Fireball Core
    this.fireballUniforms = {
      uTime: { value: 0 },
      uTurbulence: { value: 0.35 },
      uHeat: { value: 1.0 },
    };
    const fbMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: FIREBALL_VERT,
        fragmentShader: FIREBALL_FRAG,
        uniforms: this.fireballUniforms,
        transparent: true,
      }),
    );
    this.fireballMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(1.0, 48, 36)), fbMat);
    this.fireballMesh.position.set(0, -1.8, 0);
    this.attachStudy(this.fireballMesh, {
      key: 'nuc-fireball',
      title: 'Blackbody Plasma Fireball (E = Δmc²)',
      badge: 'MILLIONS OF KELVIN',
      accent: '#f97316',
      simple: 'Converting less than ONE GRAM of matter into energy heats the surrounding air into a miniature sun glowing brighter than daylight!',
      deeper: 'Soft X-rays superheat nearby air into an incandescent plasma sphere whose buoyancy launches a towering thermal convection column.',
    });
    this.group.add(this.fireballMesh);

    // Expanding GLSL Mach-Stem Shockwave Shell
    this.shockwaveUniforms = {
      uColor: { value: new THREE.Color(0x7dd3fc) },
      uOpacity: { value: 0.9 },
    };
    const swMat = this.track(
      new THREE.ShaderMaterial({
        vertexShader: SHOCKWAVE_VERT,
        fragmentShader: SHOCKWAVE_FRAG,
        uniforms: this.shockwaveUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.shockwaveMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(1.0, 40, 28)), swMat);
    this.shockwaveMesh.position.set(0, -1.8, 0);
    this.group.add(this.shockwaveMesh);

    // Rising toroidal convection plume particles (mushroom cap & stem)
    const CLOUD_N = 140;
    const cGeom = this.track(new THREE.SphereGeometry(0.45, 10, 8));
    const cMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        transparent: true,
        opacity: 0.72,
      }),
    );
    this.cloudInst = new THREE.InstancedMesh(cGeom, cMat, CLOUD_N);
    this.cloudInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < CLOUD_N; i++) {
      this.cloudParticles.push({
        angle: (i * 2.399963) % (Math.PI * 2),
        radius: 0.4 + ((i * 37) % 100) / 100,
        height: ((i * 19) % 100) / 100,
        speed: 0.55 + ((i * 13) % 50) / 100,
        seed: i * 0.71,
      });
    }
    this.group.add(this.cloudInst);
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'nuc-liquiddrop') {
      this.updateLiquidDrop(dt);
    } else if (this.chapterId === 'nuc-critical') {
      this.updateCriticalMass(dt);
    } else if (this.chapterId === 'nuc-implosion') {
      this.updateImplosion(dt);
    } else {
      this.updateFireball(dt);
    }
  }

  private updateLiquidDrop(dt: number): void {
    this.dropPhase = (this.dropPhase + dt * this.dropSpeed) % 1.0;
    const p = this.dropPhase;

    // 0.00 - 0.25: Thermal neutron approaches from -5.8 to -1.6
    // 0.25 - 0.62: U-236* wobbles & stretches into peanut (uElongation 0 -> 1)
    // 0.62 - 1.00: Scission! Daughter Ba-141 & Kr-92 recoil + 3 fast neutrons + gamma ring
    if (this.incomingNeutron) {
      if (p < 0.25) {
        this.incomingNeutron.visible = true;
        const t = p / 0.25;
        this.incomingNeutron.position.set(-5.8 + t * 4.4, 0, 0);
      } else {
        this.incomingNeutron.visible = false;
      }
    }

    if (this.dropMesh && this.dropUniforms) {
      this.dropUniforms.uTime.value = this.simTime;
      if (p < 0.62) {
        this.dropMesh.visible = true;
        const elong = p < 0.25 ? 0.0 : (p - 0.25) / 0.37;
        this.dropUniforms.uElongation.value = elong;
      } else {
        this.dropMesh.visible = false;
      }
    }

    const post = p >= 0.62 ? (p - 0.62) / 0.38 : 0;
    if (this.daughterBa && this.daughterKr) {
      this.daughterBa.visible = p >= 0.62;
      this.daughterKr.visible = p >= 0.62;
      if (p >= 0.62) {
        this.daughterBa.position.set(-1.3 - post * 4.8, Math.sin(post * 3.0) * 0.35, 0.2);
        this.daughterKr.position.set(1.3 + post * 5.6, -Math.sin(post * 3.0) * 0.45, -0.2);
      }
    }

    const dirs = [
      new THREE.Vector3(0.45, 0.85, 0.25).normalize(),
      new THREE.Vector3(-0.35, -0.78, 0.52).normalize(),
      new THREE.Vector3(0.75, -0.25, -0.62).normalize(),
    ];
    for (let i = 0; i < this.emittedNeutrons.length; i++) {
      const m = this.emittedNeutrons[i];
      m.visible = p >= 0.62;
      if (p >= 0.62) {
        m.position.copy(dirs[i]).multiplyScalar(0.8 + post * 9.5);
      }
    }

    if (this.gammaRing) {
      const mat = this.gammaRing.material as THREE.MeshBasicMaterial;
      if (p >= 0.62) {
        const s = 0.6 + post * 8.5;
        this.gammaRing.scale.set(s, s, s);
        mat.opacity = Math.max(0, (1 - post) * 0.9);
      } else {
        mat.opacity = 0;
      }
    }
  }

  private updateCriticalMass(dt: number): void {
    const coreRadius = 2.4 + (this.coreMassKg / 85) * 2.8;
    const kEff = effectiveMultiplicationFactor(this.coreMassKg, 1.0, this.reflectorEff);
    const stepDt = Math.min(dt, 0.04);

    // Move neutrons & check fission collisions or boundary escape/reflection
    let aliveCount = 0;
    const spawned: ChainNeutron[] = [];

    for (const n of this.chainNeutrons) {
      if (!n.alive) continue;
      n.age += stepDt;
      n.pos.addScaledVector(n.vel, stepDt);

      // Boundary reflection or escape
      const dist = n.pos.length();
      if (dist > coreRadius) {
        if (Math.random() < this.reflectorEff) {
          // Neutron reflector bounces it back inside!
          n.pos.setLength(coreRadius * 0.96);
          n.vel.reflect(n.pos.clone().normalize());
        } else {
          n.alive = false;
          continue;
        }
      }

      if (n.age > 3.5) {
        n.alive = false;
        continue;
      }

      // Check collision with unfissioned U-235 atoms
      for (const a of this.chainAtoms) {
        if (a.fissioned) continue;
        if (n.pos.distanceToSquared(a.pos) < 0.24) {
          a.fissioned = true;
          a.flash = 1.0;
          this.fissionCount++;
          n.alive = false;
          // Emit 2-3 new fast neutrons scaled by kEff
          const count = kEff > 1.05 ? 3 : 2;
          for (let j = 0; j < count; j++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const spd = 4.6 + Math.random() * 2.2;
            spawned.push({
              pos: a.pos.clone(),
              vel: new THREE.Vector3(
                spd * Math.sin(phi) * Math.cos(theta),
                spd * Math.cos(phi),
                spd * Math.sin(phi) * Math.sin(theta),
              ),
              age: 0,
              alive: true,
            });
          }
          break;
        }
      }
      if (n.alive) aliveCount++;
    }

    // Append spawned neutrons up to pool limit (360)
    for (const s of spawned) {
      if (this.chainNeutrons.length < 360) {
        this.chainNeutrons.push(s);
        aliveCount++;
      } else {
        const dead = this.chainNeutrons.find((x) => !x.alive);
        if (dead) {
          dead.pos.copy(s.pos);
          dead.vel.copy(s.vel);
          dead.age = 0;
          dead.alive = true;
          aliveCount++;
        }
      }
    }

    // Auto-replenish if all neutrons died out or nearly all atoms fissioned so demo stays alive
    const remainingAtoms = this.chainAtoms.filter((a) => !a.fissioned).length;
    if (aliveCount === 0 || remainingAtoms < 12) {
      for (const a of this.chainAtoms) {
        if (remainingAtoms < 12) a.fissioned = false;
      }
      if (remainingAtoms < 12) this.fissionCount = 0;
      const a0 = Math.random() * Math.PI * 2;
      this.chainNeutrons.push({
        pos: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(Math.cos(a0) * 5.0, (Math.random() - 0.5) * 4.0, Math.sin(a0) * 5.0),
        age: 0,
        alive: true,
      });
      aliveCount = 1;
    }
    this.activeNeutronCount = aliveCount;

    // Update atom instanced mesh
    if (this.atomInst) {
      for (let i = 0; i < this.chainAtoms.length; i++) {
        const a = this.chainAtoms[i];
        a.flash = Math.max(0, a.flash - stepDt * 2.2);
        const sc = a.fissioned ? 0.45 + a.flash * 1.45 : 1.0;
        this.dummy.position.copy(a.pos);
        this.dummy.scale.setScalar(sc);
        this.dummy.updateMatrix();
        this.atomInst.setMatrixAt(i, this.dummy.matrix);

        if (!a.fissioned) {
          this.tmpCol.setHex(0x38bdf8);
        } else if (a.flash > 0.15) {
          this.tmpCol.setHex(0xfef08a);
        } else {
          this.tmpCol.setHex(0x475569);
        }
        this.atomInst.setColorAt(i, this.tmpCol);
      }
      this.atomInst.instanceMatrix.needsUpdate = true;
      if (this.atomInst.instanceColor) this.atomInst.instanceColor.needsUpdate = true;
    }

    // Update neutron instanced mesh
    if (this.neutronInst) {
      for (let i = 0; i < 360; i++) {
        const n = this.chainNeutrons[i];
        if (n && n.alive) {
          this.dummy.position.copy(n.pos);
          this.dummy.scale.setScalar(1.0);
        } else {
          this.dummy.position.set(0, -999, 0);
          this.dummy.scale.setScalar(0.001);
        }
        this.dummy.updateMatrix();
        this.neutronInst.setMatrixAt(i, this.dummy.matrix);
      }
      this.neutronInst.instanceMatrix.needsUpdate = true;
    }
  }

  private updateImplosion(dt: number): void {
    if (this.implosionAuto) {
      this.implosionPhase = (this.implosionPhase + dt * 0.35) % 1.0;
      // Smooth cyclic pulse from 1.0x up to 2.4x density and reset
      const pulse = Math.sin(this.implosionPhase * Math.PI);
      this.compressionRatio = 1.0 + 1.4 * pulse * pulse;
    }

    const rho = this.compressionRatio;
    const radiusScale = Math.pow(1 / rho, 1 / 3); // V ∝ 1/ρ => R ∝ ρ^(-1/3)
    const kEff = effectiveMultiplicationFactor(16.0, rho, 0.35);

    if (this.implosionCoreMesh) {
      this.implosionCoreMesh.scale.setScalar(radiusScale);
      this.implosionCoreMesh.rotation.y += dt * (0.4 + rho * 0.5);
    }
    if (this.implosionCoreMat) {
      if (kEff >= 1.0) {
        this.implosionCoreMat.color.setHex(0xf97316);
        this.implosionCoreMat.emissive.setHex(0xef4444);
        this.implosionCoreMat.emissiveIntensity = 1.15;
      } else {
        this.implosionCoreMat.color.setHex(0x38bdf8);
        this.implosionCoreMat.emissive.setHex(0x0284c7);
        this.implosionCoreMat.emissiveIntensity = 0.65;
      }
    }

    if (this.implosionShellMesh) {
      this.implosionShellMesh.rotation.y -= dt * 0.25;
      const shellS = 1.0 - (rho - 1.0) * 0.14;
      this.implosionShellMesh.scale.setScalar(shellS);
    }

    if (this.implosionWaveMesh && this.implosionWaveMat) {
      const waveT = (this.simTime * 0.75) % 1.0;
      const wScale = 1.05 - waveT * 0.62;
      this.implosionWaveMesh.scale.setScalar(wScale);
      this.implosionWaveMat.uniforms.uOpacity.value = Math.sin(waveT * Math.PI) * 0.42;
      this.implosionWaveMat.uniforms.uColor.value.setHex(kEff >= 1.0 ? 0xf97316 : 0xfbbf24);
    }
  }

  private updateFireball(dt: number): void {
    this.blastClock = (this.blastClock + dt * this.blastSpeed) % 7.5;
    const t = this.blastClock;
    const yieldScale = Math.pow(this.fissionedMassKg / 0.85, 0.2);

    // Fireball grows rapidly then rises via buoyancy
    const fbRadius = (1.1 + 3.4 * Math.pow(Math.min(t, 4.5) / 4.5, 0.42)) * yieldScale;
    const riseY = -1.8 + Math.max(0, t - 0.8) * 0.92;
    const heat = Math.max(0.35, 1.0 - t * 0.085);

    if (this.fireballMesh && this.fireballUniforms) {
      this.fireballMesh.scale.setScalar(fbRadius);
      this.fireballMesh.position.set(0, riseY, 0);
      this.fireballUniforms.uTime.value = this.simTime;
      this.fireballUniforms.uHeat.value = heat;
      this.fireballUniforms.uTurbulence.value = 0.24 + Math.min(0.32, t * 0.05);
    }

    // Sedov-Taylor shockwave shell expands smoothly ahead of fireball
    if (this.shockwaveMesh && this.shockwaveUniforms) {
      const swR = (0.9 + 9.2 * Math.pow(t / 7.5, 0.4)) * yieldScale;
      this.shockwaveMesh.scale.setScalar(swR);
      this.shockwaveMesh.position.set(0, -1.8, 0);
      this.shockwaveUniforms.uOpacity.value = Math.max(0, 1.0 - t / 7.2);
    }

    // Rising toroidal mushroom convection plume
    if (this.cloudInst) {
      for (let i = 0; i < this.cloudParticles.length; i++) {
        const cp = this.cloudParticles[i];
        const age = Math.max(0, t - 0.5);
        const isCap = i % 3 !== 0;
        const ang = cp.angle + age * 0.18;
        if (isCap) {
          // Toroidal vortex roll around rising fireball cap
          const torusR = (1.6 + cp.radius * 2.2) * yieldScale * Math.min(1.25, 0.35 + age * 0.18);
          const roll = age * cp.speed * 1.1 + cp.seed;
          const r = torusR + Math.cos(roll) * 0.85;
          const y = riseY + Math.sin(roll) * 0.95 + 0.4;
          this.dummy.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
          this.dummy.scale.setScalar(0.65 + Math.min(1.2, age * 0.2) * cp.radius);
        } else {
          // Rising stem column from ground zero up to fireball
          const hFrac = (cp.height + age * 0.12) % 1.0;
          const stemY = -4.3 + hFrac * (riseY + 4.3);
          const stemR = (0.55 + cp.radius * 0.75) * (1.15 - hFrac * 0.35);
          this.dummy.position.set(Math.cos(ang) * stemR, stemY, Math.sin(ang) * stemR);
          this.dummy.scale.setScalar(0.5 + cp.radius * 0.55);
        }
        this.dummy.updateMatrix();
        this.cloudInst.setMatrixAt(i, this.dummy.matrix);
        // Inner warm orange glow cooling to ash-gray outside
        if (isCap && cp.radius < 0.45) {
          this.tmpCol.setRGB(1.0, 0.48 * heat + 0.12, 0.14 * heat);
        } else {
          this.tmpCol.setRGB(0.32 + 0.35 * heat, 0.28 + 0.18 * heat, 0.3);
        }
        this.cloudInst.setColorAt(i, this.tmpCol);
      }
      this.cloudInst.instanceMatrix.needsUpdate = true;
      if (this.cloudInst.instanceColor) this.cloudInst.instanceColor.needsUpdate = true;
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'nuc-liquiddrop') {
      return {
        sliders: [
          {
            key: 'dropSpeed',
            label: 'Slow-Motion Playback Speed',
            min: 0.08,
            max: 0.55,
            step: 0.02,
            value: this.dropSpeed,
            unit: '×',
            noteTitle: 'Nuclear Scission Timescale',
            noteText: 'Real nuclear scission happens in ~10⁻²⁰ seconds—here we slow it down by 10²⁰× so you can watch the neck pinch!',
          },
        ],
        toggles: [],
        actions: [{ id: 'fire-neutron', label: 'Fire Thermal Neutron' }],
      };
    }

    if (this.chapterId === 'nuc-critical') {
      return {
        sliders: [
          {
            key: 'coreMassKg',
            label: 'Uranium-235 Core Mass',
            min: 18,
            max: 85,
            step: 1,
            value: this.coreMassKg,
            unit: ' kg',
            noteTitle: 'Critical Mass Threshold',
            noteText: 'Bare U-235 becomes critical near 52 kg. Above critical mass, each split triggers more than one new split.',
          },
          {
            key: 'reflectorEff',
            label: 'Neutron Reflector (Tamper)',
            min: 0,
            max: 0.85,
            step: 0.05,
            value: this.reflectorEff,
            unit: '',
            noteTitle: 'Neutron Reflection',
            noteText: 'A dense surrounding reflector bounces escaping neutrons back into the core, cutting the required critical mass sharply.',
          },
        ],
        toggles: [],
        actions: [{ id: 'reset-chain', label: 'Reset Chain Reaction' }],
      };
    }

    if (this.chapterId === 'nuc-implosion') {
      return {
        sliders: [
          {
            key: 'compressionRatio',
            label: 'Density Compression (ρ / ρ₀)',
            min: 1.0,
            max: 2.5,
            step: 0.05,
            value: Number(this.compressionRatio.toFixed(2)),
            unit: '×',
            noteTitle: 'Inverse-Square Critical Mass Law',
            noteText: 'Doubling core density cuts critical mass by 4× because M_c ∝ 1 / ρ².',
          },
        ],
        toggles: [
          {
            key: 'implosionAuto',
            label: 'Animate Compression Pulse',
            checked: this.implosionAuto,
            swatchColor: '#fbbf24',
            noteTitle: 'Cyclic Compression',
            noteText: 'Watch k_eff cross from subcritical (blue) to supercritical (orange-red) as density rises.',
          },
        ],
        actions: [],
      };
    }

    return {
      sliders: [
        {
          key: 'fissionedMassKg',
          label: 'Completely Fissioned Mass',
          min: 0.1,
          max: 2.0,
          step: 0.05,
          value: this.fissionedMassKg,
          unit: ' kg',
          noteTitle: 'Mass-to-Energy Yield',
          noteText: 'Fissioning just 0.85 kg of U-235 converts ~0.77 grams of mass directly into ~15 kilotons of TNT energy!',
        },
        {
          key: 'blastSpeed',
          label: 'Time-Lapse Rate',
          min: 0.2,
          max: 1.4,
          step: 0.05,
          value: this.blastSpeed,
          unit: '×',
          noteTitle: 'Sedov-Taylor Expansion',
          noteText: 'Controls how quickly the fireball rise and shockwave expansion play back.',
        },
      ],
      toggles: [],
      actions: [{ id: 'replay-blast', label: 'Replay Energy Release' }],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'dropSpeed' && typeof value === 'number') this.dropSpeed = value;
    else if (key === 'coreMassKg' && typeof value === 'number') {
      this.coreMassKg = value;
      this.rebuildScene();
    } else if (key === 'reflectorEff' && typeof value === 'number') {
      this.reflectorEff = value;
      this.rebuildScene();
    } else if (key === 'compressionRatio' && typeof value === 'number') {
      this.compressionRatio = value;
      this.implosionAuto = false;
    } else if (key === 'implosionAuto' && typeof value === 'boolean') {
      this.implosionAuto = value;
    } else if (key === 'fissionedMassKg' && typeof value === 'number') {
      this.fissionedMassKg = value;
    } else if (key === 'blastSpeed' && typeof value === 'number') {
      this.blastSpeed = value;
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'fire-neutron') this.dropPhase = 0;
    else if (actionId === 'reset-chain') this.rebuildScene();
    else if (actionId === 'replay-blast') this.blastClock = 0;
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'nuc-liquiddrop') {
      const stage =
        this.dropPhase < 0.25
          ? 'Neutron Approach'
          : this.dropPhase < 0.62
            ? 'Quadrupole Wobble'
            : 'Scission + 200 MeV';
      const neck = liquidDropNeck(this.dropPhase < 0.25 ? 0 : Math.min(1, (this.dropPhase - 0.25) / 0.37));
      return [
        {
          labelSimple: 'Reaction Stage',
          labelPhysics: 'Fission Phase',
          value: stage,
          noteTitle: 'Three Steps of Fission',
          noteText: 'Capture → Liquid-drop neck pinch → Coulomb scission into Ba-141, Kr-92, and 3 fast neutrons.',
        },
        {
          labelSimple: 'Energy Released',
          labelPhysics: 'Q-Value',
          value: '200 MeV',
          noteTitle: 'Per Single Atom',
          noteText: '50 million times more energy per reaction than burning a single carbon atom in coal or TNT!',
        },
        {
          labelSimple: 'Neck Width',
          labelPhysics: 'Saddle Neck r/R₀',
          value: `${(neck * 100).toFixed(0)}%`,
          noteTitle: 'Saddle Point',
          noteText: 'Once the neck drops to 0%, strong-force glue breaks and electrostatic repulsion flings the halves apart.',
        },
        {
          labelSimple: 'New Neutrons',
          labelPhysics: 'Prompt ν',
          value: '2–3 n',
          noteTitle: 'Chain-Reaction Seed',
          noteText: 'Because 1 neutron goes in and ~2.4 come out, a self-sustaining chain reaction becomes possible.',
        },
      ];
    }

    if (this.chapterId === 'nuc-critical') {
      const mc = criticalMassKg(1.0, this.reflectorEff);
      const k = effectiveMultiplicationFactor(this.coreMassKg, 1.0, this.reflectorEff);
      return [
        {
          labelSimple: 'Multiplication Factor',
          labelPhysics: 'k_eff',
          value: k.toFixed(2),
          noteTitle: 'Subcritical vs Supercritical',
          noteText: 'k < 1 dies out; k = 1 stays steady (reactor); k > 1 doubles exponentially every generation!',
        },
        {
          labelSimple: 'Critical Mass Needed',
          labelPhysics: 'M_crit',
          value: `${mc.toFixed(1)} kg`,
          noteTitle: 'Geometry + Reflector',
          noteText: 'Adding a neutron reflector bounces stray neutrons back inside, lowering critical mass dramatically.',
        },
        {
          labelSimple: 'Live Neutrons',
          labelPhysics: 'Neutron Flux N',
          value: `${this.activeNeutronCount}`,
          noteTitle: 'Live Population',
          noteText: 'Number of fast neutrons currently zipping through the core.',
        },
        {
          labelSimple: 'Splits Counted',
          labelPhysics: 'Cumulative Fissions',
          value: `${this.fissionCount}`,
          noteTitle: 'Cascade Progress',
          noteText: 'Total U-235 nuclei split in this run.',
        },
      ];
    }

    if (this.chapterId === 'nuc-implosion') {
      const mc = criticalMassKg(this.compressionRatio, 0.35);
      const k = effectiveMultiplicationFactor(16.0, this.compressionRatio, 0.35);
      return [
        {
          labelSimple: 'Core Density',
          labelPhysics: 'Compression ρ / ρ₀',
          value: `${this.compressionRatio.toFixed(2)}×`,
          noteTitle: 'Density Boost',
          noteText: 'Compressing a solid metal core packs nuclei closer together along every neutron path.',
        },
        {
          labelSimple: 'New Critical Mass',
          labelPhysics: 'M_c(ρ) ∝ 1/ρ²',
          value: `${mc.toFixed(1)} kg`,
          noteTitle: 'Inverse-Square Law',
          noteText: 'At 2.0× normal density, the required critical mass drops to just 25% of its uncompressed value!',
        },
        {
          labelSimple: 'Multiplication k',
          labelPhysics: 'k_eff (16 kg core)',
          value: k.toFixed(2),
          noteTitle: 'Crossing Supercriticality',
          noteText: 'A 16 kg core is safely subcritical at 1× density, yet jumps deeply supercritical once compressed!',
        },
        {
          labelSimple: 'Core State',
          labelPhysics: 'Regime',
          value: k >= 1.0 ? 'SUPERCRITICAL' : 'Subcritical',
          noteTitle: 'Criticality Regime',
          noteText: 'Switches to supercritical the instant core mass exceeds the compressed critical mass M_c(ρ).',
        },
      ];
    }

    const y = computeFissionYield(this.fissionedMassKg);
    const swM = sedovTaylorRadiusMeters(y.yieldKt, Math.max(0.02, this.blastClock * 0.18));
    return [
      {
        labelSimple: 'Total Yield',
        labelPhysics: 'TNT Equivalent',
        value: `${y.yieldKt.toFixed(1)} kt`,
        noteTitle: 'Kilotons of TNT',
        noteText: `1 kt = 4.184 × 10¹² J. Fissioning ${this.fissionedMassKg.toFixed(2)} kg releases ${(y.energyJoules / 1e12).toFixed(0)} TJ.`,
      },
      {
        labelSimple: 'Matter Converted',
        labelPhysics: 'Mass Defect Δm = E/c²',
        value: `${y.massDefectGrams.toFixed(2)} g`,
        noteTitle: 'Less Than a Paperclip',
        noteText: 'Only ~0.09% of the uranium mass disappears—yet multiplied by c², even 0.8 grams equals ~15 kt!',
      },
      {
        labelSimple: 'Shockwave Radius',
        labelPhysics: 'Sedov-Taylor R(t)',
        value: `${swM.toFixed(0)} m`,
        noteTitle: 'Blast Front Scaling',
        noteText: 'R(t) grows as (E/ρ₀)^(1/5) · t^(2/5) in air.',
      },
      {
        labelSimple: 'Energy Split',
        labelPhysics: 'Blast / Heat / Rad',
        value: '50 / 35 / 15%',
        noteTitle: 'Where Energy Goes',
        noteText: '50% mechanical shockwave, 35% blinding thermal flash, 15% ionizing radiation.',
      },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'nuc-liquiddrop') {
      return {
        captionSimple: 'One slow neutron splits U-235 into two lighter atoms, 3 neutrons, and 200 MeV!',
        captionPhysics: 'Neutron-induced fission Q-value and mass defect:',
        tex: '^{235}_{92}\\text{U} + n \\longrightarrow\\; ^{141}_{56}\\text{Ba} + {}^{92}_{36}\\text{Kr} + 3n + 200\\text{ MeV}',
      };
    }
    if (this.chapterId === 'nuc-critical') {
      return {
        captionSimple: 'When k_eff > 1, each generation multiplies exponentially!',
        captionPhysics: 'Exponential neutron population growth with generation time τ:',
        tex: 'N(t) = N_0\\, e^{(k_{\\text{eff}} - 1)\\, t / \\tau}, \\qquad k_{\\text{eff}} > 1 \\;\\Rightarrow\\; \\text{Supercritical}',
      };
    }
    if (this.chapterId === 'nuc-implosion') {
      return {
        captionSimple: 'Squeezing the core to 2× density cuts the critical mass by 4×!',
        captionPhysics: 'Critical mass scales inversely with density squared:',
        tex: 'M_c(\\rho) = M_{c0}\\left(\\frac{\\rho_0}{\\rho}\\right)^2 (1 - 0.55\\, R_{\\text{ref}})',
      };
    }
    return {
      captionSimple: 'A fraction of a gram of missing mass becomes a massive fireball and shockwave!',
      captionPhysics: 'Einstein mass-energy equivalence and Sedov-Taylor blast scaling:',
      tex: 'E = \\Delta m\\, c^2, \\qquad R(t) = \\xi_0 \\left(\\frac{E}{\\rho_0}\\right)^{1/5} t^{2/5}',
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'nuc-liquiddrop') {
      const elong = this.dropPhase < 0.25 ? 0 : this.dropPhase < 0.62 ? (this.dropPhase - 0.25) / 0.37 : 1;
      const energy = this.dropPhase >= 0.62 ? 200 : elong * 25;
      return {
        ch1: elong * 100,
        ch2: energy,
        ch3: this.dropPhase >= 0.62 ? 3 : 1,
        labels: ['Stretch', 'MeV', 'n'],
        units: ['%', 'MeV', ''],
      };
    }
    if (this.chapterId === 'nuc-critical') {
      const k = effectiveMultiplicationFactor(this.coreMassKg, 1.0, this.reflectorEff);
      return {
        ch1: this.activeNeutronCount,
        ch2: k,
        ch3: this.fissionCount,
        labels: ['N(t)', 'k_eff', 'Splits'],
        units: ['', '', ''],
      };
    }
    if (this.chapterId === 'nuc-implosion') {
      const k = effectiveMultiplicationFactor(16.0, this.compressionRatio, 0.35);
      const mc = criticalMassKg(this.compressionRatio, 0.35);
      return {
        ch1: this.compressionRatio,
        ch2: k,
        ch3: mc,
        labels: ['ρ/ρ₀', 'k_eff', 'M_c'],
        units: ['×', '', 'kg'],
      };
    }
    const y = computeFissionYield(this.fissionedMassKg);
    const swM = sedovTaylorRadiusMeters(y.yieldKt, Math.max(0.02, this.blastClock * 0.18));
    return {
      ch1: swM,
      ch2: y.yieldKt,
      ch3: y.massDefectGrams,
      labels: ['R(t)', 'Yield', 'Δm'],
      units: ['m', 'kt', 'g'],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    if (this.chapterId === 'nuc-liquiddrop') return { label: 'Vol X · Liquid-Drop Fission', color: '#f97316' };
    if (this.chapterId === 'nuc-critical') return { label: 'Vol X · Critical Mass Chain', color: '#38bdf8' };
    if (this.chapterId === 'nuc-implosion') return { label: 'Vol X · Density Compression', color: '#fbbf24' };
    return { label: 'Vol X · E=mc² Fireball & Shockwave', color: '#ef4444' };
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
    if (this.chapterId === 'nuc-liquiddrop') {
      return [
        {
          id: 'c-nuc-emit',
          label: 'Thermal Neutron',
          accent: '#38bdf8',
          x: -7.2,
          y: 1.4,
          z: 0,
          hover: {
            key: 'c-nuc-emit',
            title: 'Thermal Neutron Trigger',
            badge: 'UNCHARGED',
            accent: '#38bdf8',
            simple: 'Because neutrons have zero electric charge, they glide right past the 92-proton barrier.',
            deeper: 'Capture cross-section peaks at thermal energies (~0.025 eV).',
            metrics: [],
          },
        },
        {
          id: 'c-nuc-u235',
          label: 'U-235 → Ba + Kr + 3n',
          accent: '#f97316',
          x: 0,
          y: 2.5,
          z: 0,
          hover: {
            key: 'c-nuc-u235',
            title: 'Liquid-Drop Scission',
            badge: '200 MeV',
            accent: '#f97316',
            simple: 'One split releases 50 million times more energy than a chemical bond!',
            deeper: 'Strong force holds the droplet together; Coulomb repulsion rips it apart once stretched.',
            metrics: [],
          },
        },
      ];
    }
    if (this.chapterId === 'nuc-fireball') {
      return [
        {
          id: 'c-nuc-fb',
          label: 'Blackbody Fireball',
          accent: '#f97316',
          x: 0,
          y: 4.5,
          z: 0,
          hover: {
            key: 'c-nuc-fb',
            title: 'E = Δmc² Plasma Core',
            badge: 'THERMAL FLASH',
            accent: '#f97316',
            simple: 'Less than 1 gram of converted mass creates a blinding plasma ball and rising convection plume.',
            deeper: 'Peak core temperatures exceed 10⁷ K during the initial X-ray flash.',
            metrics: [],
          },
        },
      ];
    }
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'nuc-liquiddrop') return { position: [0, 3.8, 15.5], target: [-1.0, 0, 0] };
    if (this.chapterId === 'nuc-critical') return { position: [0, 5.2, 14.5], target: [0, 0, 0] };
    if (this.chapterId === 'nuc-implosion') return { position: [0, 4.5, 13.5], target: [0, 0, 0] };
    return { position: [0, 5.5, 22.0], target: [0, 0.5, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
