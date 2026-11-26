import * as THREE from 'three';
import { attachModel } from '../render/modelLibrary';
import {
  DEFAULT_G,
  bodyMechanicalEnergy,
  circularSpeed,
  computeLagrangePoints,
  escapeSpeed,
  gravityPotential,
  jacobiConstant,
  rocheEffectiveAccel,
  rocheEffectivePotential,
  softenedCircularSpeed,
  stepRotatingThreeBody,
  stepVelocityVerlet,
  type GravityAttractor,
  type LagrangePointInfo,
  type LagrangePointName,
  type OrbitalBodyState,
} from '../physics/gravityPhysics';
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

type GravChapterId = 'grav-well' | 'grav-kepler' | 'grav-binary' | 'grav-blackhole' | 'grav-lagrange';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

const TRAIL_LEN = 160;
const GRID_SEGS = 58;

export class GravityLab implements LabModule {
  public readonly topicId = 'gravity' as const;
  public readonly group = new THREE.Group();

  private chapterId: GravChapterId = 'grav-well';
  private simTime = 0;

  private centralMass = 2.0;
  private eccentricity = 0.52;
  private massRatio = 0.75;
  private lagrangeMu = 0.03;
  private lagrangeSep = 11.0;
  private lagrangePreset: 'L4' | 'L5' | 'L2' | 'L1' = 'L4';
  private showVectors = true;
  private showFabric = true;

  private attractors: GravityAttractor[] = [];
  private starMeshes: THREE.Mesh[] = [];
  private lagrangeMarkers: THREE.Mesh[] = [];
  private lagrangePoints: Record<LagrangePointName, LagrangePointInfo> = computeLagrangePoints(
    2.91,
    0.09,
    11.0,
  );
  private photonRing: THREE.Mesh | null = null;
  private accretionPoints: THREE.Points | null = null;
  private accretionAngles = new Float32Array(0);
  private accretionRadii = new Float32Array(0);

  private fabricGeom: THREE.PlaneGeometry | null = null;
  private fabricMesh: THREE.Mesh | null = null;
  private fabricWire: THREE.Mesh | null = null;

  private probe: OrbitalBodyState = {
    pos: { x: 8.5, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 2.3 },
  };
  private probeCaptured = false;
  private probeMesh: THREE.Mesh | null = null;
  private tetherLine: THREE.Line | null = null;
  private trailLine: THREE.Line | null = null;
  private trailPts: THREE.Vector3[] = [];
  private velArrow: THREE.ArrowHelper | null = null;
  private gravArrow: THREE.ArrowHelper | null = null;

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private readonly cFlat = new THREE.Color(0x1e1b4b);
  private readonly cMid = new THREE.Color(0x0ea5e9);
  private readonly cWarm = new THREE.Color(0xf59e0b);
  private readonly cHot = new THREE.Color(0xef4444);
  private readonly tmpCol = new THREE.Color();

  public activate(chapterId: string): void {
    const valid: GravChapterId[] = [
      'grav-well',
      'grav-kepler',
      'grav-binary',
      'grav-blackhole',
      'grav-lagrange',
    ];
    this.chapterId = valid.includes(chapterId as GravChapterId)
      ? (chapterId as GravChapterId)
      : 'grav-well';
    if (this.chapterId === 'grav-blackhole') {
      this.centralMass = 2.8;
    } else if (this.chapterId === 'grav-lagrange') {
      this.lagrangeMu = 0.03;
      this.lagrangePreset = 'L4';
    } else {
      this.centralMass = 2.0;
    }
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'launchCircular') {
      this.spawnProbe('circular');
      return;
    }
    if (apply.action === 'launchEscape') {
      this.spawnProbe('escape');
      return;
    }
    if (apply.action === 'launchBinaryProbe') {
      this.spawnProbe('binary');
      return;
    }
    if (apply.action === 'launchSlingshot') {
      this.spawnProbe('slingshot');
      return;
    }
    let rebuildLagrange = false;
    if (typeof apply.mu === 'number') {
      this.lagrangeMu = apply.mu;
      rebuildLagrange = true;
    }
    if (typeof apply.preset === 'string') {
      this.lagrangePreset = apply.preset as 'L4' | 'L5' | 'L2' | 'L1';
      rebuildLagrange = true;
    }
    if (rebuildLagrange) {
      this.rebuildScene();
      return;
    }
    if (typeof apply.eccentricity === 'number') {
      this.eccentricity = apply.eccentricity;
      this.spawnProbe('elliptical');
    }
    if (typeof apply.massRatio === 'number') {
      this.massRatio = apply.massRatio;
      this.rebuildScene();
    }
    if (typeof apply.centralMass === 'number') {
      this.centralMass = apply.centralMass;
      this.rebuildScene();
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
    this.starMeshes = [];
    this.lagrangeMarkers = [];
    this.trailPts = [];
    this.photonRing = null;
    this.accretionPoints = null;
    this.fabricGeom = null;
    this.fabricMesh = null;
    this.fabricWire = null;
    this.probeMesh = null;
    this.tetherLine = null;
    this.trailLine = null;
    this.velArrow = null;
    this.gravArrow = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private getLagrangeMasses(): [number, number] {
    const mTot = 3.0;
    return [mTot * (1 - this.lagrangeMu), mTot * this.lagrangeMu];
  }

  private rocheSurfaceY(x: number, z: number): number {
    const [m1, m2] = this.getLagrangeMasses();
    const phi = rocheEffectivePotential(x, z, m1, m2, this.lagrangeSep, DEFAULT_G, 1.15);
    return Math.max(-8.5, Math.min(2.2, (phi + 6.5) * 0.22));
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;
    this.probeCaptured = false;

    // 1. Dynamic Spacetime Fabric
    const geom = this.track(new THREE.PlaneGeometry(34, 34, GRID_SEGS, GRID_SEGS));
    geom.rotateX(-Math.PI * 0.5);
    const vCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    this.fabricGeom = geom;

    const surfaceMat = this.track(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.fabricMesh = new THREE.Mesh(geom, surfaceMat);
    const isLagrange = this.chapterId === 'grav-lagrange';
    this.attachStudy(this.fabricMesh, {
      key: isLagrange ? 'roche-fabric' : 'spacetime-fabric',
      title: isLagrange ? 'Roche Effective Potential Φ_eff(x, z)' : 'Spacetime Curvature Well Φ(r)',
      badge: isLagrange ? 'ROTATING 3-BODY' : 'GRAVITATIONAL POTENTIAL',
      accent: isLagrange ? '#10b981' : '#f59e0b',
      simple: isLagrange
        ? 'Combines gravity wells from both Star & Planet with outward centrifugal sling in the co-rotating frame!'
        : 'Massive objects sink the fabric downward! Steeper slopes pull nearby planets harder toward the center.',
      deeper: isLagrange
        ? 'Φ_eff = −GM₁/r₁ − GM₂/r₂ − ½Ω²r²; flat saddles (L1–L3) and peaks (L4–L5) form the five Lagrange points.'
        : 'Visualizes gravitational potential Φ(r) = −GM/r; force per unit mass equals −∇Φ.',
    });

    const wireMat = this.track(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      }),
    );
    this.fabricWire = new THREE.Mesh(geom, wireMat);
    this.group.add(this.fabricMesh, this.fabricWire);

    // 2. Central Stars or Binary / Black Hole
    if (this.chapterId === 'grav-binary') {
      const m1 = this.centralMass;
      const m2 = this.centralMass * this.massRatio;
      this.attractors = [
        { x: -4.2, y: 0, z: 0, mass: m1, radius: 0.9 },
        { x: 4.2, y: 0, z: 0, mass: m2, radius: 0.75 },
      ];
      const starColors = [0xf59e0b, 0x38bdf8];
      for (let i = 0; i < 2; i++) {
        const sMesh = new THREE.Mesh(
          this.track(new THREE.SphereGeometry(this.attractors[i].radius, 24, 24)),
          this.track(
            new THREE.MeshStandardMaterial({
              color: starColors[i],
              emissive: starColors[i],
              emissiveIntensity: 0.85,
            }),
          ),
        );
        const halo = new THREE.Sprite(
          this.track(
            new THREE.SpriteMaterial({
              map: createRadialGlowTexture(
                i === 0 ? 'rgba(253,224,71,0.9)' : 'rgba(125,211,252,0.9)',
                'rgba(0,0,0,0)',
              ),
              transparent: true,
              opacity: 0.75,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          ),
        );
        halo.scale.set(4.5, 4.5, 1);
        sMesh.add(halo);
        this.attachStudy(sMesh, {
          key: `binary-star-${i}`,
          title: i === 0 ? 'Primary Star M₁' : 'Companion Star M₂',
          badge: 'BINARY SYSTEM',
          accent: i === 0 ? '#f59e0b' : '#38bdf8',
          simple: 'Two stars orbit their shared center of mass, sculpting a rotating double gravity well!',
          deeper: 'Creates moving gravitational saddle points and complex three-body orbital resonances.',
        });
        this.group.add(sMesh);
        this.starMeshes.push(sMesh);
      }
      this.spawnProbe('binary');
    } else if (this.chapterId === 'grav-blackhole') {
      this.attractors = [{ x: 0, y: 0, z: 0, mass: this.centralMass * 1.4, radius: 1.35 }];
      const bh = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(1.35, 32, 32)),
        this.track(new THREE.MeshBasicMaterial({ color: 0x020305 })),
      );
      this.attachStudy(bh, {
        key: 'event-horizon',
        title: 'Event Horizon (Black Hole)',
        badge: 'NO ESCAPE',
        accent: '#ef4444',
        simple: 'Inside this dark sphere, gravity is so extreme that even light cannot climb out!',
        deeper: 'Schwarzschild radius boundary where escape velocity reaches c.',
      });
      this.group.add(bh);
      this.starMeshes.push(bh);

      this.photonRing = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(1.92, 0.09, 14, 48)),
        this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 })),
      );
      this.photonRing.rotation.x = Math.PI * 0.5;
      this.attachStudy(this.photonRing, {
        key: 'photon-ring',
        title: 'Photon Sphere & Golden Ring',
        badge: 'LIGHT ORBIT',
        accent: '#fbbf24',
        simple: 'Extreme spacetime curvature bends grazing light beams into glowing loops right outside the horizon!',
        deeper: 'Unstable circular null geodesics at r_ph = 1.5 r_s.',
      });
      this.group.add(this.photonRing);

      // Accretion disk particles
      const diskCount = 320;
      const diskPos = new Float32Array(diskCount * 3);
      const diskCol = new Float32Array(diskCount * 3);
      this.accretionAngles = new Float32Array(diskCount);
      this.accretionRadii = new Float32Array(diskCount);
      for (let i = 0; i < diskCount; i++) {
        const r = 2.2 + Math.pow((i % 100) / 100, 0.85) * 4.5;
        const a = (i * 2.39996) % (Math.PI * 2);
        this.accretionRadii[i] = r;
        this.accretionAngles[i] = a;
        diskPos[i * 3] = r * Math.cos(a);
        diskPos[i * 3 + 1] = (Math.sin(i * 7.1) * 0.18);
        diskPos[i * 3 + 2] = r * Math.sin(a);

        const hot = 1 - (r - 2.2) / 4.5;
        this.tmpCol.copy(this.cHot).lerp(new THREE.Color(0xfef08a), hot);
        diskCol[i * 3] = this.tmpCol.r;
        diskCol[i * 3 + 1] = this.tmpCol.g;
        diskCol[i * 3 + 2] = this.tmpCol.b;
      }
      const dGeom = this.track(new THREE.BufferGeometry());
      dGeom.setAttribute('position', new THREE.BufferAttribute(diskPos, 3));
      dGeom.setAttribute('color', new THREE.BufferAttribute(diskCol, 3));
      this.accretionPoints = new THREE.Points(
        dGeom,
        this.track(
          new THREE.PointsMaterial({
            size: 0.34,
            vertexColors: true,
            map: createRadialGlowTexture('rgba(255,255,255,0.95)', 'rgba(251,146,60,0.25)'),
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      this.group.add(this.accretionPoints);
      this.spawnProbe('slingshot');
    } else if (this.chapterId === 'grav-lagrange') {
      const [m1, m2] = this.getLagrangeMasses();
      const sep = this.lagrangeSep;
      const mu = this.lagrangeMu;
      const x1 = -mu * sep;
      const x2 = (1 - mu) * sep;

      this.attractors = [
        { x: x1, y: 0, z: 0, mass: m1, radius: 1.05 },
        { x: x2, y: 0, z: 0, mass: m2, radius: 0.48 },
      ];

      // Primary Star M1
      const starM = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(1.05, 26, 26)),
        this.track(
          new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.9,
          }),
        ),
      );
      starM.position.set(x1, 0.35, 0);
      const starHalo = new THREE.Sprite(
        this.track(
          new THREE.SpriteMaterial({
            map: createRadialGlowTexture('rgba(254,240,138,0.9)', 'rgba(245,158,11,0.25)'),
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      starHalo.scale.set(4.8, 4.8, 1);
      starM.add(starHalo);
      this.attachStudy(starM, {
        key: 'lagrange-star',
        title: 'Primary Star M₁',
        badge: 'HOST STAR',
        accent: '#fbbf24',
        simple: 'Anchors most of the rotating system’s mass near the center of mass.',
        deeper: `Mass fraction 1 − μ = ${(1 - mu).toFixed(3)} at x₁ = ${x1.toFixed(2)}.`,
      });
      this.group.add(starM);
      this.starMeshes.push(starM);

      // Secondary Planet M2
      const planetM = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(0.48, 22, 22)),
        this.track(
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.75,
          }),
        ),
      );
      planetM.position.set(x2, 0.25, 0);
      this.attachStudy(planetM, {
        key: 'lagrange-planet',
        title: 'Orbiting Planet M₂',
        badge: 'MASS RATIO μ',
        accent: '#38bdf8',
        simple: 'Orbits M₁ synchronously in our co-rotating frame—carving out the local gravity well between L1 and L2.',
        deeper: `Mass ratio μ = ${mu.toFixed(3)} (Trojan points stable only below Routh cutoff μ_crit ≈ 0.0385).`,
      });
      this.group.add(planetM);
      void attachModel(planetM, 'ringed_planet', { fit: 'y', scale: 1.2 });
      this.starMeshes.push(planetM);

      // Planet orbital path circle
      const ringPts: THREE.Vector3[] = [];
      const orbitR = Math.abs(x2);
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(orbitR * Math.cos(th), 0.1, orbitR * Math.sin(th)));
      }
      const orbitRing = new THREE.Line(
        this.track(new THREE.BufferGeometry().setFromPoints(ringPts)),
        this.track(new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.28 })),
      );
      this.group.add(orbitRing);

      // L1..L5 markers on the Roche surface
      this.lagrangePoints = computeLagrangePoints(m1, m2, sep);
      const markerG = this.track(new THREE.OctahedronGeometry(0.36, 0));
      const notesByPoint: Record<LagrangePointName, { title: string; simple: string; deeper: string }> = {
        L1: {
          title: 'L1 Saddle Point (Solar Observatory Spot)',
          simple: 'Between Star and Planet: planet pulls backward just enough to match your orbital period!',
          deeper: 'Unstable collinear saddle (home to SOHO & DSCOVR solar wind probes).',
        },
        L2: {
          title: 'L2 Saddle Point (JWST Telescope Spot)',
          simple: 'Outside the planet in constant shadow alignment—where Webb orbits unobstructed!',
          deeper: 'Unstable collinear saddle requiring tiny station-keeping burns (JWST / Gaia).',
        },
        L3: {
          title: 'L3 Opposite Saddle Point',
          simple: 'Hidden directly behind the host star on the opposite side of the planet’s orbit.',
          deeper: 'Weakly unstable collinear equilibrium at ξ ≈ −1 − 5μ/12.',
        },
        L4: {
          title: 'L4 Leading Trojan Point (+60°)',
          simple: 'Forms an equilateral triangle with Star & Planet! Coriolis deflection turns it into a basin when μ < 0.0385.',
          deeper: 'Linearly stable for μ < 0.03852, hosting thousands of Trojan asteroids.',
        },
        L5: {
          title: 'L5 Trailing Trojan Point (−60°)',
          simple: 'Symmetric triangular twin trailing 60° behind the planet.',
          deeper: 'Equilateral equilibrium stabilized by Coriolis forces when μ < 0.03852.',
        },
      };

      for (const name of ['L1', 'L2', 'L3', 'L4', 'L5'] as LagrangePointName[]) {
        const pt = this.lagrangePoints[name];
        const colorHex = pt.stable ? 0x10b981 : name === 'L4' || name === 'L5' ? 0xf59e0b : 0xf43f5e;
        const mMat = this.track(
          new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.75,
          }),
        );
        const marker = new THREE.Mesh(markerG, mMat);
        const ySurf = this.rocheSurfaceY(pt.x, pt.z);
        marker.position.set(pt.x, ySurf + 0.42, pt.z);
        this.attachStudy(marker, {
          key: `lagrange-${name}`,
          title: notesByPoint[name].title,
          badge: pt.stable ? 'STABLE CORIOLIS' : 'UNSTABLE SADDLE',
          accent: pt.stable ? '#10b981' : '#f43f5e',
          simple: notesByPoint[name].simple,
          deeper: notesByPoint[name].deeper,
        });
        this.group.add(marker);
        void attachModel(marker, 'lagrange_telescope', { scale: 1.5 });
        this.lagrangeMarkers.push(marker);
      }

      this.spawnLagrangeProbe(this.lagrangePreset);
    } else {
      // Single central star (Gravity Well or Kepler Ellipse)
      this.attractors = [{ x: 0, y: 0, z: 0, mass: this.centralMass, radius: 1.15 }];
      const star = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(1.15, 28, 28)),
        this.track(
          new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.9,
          }),
        ),
      );
      const halo = new THREE.Sprite(
        this.track(
          new THREE.SpriteMaterial({
            map: createRadialGlowTexture('rgba(254,240,138,0.95)', 'rgba(245,158,11,0.25)'),
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      halo.scale.set(5.4, 5.4, 1);
      star.add(halo);
      this.attachStudy(star, {
        key: 'central-star',
        title: 'Central Massive Star (M)',
        badge: 'GRAVITY SOURCE',
        accent: '#fbbf24',
        simple: 'Its mass curves the surrounding spacetime sheet downward, binding planets into stable orbits.',
        deeper: 'Orbital velocity v_circ = √(GM/r) balances inward gravitational acceleration GM/r².',
      });
      this.group.add(star);
      this.starMeshes.push(star);
      this.spawnProbe(this.chapterId === 'grav-kepler' ? 'elliptical' : 'circular');
    }

    // 3. Orbiting Planet / Probe + Tether + Trail + Arrows
    this.probeMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.42, 20, 20)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0x00f0ff,
          emissive: 0x0284c7,
          emissiveIntensity: 0.65,
        }),
      ),
    );
    this.attachStudy(this.probeMesh, {
      key: 'orbiting-probe',
      title: 'Orbiting Planet / Probe',
      badge: 'FREE FALL',
      accent: '#00f0ff',
      simple: 'A planet in orbit is literally falling continuously around the star—moving sideways fast enough to keep missing it!',
      deeper: 'Velocity-Verlet integration conserves total mechanical energy E = K + U and angular momentum L = r × p.',
    });
    this.group.add(this.probeMesh);
    void attachModel(this.probeMesh, 'space_probe', { scale: 1.55 });

    const tetherG = this.track(new THREE.BufferGeometry());
    tetherG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tetherLine = new THREE.Line(
      tetherG,
      this.track(new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })),
    );
    this.group.add(this.tetherLine);

    const trailG = this.track(new THREE.BufferGeometry());
    trailG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
    this.trailLine = new THREE.Line(
      trailG,
      this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 })),
    );
    this.trailLine.frustumCulled = false;
    this.group.add(this.trailLine);

    this.velArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(),
      1.8,
      0x00f0ff,
      0.35,
      0.2,
    );
    this.gravArrow = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(),
      1.8,
      0xfbbf24,
      0.35,
      0.2,
    );
    this.group.add(this.velArrow, this.gravArrow);

    this.updateFabricMesh();
  }

  private spawnProbe(kind: 'circular' | 'escape' | 'elliptical' | 'binary' | 'slingshot'): void {
    this.probeCaptured = false;
    this.trailPts = [];
    const m = this.attractors[0]?.mass ?? this.centralMass;

    if (kind === 'circular') {
      const r = 7.5;
      const v = softenedCircularSpeed(m, r);
      this.probe = { pos: { x: r, y: 0, z: 0 }, vel: { x: 0, y: 0, z: v } };
    } else if (kind === 'escape') {
      const r = 7.0;
      const v = escapeSpeed(m, r) * 1.04;
      this.probe = { pos: { x: r, y: 0, z: 0 }, vel: { x: 0, y: 0, z: v } };
    } else if (kind === 'elliptical') {
      const rPeri = Math.max(2.4, 8.0 * (1 - this.eccentricity));
      const vCirc = circularSpeed(m, rPeri);
      const vPeri = vCirc * Math.sqrt(1 + this.eccentricity);
      this.probe = { pos: { x: rPeri, y: 0, z: 0 }, vel: { x: 0, y: 0, z: vPeri } };
    } else if (kind === 'binary') {
      this.probe = { pos: { x: 0, y: 0, z: 11.2 }, vel: { x: 2.35, y: 0, z: 0.15 } };
    } else {
      // slingshot past black hole
      this.probe = { pos: { x: -13.5, y: 0, z: 4.1 }, vel: { x: 3.9, y: 0, z: -0.35 } };
    }
  }

  private spawnLagrangeProbe(preset: 'L4' | 'L5' | 'L2' | 'L1'): void {
    this.probeCaptured = false;
    this.trailPts = [];
    this.lagrangePreset = preset;
    const pt = this.lagrangePoints[preset];

    if (preset === 'L4' || preset === 'L5') {
      this.probe = {
        pos: { x: pt.x + 0.28, y: 0, z: pt.z + (preset === 'L4' ? 0.16 : -0.16) },
        vel: { x: 0.04, y: 0, z: 0.08 },
      };
    } else if (preset === 'L2') {
      this.probe = {
        pos: { x: pt.x + 0.05, y: 0, z: 0.14 },
        vel: { x: -0.02, y: 0, z: -0.04 },
      };
    } else {
      this.probe = {
        pos: { x: pt.x - 0.05, y: 0, z: 0.12 },
        vel: { x: 0.02, y: 0, z: 0.04 },
      };
    }
  }

  private updateFabricMesh(): void {
    if (!this.fabricGeom || !this.fabricMesh || !this.fabricWire) return;
    this.fabricMesh.visible = this.showFabric;
    this.fabricWire.visible = this.showFabric;
    if (!this.showFabric) return;

    const posAttr = this.fabricGeom.attributes.position as THREE.BufferAttribute;
    const colAttr = this.fabricGeom.attributes.color as THREE.BufferAttribute;
    const count = posAttr.count;
    const isLagrange = this.chapterId === 'grav-lagrange';

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const depth = isLagrange
        ? this.rocheSurfaceY(x, z)
        : Math.max(-8.8, Math.min(0, gravityPotential(x, z, this.attractors, DEFAULT_G, 1.05) * 0.16));
      posAttr.setY(i, depth);

      const t = Math.max(0, Math.min(1, -depth / 7.5));
      if (t < 0.35) {
        this.tmpCol.copy(this.cFlat).lerp(this.cMid, t / 0.35);
      } else if (t < 0.72) {
        this.tmpCol.copy(this.cMid).lerp(this.cWarm, (t - 0.35) / 0.37);
      } else {
        this.tmpCol.copy(this.cWarm).lerp(this.cHot, (t - 0.72) / 0.28);
      }
      colAttr.setXYZ(i, this.tmpCol.r, this.tmpCol.g, this.tmpCol.b);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  public update(dt: number): void {
    this.simTime += dt;

    // Animate Binary stars orbiting barycenter
    if (this.chapterId === 'grav-binary' && this.attractors.length === 2) {
      const m1 = this.centralMass;
      const m2 = this.centralMass * this.massRatio;
      const mTot = m1 + m2;
      const sep = 8.4;
      const omega = Math.sqrt((DEFAULT_G * mTot) / (sep * sep * sep));
      const ang = this.simTime * omega;
      const r1 = (sep * m2) / mTot;
      const r2 = (sep * m1) / mTot;
      this.attractors[0].x = -r1 * Math.cos(ang);
      this.attractors[0].z = -r1 * Math.sin(ang);
      this.attractors[1].x = r2 * Math.cos(ang);
      this.attractors[1].z = r2 * Math.sin(ang);
      this.starMeshes[0]?.position.set(this.attractors[0].x, 0.3, this.attractors[0].z);
      this.starMeshes[1]?.position.set(this.attractors[1].x, 0.3, this.attractors[1].z);
    }

    // Animate Black Hole accretion disk
    if (this.chapterId === 'grav-blackhole' && this.accretionPoints) {
      const posAttr = this.accretionPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < this.accretionRadii.length; i++) {
        const r = this.accretionRadii[i];
        const w = 6.5 / Math.pow(r, 1.5);
        this.accretionAngles[i] += w * dt;
        const a = this.accretionAngles[i];
        posAttr.setX(i, r * Math.cos(a));
        posAttr.setZ(i, r * Math.sin(a));
      }
      posAttr.needsUpdate = true;
    }

    // Integrate probe (Rotating 3-Body RK4 for Lagrange, symplectic Verlet otherwise)
    if (!this.probeCaptured) {
      const substeps = 6;
      const h = Math.min(dt, 0.04) / substeps;
      if (this.chapterId === 'grav-lagrange') {
        const [m1, m2] = this.getLagrangeMasses();
        for (let s = 0; s < substeps; s++) {
          stepRotatingThreeBody(this.probe, m1, m2, this.lagrangeSep, h, DEFAULT_G, 0.35);
          const rStar = Math.hypot(this.probe.pos.x - this.attractors[0].x, this.probe.pos.z);
          const rPlanet = Math.hypot(this.probe.pos.x - this.attractors[1].x, this.probe.pos.z);
          if (rStar < 1.1 || rPlanet < 0.65) {
            this.probeCaptured = true;
            break;
          }
          if (Math.hypot(this.probe.pos.x, this.probe.pos.z) > 22) {
            this.spawnLagrangeProbe(this.lagrangePreset);
            break;
          }
        }
      } else {
        for (let s = 0; s < substeps; s++) {
          stepVelocityVerlet(this.probe, this.attractors, h);
          const r0 = Math.hypot(
            this.probe.pos.x - this.attractors[0].x,
            this.probe.pos.z - this.attractors[0].z,
          );
          if (this.chapterId === 'grav-blackhole' && r0 < 1.38) {
            this.probeCaptured = true;
            break;
          }
          if (Math.hypot(this.probe.pos.x, this.probe.pos.z) > 26) {
            this.spawnProbe(
              this.chapterId === 'grav-blackhole'
                ? 'slingshot'
                : this.chapterId === 'grav-binary'
                  ? 'binary'
                  : 'escape',
            );
            break;
          }
        }
      }
    }

    this.updateFabricMesh();

    const px = this.probe.pos.x;
    const pz = this.probe.pos.z;
    const wellY =
      this.chapterId === 'grav-lagrange'
        ? this.rocheSurfaceY(px, pz)
        : Math.max(-8.8, Math.min(0, gravityPotential(px, pz, this.attractors, DEFAULT_G, 1.05) * 0.16));
    const py = this.chapterId === 'grav-lagrange' ? wellY + 0.55 : 0.45;

    if (this.probeMesh) {
      this.probeMesh.visible = !this.probeCaptured;
      this.probeMesh.position.set(px, py, pz);
    }

    if (this.tetherLine) {
      const attr = this.tetherLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, px, py, pz);
      attr.setXYZ(1, px, wellY, pz);
      attr.needsUpdate = true;
    }

    if (this.trailLine && !this.probeCaptured) {
      this.trailPts.push(new THREE.Vector3(px, py, pz));
      if (this.trailPts.length > TRAIL_LEN) this.trailPts.shift();
      const attr = this.trailLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const last = this.trailPts[this.trailPts.length - 1] ?? new THREE.Vector3(px, py, pz);
      for (let i = 0; i < TRAIL_LEN; i++) {
        const pt = this.trailPts[i] ?? last;
        attr.setXYZ(i, pt.x, pt.y, pt.z);
      }
      attr.needsUpdate = true;
    }

    if (this.velArrow && this.gravArrow) {
      const vis = this.showVectors && !this.probeCaptured;
      this.velArrow.visible = vis;
      this.gravArrow.visible = vis;
      if (vis) {
        const vVec = new THREE.Vector3(this.probe.vel.x, 0, this.probe.vel.z);
        const vLen = vVec.length();
        if (vLen > 1e-4) {
          this.velArrow.position.set(px, py, pz);
          this.velArrow.setDirection(vVec.clone().divideScalar(vLen));
          this.velArrow.setLength(Math.min(3.5, 0.7 + vLen * 0.42), 0.35, 0.2);
        }

        if (this.chapterId === 'grav-lagrange') {
          const [m1, m2] = this.getLagrangeMasses();
          const eff = rocheEffectiveAccel(px, pz, m1, m2, this.lagrangeSep, DEFAULT_G, 0.35);
          const gVec = new THREE.Vector3(eff.ax, 0, eff.az);
          const gLen = gVec.length();
          if (gLen > 1e-4) {
            this.gravArrow.position.set(px, py, pz);
            this.gravArrow.setDirection(gVec.divideScalar(gLen));
            this.gravArrow.setLength(Math.min(3.2, 0.4 + gLen * 0.9), 0.3, 0.18);
          } else {
            this.gravArrow.visible = false;
          }
        } else {
          const a = { x: 0, y: 0, z: 0 };
          const dx = this.attractors[0].x - px;
          const dz = this.attractors[0].z - pz;
          const r2 = dx * dx + dz * dz + 0.85 * 0.85;
          const fScale = (DEFAULT_G * this.attractors[0].mass) / (r2 * Math.sqrt(r2));
          a.x = dx * fScale;
          a.z = dz * fScale;
          const gVec = new THREE.Vector3(a.x, 0, a.z);
          const gLen = gVec.length();
          if (gLen > 1e-4) {
            this.gravArrow.position.set(px, py, pz);
            this.gravArrow.setDirection(gVec.clone().divideScalar(gLen));
            this.gravArrow.setLength(Math.min(3.5, 0.6 + gLen * 0.75), 0.35, 0.2);
          }
        }
      }
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'grav-lagrange') {
      return {
        sliders: [
          {
            key: 'lagrangeMu',
            label: 'Mass Ratio μ = M₂/(M₁+M₂)',
            min: 0.005,
            max: 0.12,
            step: 0.005,
            value: this.lagrangeMu,
            unit: '',
            noteTitle: 'Routh Stability Ratio',
            noteText: 'Trojan points L4/L5 remain stable only below μ_crit ≈ 0.0385; above 0.04 they go unstable!',
          },
          {
            key: 'lagrangeSep',
            label: 'Star–Planet Distance',
            min: 8.0,
            max: 14.0,
            step: 0.5,
            value: this.lagrangeSep,
            unit: 'AU',
            noteTitle: 'Orbital Separation',
            noteText: 'All five Lagrange points scale proportionally with Star–Planet separation.',
          },
        ],
        toggles: [
          {
            key: 'showFabric',
            label: 'Roche Potential Surface',
            checked: this.showFabric,
            swatchColor: '#10b981',
            noteTitle: 'Co-Rotating Potential',
            noteText: 'Shows gravitational wells plus outward centrifugal sling Φ_eff.',
          },
          {
            key: 'showVectors',
            label: 'Velocity & Eff. Force Arrows',
            checked: this.showVectors,
            swatchColor: '#00f0ff',
            noteTitle: 'Rotating-Frame Vectors',
            noteText: 'Cyan = co-rotating velocity; Gold = effective Roche force −∇Φ_eff.',
          },
        ],
        actions: [
          { id: 'park-L4', label: 'Park L4 (Trojan)' },
          { id: 'park-L5', label: 'Park L5 (Trojan)' },
          { id: 'park-L2', label: 'Park L2 (JWST)' },
          { id: 'park-L1', label: 'Park L1 (Saddle)' },
        ],
      };
    }

    const sliders = [
      {
        key: 'centralMass',
        label: this.chapterId === 'grav-blackhole' ? 'Black Hole Mass' : 'Star Mass (M)',
        min: 0.8,
        max: 4.0,
        step: 0.1,
        value: this.centralMass,
        unit: 'M☉',
        noteTitle: 'Central Mass',
        noteText: 'Increases spacetime curvature depth and speeds up orbiting planets.',
      },
    ];
    if (this.chapterId === 'grav-kepler') {
      sliders.push({
        key: 'eccentricity',
        label: 'Orbit Eccentricity (e)',
        min: 0.0,
        max: 0.8,
        step: 0.05,
        value: this.eccentricity,
        unit: '',
        noteTitle: 'Orbit Shape',
        noteText: '0 = perfect circle; 0.75 = stretched comet ellipse whipping fast past the star!',
      });
    }
    if (this.chapterId === 'grav-binary') {
      sliders.push({
        key: 'massRatio',
        label: 'Companion Mass Ratio',
        min: 0.25,
        max: 1.0,
        step: 0.05,
        value: this.massRatio,
        unit: '',
        noteTitle: 'Star Mass Balance',
        noteText: '1.0 makes twin stars; lower values make one heavier star anchor the dance.',
      });
    }

    const actions =
      this.chapterId === 'grav-binary'
        ? [{ id: 'launchBinaryProbe', label: 'Relaunch Planet' }]
        : this.chapterId === 'grav-blackhole'
          ? [{ id: 'launchSlingshot', label: 'Fire Slingshot Probe' }]
          : [
              { id: 'launchCircular', label: 'Circular Orbit' },
              { id: 'launchEscape', label: 'Fire Escape Probe' },
            ];

    return {
      sliders,
      toggles: [
        {
          key: 'showFabric',
          label: 'Spacetime Curvature Sheet',
          checked: this.showFabric,
          swatchColor: '#f59e0b',
          noteTitle: 'Gravity Well Surface',
          noteText: '3D potential funnel showing how mass curves spacetime.',
        },
        {
          key: 'showVectors',
          label: 'Velocity & Gravity Arrows',
          checked: this.showVectors,
          swatchColor: '#00f0ff',
          noteTitle: 'Force & Velocity',
          noteText: 'Cyan = planet velocity; Gold = inward gravitational pull.',
        },
      ],
      actions,
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'centralMass' && typeof value === 'number') {
      this.centralMass = value;
      if (this.attractors[0]) {
        this.attractors[0].mass =
          this.chapterId === 'grav-blackhole' ? value * 1.4 : value;
      }
      if (this.chapterId === 'grav-binary' && this.attractors[1]) {
        this.attractors[1].mass = value * this.massRatio;
      }
    } else if (key === 'eccentricity' && typeof value === 'number') {
      this.eccentricity = value;
      this.spawnProbe('elliptical');
    } else if (key === 'massRatio' && typeof value === 'number') {
      this.massRatio = value;
      if (this.attractors[1]) this.attractors[1].mass = this.centralMass * value;
    } else if (key === 'lagrangeMu' && typeof value === 'number') {
      this.lagrangeMu = value;
      this.rebuildScene();
    } else if (key === 'lagrangeSep' && typeof value === 'number') {
      this.lagrangeSep = value;
      this.rebuildScene();
    } else if (key === 'showFabric' && typeof value === 'boolean') {
      this.showFabric = value;
    } else if (key === 'showVectors' && typeof value === 'boolean') {
      this.showVectors = value;
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'launchCircular') this.spawnProbe('circular');
    else if (actionId === 'launchEscape') this.spawnProbe('escape');
    else if (actionId === 'launchBinaryProbe') this.spawnProbe('binary');
    else if (actionId === 'launchSlingshot') this.spawnProbe('slingshot');
    else if (actionId === 'park-L4') this.spawnLagrangeProbe('L4');
    else if (actionId === 'park-L5') this.spawnLagrangeProbe('L5');
    else if (actionId === 'park-L2') this.spawnLagrangeProbe('L2');
    else if (actionId === 'park-L1') this.spawnLagrangeProbe('L1');
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'grav-lagrange') {
      const [m1, m2] = this.getLagrangeMasses();
      const cJ = jacobiConstant(this.probe, m1, m2, this.lagrangeSep, DEFAULT_G, 0.35);
      const vRot = Math.hypot(this.probe.vel.x, this.probe.vel.z);
      const triStable = this.lagrangeMu < 0.03852;
      const point = this.lagrangePoints[this.lagrangePreset];
      return [
        {
          labelSimple: 'Parking Spot',
          labelPhysics: `Equilibrium ${this.lagrangePreset}`,
          value: `${this.lagrangePreset} (${point.stable ? 'Stable' : 'Saddle'})`,
          noteTitle: 'Lagrange Stability',
          noteText: triStable
            ? 'For μ < 0.0385, L4 and L5 trap spacecraft smoothly via Coriolis forces!'
            : 'Above μ ≈ 0.0385, even L4 and L5 become linearly unstable!',
        },
        {
          labelSimple: 'Jacobi Constant C_J',
          labelPhysics: 'Invariant C_J',
          value: cJ.toFixed(3),
          noteTitle: 'Three-Body Constant of Motion',
          noteText: 'Total mechanical energy in the rotating frame stays conserved by RK4 integration.',
        },
        {
          labelSimple: 'Drift Speed |v_rot|',
          labelPhysics: 'Co-Rotating |v|',
          value: `${vRot.toFixed(2)} km/s`,
          noteTitle: 'Rotating-Frame Velocity',
          noteText: 'Zero when parked exactly on a Lagrange point; loops slowly around L4/L5.',
        },
        {
          labelSimple: 'Mass Ratio μ',
          labelPhysics: 'M₂ / (M₁ + M₂)',
          value: `${this.lagrangeMu.toFixed(3)} ${triStable ? '< 0.0385' : '≥ 0.0385'}`,
          noteTitle: 'Routh Stability Criterion',
          noteText: 'Earth–Sun has μ ≈ 3×10⁻⁶ (deeply stable); Jupiter–Sun has μ ≈ 10⁻³.',
        },
      ];
    }

    const e = bodyMechanicalEnergy(this.probe, this.attractors);
    const speed = Math.hypot(this.probe.vel.x, this.probe.vel.z);
    const r = Math.hypot(
      this.probe.pos.x - (this.attractors[0]?.x ?? 0),
      this.probe.pos.z - (this.attractors[0]?.z ?? 0),
    );
    const vEsc = escapeSpeed(this.attractors[0]?.mass ?? this.centralMass, Math.max(0.5, r));
    const status = this.probeCaptured
      ? 'Captured!'
      : e.total >= 0
        ? 'Escaping'
        : 'Bound Orbit';

    return [
      {
        labelSimple: 'Orbital Speed |v|',
        labelPhysics: 'Speed |v|',
        value: `${speed.toFixed(2)} km/s`,
        noteTitle: 'Orbital Speed',
        noteText: 'Speeds up near the star and slows down farther away.',
      },
      {
        labelSimple: 'Escape Speed v_esc',
        labelPhysics: 'Local v_esc',
        value: `${vEsc.toFixed(2)} km/s`,
        noteTitle: 'Escape Velocity',
        noteText: 'Minimum speed needed to break free forever (√2 × circular speed).',
      },
      {
        labelSimple: 'Distance r',
        labelPhysics: 'Orbital Radius r',
        value: `${r.toFixed(2)} AU`,
        noteTitle: 'Distance from Star',
        noteText: 'Current separation from the primary attractor.',
      },
      {
        labelSimple: 'Orbit Status',
        labelPhysics: 'Total Energy Sign',
        value: status,
        noteTitle: 'Bound vs Unbound',
        noteText: 'Negative total energy (E < 0) keeps planets trapped; E ≥ 0 escapes!',
      },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'grav-kepler') {
      return {
        captionSimple: 'Kinetic energy and potential energy trade back and forth—their sum stays constant!',
        captionPhysics: 'Orbital Energy & Angular Momentum Conservation',
        tex: String.raw`E = \frac{1}{2}v^2 - \frac{GM}{r} = \text{const}, \quad \mathbf{L} = \mathbf{r}\times\mathbf{p}`,
      };
    }
    if (this.chapterId === 'grav-blackhole') {
      return {
        captionSimple: 'When escape speed exceeds light speed c, not even photons can climb out of the well.',
        captionPhysics: 'Schwarzschild Event Horizon & Photon Sphere',
        tex: String.raw`v_{\text{esc}} = \sqrt{\frac{2GM}{r}}, \quad r_s = \frac{2GM}{c^2}`,
      };
    }
    if (this.chapterId === 'grav-lagrange') {
      return {
        captionSimple: 'Gravity + outward spin cancel at L1–L5; Coriolis deflection stabilizes L4 and L5!',
        captionPhysics: 'Roche Potential & Jacobi Constant (CR3BP)',
        tex: String.raw`\Phi_{\text{eff}} = -\frac{GM_1}{r_1}-\frac{GM_2}{r_2}-\frac{1}{2}\Omega^2 r^2, \quad C_J = -2\Phi_{\text{eff}} - v^2`,
      };
    }
    return {
      captionSimple: 'Mass bends spacetime downward; planets fall freely around the curve unless they hit escape speed.',
      captionPhysics: 'Newtonian Potential Well & Escape Velocity',
      tex: String.raw`\Phi(r) = -\frac{GM}{r}, \quad v_{\text{esc}} = \sqrt{2}\,v_{\text{circ}}`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'grav-lagrange') {
      const [m1, m2] = this.getLagrangeMasses();
      const cJ = jacobiConstant(this.probe, m1, m2, this.lagrangeSep, DEFAULT_G, 0.35);
      return {
        ch1: this.probe.pos.x,
        ch2: this.probe.pos.z,
        ch3: cJ,
        labels: ['x', 'z', 'C_J'],
        units: ['', '', ''],
      };
    }
    const e = bodyMechanicalEnergy(this.probe, this.attractors);
    return {
      ch1: e.kinetic,
      ch2: e.potential,
      ch3: e.total,
      labels: ['K', 'U_g', 'E_tot'],
      units: ['', '', ''],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<GravChapterId, string> = {
      'grav-well': 'Vol III · Spacetime Gravity Well',
      'grav-kepler': 'Vol III · Kepler Elliptical Sling',
      'grav-binary': 'Vol III · Binary Star Dance',
      'grav-blackhole': 'Vol III · Black Hole Horizon',
      'grav-lagrange': `Vol III · Lagrange Points (${this.lagrangePreset})`,
    };
    return { label: names[this.chapterId], color: '#f59e0b' };
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

    if (this.chapterId === 'grav-lagrange') {
      const [m1, m2] = this.getLagrangeMasses();
      const phiEff = rocheEffectivePotential(
        hitPoint.x,
        hitPoint.z,
        m1,
        m2,
        this.lagrangeSep,
        DEFAULT_G,
        1.15,
      );
      const eff = rocheEffectiveAccel(
        hitPoint.x,
        hitPoint.z,
        m1,
        m2,
        this.lagrangeSep,
        DEFAULT_G,
        1.15,
      );
      return {
        ...study,
        metrics: [
          `Φ_eff = ${phiEff.toFixed(2)}`,
          `|g_eff| = ${Math.hypot(eff.ax, eff.az).toFixed(3)}`,
        ],
      };
    }

    const phi = gravityPotential(hitPoint.x, hitPoint.z, this.attractors, DEFAULT_G, 1.05);
    const r = Math.hypot(hitPoint.x, hitPoint.z);
    return {
      ...study,
      metrics: [`Φ = ${phi.toFixed(2)}`, `r = ${r.toFixed(1)} AU`],
    };
  }

  public getCallouts(): LabCalloutPoint[] {
    if (this.chapterId === 'grav-lagrange') {
      const pts: LabCalloutPoint[] = [];
      const labels: Record<'L1' | 'L2' | 'L4' | 'L5', string> = {
        L1: 'L1 (Solar)',
        L2: 'L2 (JWST)',
        L4: 'L4 (Trojan)',
        L5: 'L5 (Trojan)',
      };
      const markerIdxMap: Record<'L1' | 'L2' | 'L4' | 'L5', number> = {
        L1: 0,
        L2: 1,
        L4: 3,
        L5: 4,
      };
      for (const name of ['L1', 'L2', 'L4', 'L5'] as const) {
        const pt = this.lagrangePoints[name];
        const ySurf = this.rocheSurfaceY(pt.x, pt.z);
        const marker = this.lagrangeMarkers[markerIdxMap[name]];
        pts.push({
          id: `lag-${name}`,
          label: labels[name],
          accent: pt.stable ? '#10b981' : '#f43f5e',
          x: pt.x,
          y: ySurf + 1.25,
          z: pt.z,
          hover: {
            ...(marker?.userData.study as StudyMeta),
            metrics: [
              `x = ${pt.x.toFixed(2)} AU`,
              pt.stable ? 'Stable Basin' : 'Unstable Saddle',
            ],
          },
        });
      }
      if (!this.probeCaptured) {
        const py = this.rocheSurfaceY(this.probe.pos.x, this.probe.pos.z) + 1.25;
        pts.push({
          id: 'lag-probe',
          label: 'Spacecraft',
          accent: '#00f0ff',
          x: this.probe.pos.x,
          y: py,
          z: this.probe.pos.z,
          hover: {
            ...(this.probeMesh?.userData.study as StudyMeta),
            metrics: [`|v_rot| = ${Math.hypot(this.probe.vel.x, this.probe.vel.z).toFixed(2)}`],
          },
        });
      }
      return pts;
    }

    const pts: LabCalloutPoint[] = [];
    if (this.attractors[0]) {
      pts.push({
        id: 'star-0',
        label: this.chapterId === 'grav-blackhole' ? 'Event Horizon' : 'Star M',
        accent: this.chapterId === 'grav-blackhole' ? '#ef4444' : '#fbbf24',
        x: this.attractors[0].x,
        y: 2.2,
        z: this.attractors[0].z,
        hover: {
          ...(this.starMeshes[0]?.userData.study as StudyMeta),
          metrics: [`M = ${this.attractors[0].mass.toFixed(1)} M☉`],
        },
      });
    }
    if (!this.probeCaptured) {
      pts.push({
        id: 'probe',
        label: 'Orbiting Planet',
        accent: '#00f0ff',
        x: this.probe.pos.x,
        y: 1.4,
        z: this.probe.pos.z,
        hover: {
          ...(this.probeMesh?.userData.study as StudyMeta),
          metrics: [`|v| = ${Math.hypot(this.probe.vel.x, this.probe.vel.z).toFixed(2)} km/s`],
        },
      });
    }
    return pts;
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'grav-blackhole') return { position: [0, 12, 18], target: [0, -1.5, 0] };
    if (this.chapterId === 'grav-lagrange') return { position: [0, 17, 23], target: [0, -1.0, 0] };
    return { position: [0, 15, 22], target: [0, -1.2, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
