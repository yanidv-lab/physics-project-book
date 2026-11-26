import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRadialGlowTexture } from './visualAssets';

const GRID_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GRID_FRAGMENT_SHADER = `
  varying vec3 vWorldPos;

  float gridLine(vec2 coord, float spacing, float thickness) {
    vec2 p = coord / spacing;
    vec2 grid = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(0.0005));
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / thickness, 1.0);
  }

  void main() {
    float minor = gridLine(vWorldPos.xz, 2.0, 1.15);
    float major = gridLine(vWorldPos.xz, 10.0, 1.5);
    float dist = length(vWorldPos.xz);
    float radialFade = exp(-dist * dist * 0.00075);

    vec3 minorCol = vec3(0.11, 0.19, 0.31);
    vec3 majorCol = vec3(0.06, 0.55, 0.78);
    vec3 color = minorCol * minor * 0.55 + majorCol * major * 0.85;
    float alpha = (minor * 0.22 + major * 0.42) * radialFade;

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
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

  private readonly dustPoints: THREE.Points;
  private readonly dustBasePos: Float32Array;
  private dustClock = 0;

  constructor(container: HTMLElement) {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    this.fog = new THREE.FogExp2(0x070b14, 0.011);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.08, 260);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    const maxDpr = width <= 900 ? 1.75 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.localClippingEnabled = true;

    container.appendChild(this.renderer.domElement);

    // Scientific studio lighting
    const ambient = new THREE.AmbientLight(0x94a3b8, 0.72);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0b1120, 0.95);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xf1f5f9, 1.45);
    keyLight.position.set(18, 34, 24);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rimLight.position.set(-24, 16, -20);
    this.scene.add(rimLight);

    // Studio reflections for Blender PBR models (metal, glass, plastic).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    // Procedural radial-fading laboratory grid plane
    const gridGeom = new THREE.PlaneGeometry(150, 150);
    gridGeom.rotateX(-Math.PI * 0.5);
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERTEX_SHADER,
      fragmentShader: GRID_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    this.labGrid = new THREE.Mesh(gridGeom, gridMat);
    this.labGrid.position.set(0, -5.2, 0);
    this.scene.add(this.labGrid);

    // Subtle ambient quantum dust motes surrounding the circuit
    const dustCount = 260;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      // Deterministic quasi-random distribution outside immediate wire bore
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
      size: 0.28,
      map: createRadialGlowTexture('rgba(186, 230, 253, 0.95)', 'rgba(56, 189, 248, 0.25)'),
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeom, dustMat);
    this.scene.add(this.dustPoints);

    // Post-processing pipeline
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.58,
      0.5,
      0.64,
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
    this.labGrid.geometry.dispose();
    (this.labGrid.material as THREE.Material).dispose();
    this.dustPoints.geometry.dispose();
    (this.dustPoints.material as THREE.Material).dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
