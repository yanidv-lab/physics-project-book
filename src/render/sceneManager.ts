import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRadialGlowTexture } from './visualAssets';

// Subtle dark-gradient studio/space sky dome (eliminates flat black boilerplate)
const SKY_DOME_VERT = `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_DOME_FRAG = `
  varying vec3 vWorldDir;
  void main() {
    float h = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 nadir = vec3(0.012, 0.018, 0.036);
    vec3 horizon = vec3(0.038, 0.062, 0.115);
    vec3 zenith = vec3(0.014, 0.022, 0.048);
    vec3 col = h < 0.5
      ? mix(nadir, horizon, smoothstep(0.0, 0.5, h))
      : mix(horizon, zenith, smoothstep(0.5, 1.0, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Dark reflective laboratory floor with subtle radial measurement rings & hairline coordinate ticks
const FLOOR_VERT = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FLOOR_FRAG = `
  varying vec3 vWorldPos;

  void main() {
    float dist = length(vWorldPos.xz);
    float radialFade = exp(-dist * dist * 0.0014);
    if (radialFade < 0.005) discard;

    // Dark low-roughness slate floor base sheen
    vec3 baseFloor = vec3(0.022, 0.032, 0.052) * (0.65 + 0.35 * exp(-dist * 0.08));

    // Faint concentric radial measurement rings every 8 units
    float ringDist = abs(fract(dist / 8.0 - 0.5) - 0.5) * 8.0;
    float ringLine = 1.0 - smoothstep(0.0, 0.075, ringDist);

    // Subtle hairline coordinate cross-ticks every 4 units (no loud wireframe grid!)
    vec2 cell = abs(fract(vWorldPos.xz / 4.0 - 0.5) - 0.5) * 4.0;
    float tickX = (1.0 - smoothstep(0.0, 0.035, cell.y)) * (1.0 - smoothstep(0.18, 0.24, cell.x));
    float tickZ = (1.0 - smoothstep(0.0, 0.035, cell.x)) * (1.0 - smoothstep(0.18, 0.24, cell.y));
    float ticks = max(tickX, tickZ);

    // Subtle axis hairlines through origin
    float axisX = (1.0 - smoothstep(0.0, 0.04, abs(vWorldPos.z))) * 0.35;
    float axisZ = (1.0 - smoothstep(0.0, 0.04, abs(vWorldPos.x))) * 0.35;

    vec3 markerCol = vec3(0.28, 0.44, 0.62);
    vec3 col = baseFloor + markerCol * (ringLine * 0.14 + ticks * 0.18 + max(axisX, axisZ) * 0.14);
    float alpha = (0.58 + ringLine * 0.18 + ticks * 0.16) * radialFade;

    gl_FragColor = vec4(col, alpha);
  }
`;

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly composer: EffectComposer;
  public readonly bloomPass: UnrealBloomPass;
  public readonly fog: THREE.FogExp2;
  public readonly labGrid: THREE.Mesh;

  private readonly skyDome: THREE.Mesh;
  private readonly dustPoints: THREE.Points;
  private readonly dustBasePos: Float32Array;
  private dustClock = 0;

  constructor(container: HTMLElement) {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050914);
    this.fog = new THREE.FogExp2(0x060b16, 0.0105);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.08, 280);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    // Cap pixel ratio to guarantee 60 FPS on HiDPI laptops & mobile GPUs
    const maxDpr = width <= 900 ? 1.75 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.localClippingEnabled = true;

    container.appendChild(this.renderer.domElement);

    // Subtle dark-gradient sky dome
    const skyGeom = new THREE.SphereGeometry(190, 28, 18);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_DOME_VERT,
      fragmentShader: SKY_DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.skyDome);

    // Three-point + cool/warm rim lighting to separate 3D silhouettes cleanly
    const ambient = new THREE.AmbientLight(0x8fa3bf, 0.55);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x090e1a, 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xf8fafc, 1.5);
    keyLight.position.set(18, 34, 24);
    this.scene.add(keyLight);

    // Cool rim light separating edges from the dark sky
    const coolRim = new THREE.DirectionalLight(0x38bdf8, 0.92);
    coolRim.position.set(-24, 16, -22);
    this.scene.add(coolRim);

    // Subtle warm counter-rim against cool metallic structures
    const warmRim = new THREE.DirectionalLight(0xfb923c, 0.42);
    warmRim.position.set(22, 10, -18);
    this.scene.add(warmRim);

    // Studio reflections for Blender PBR models (metal, glass, plastic)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    // Dark reflective laboratory floor with subtle spatial reference ticks
    const floorGeom = new THREE.PlaneGeometry(160, 160);
    floorGeom.rotateX(-Math.PI * 0.5);
    const floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.labGrid = new THREE.Mesh(floorGeom, floorMat);
    this.labGrid.position.set(0, -5.2, 0);
    this.scene.add(this.labGrid);

    // Subtle ambient depth dust motes
    const dustCount = 220;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = ((i * 73) % 360) * (Math.PI / 180);
      const r = 20 + ((i * 37) % 38);
      dustPositions[i * 3] = Math.cos(a) * r;
      dustPositions[i * 3 + 1] = -4 + ((i * 19) % 24);
      dustPositions[i * 3 + 2] = Math.sin(a) * r * 0.8;
    }
    this.dustBasePos = new Float32Array(dustPositions);
    const dustGeom = new THREE.BufferGeometry();
    dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.24,
      map: createRadialGlowTexture('rgba(186, 230, 253, 0.85)', 'rgba(56, 189, 248, 0.18)'),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeom, dustMat);
    this.scene.add(this.dustPoints);

    // Selective Bloom post-processing: high luminance threshold (0.82) so ONLY
    // high-energy plasma cores and particle emissions glow while hardware stays razor-sharp
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.5,
      0.42,
      0.82,
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public update(dt: number): void {
    if (dt <= 0) return;
    this.dustClock += dt;
    const attr = this.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] = this.dustBasePos[i + 1] + Math.sin(this.dustClock * 0.45 + i * 0.13) * 0.35;
    }
    attr.needsUpdate = true;
  }

  public setFogDensity(density: number): void {
    this.fog.density = density;
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const maxDpr = w <= 900 ? 1.75 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
  }

  public render(): void {
    this.composer.render();
  }

  public dispose(): void {
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.Material).dispose();
    this.labGrid.geometry.dispose();
    (this.labGrid.material as THREE.Material).dispose();
    this.dustPoints.geometry.dispose();
    (this.dustPoints.material as THREE.Material).dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
