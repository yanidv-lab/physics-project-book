import * as THREE from 'three';
import {
  doublePendulumEnergy,
  evaluateCoupledModes,
  gyroPrecessionRate,
  rotatingFramePosition,
  stepDoublePendulumRK4,
  type CoupledModeKind,
  type DoublePendulumState,
} from '../physics/mechanicsPhysics';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type MechChapterId = 'mech-chaos' | 'mech-coupled' | 'mech-gyro' | 'mech-coriolis';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

const TRAIL_N = 140;

export class MechanicsLab implements LabModule {
  public readonly topicId = 'mechanics' as const;
  public readonly group = new THREE.Group();

  private chapterId: MechChapterId = 'mech-chaos';
  private simTime = 0;

  // Chaos twin pendulums
  private chaosGravity = 9.8;
  private chaosOffset = 0.002;
  private pendA: DoublePendulumState = { theta1: 2.15, omega1: 0, theta2: 2.35, omega2: 0 };
  private pendB: DoublePendulumState = { theta1: 2.152, omega1: 0, theta2: 2.35, omega2: 0 };
  private rodsA: THREE.Line | null = null;
  private rodsB: THREE.Line | null = null;
  private bobA2: THREE.Mesh | null = null;
  private bobB2: THREE.Mesh | null = null;
  private trailA: THREE.Line | null = null;
  private trailB: THREE.Line | null = null;
  private ptsA: THREE.Vector3[] = [];
  private ptsB: THREE.Vector3[] = [];

  // Coupled Oscillators
  private coupleMode: CoupledModeKind = 'beat';
  private coupleK = 1.6;
  private block1: THREE.Mesh | null = null;
  private block2: THREE.Mesh | null = null;
  private springLine: THREE.Line | null = null;

  // Gyroscope
  private gyroSpin = 28;
  private gyroTiltDeg = 28;
  private gyroPrecessAngle = 0;
  private gyroArmGroup = new THREE.Group();
  private gyroWheelGroup = new THREE.Group();

  // Coriolis Turntable
  private diskOmega = 0.85;
  private puckSpeed = 2.4;
  private coriolisFrame: 'rotating' | 'inertial' = 'rotating';
  private puckMesh: THREE.Mesh | null = null;
  private diskMesh: THREE.Mesh | null = null;
  private puckTrail: THREE.Line | null = null;
  private puckPts: THREE.Vector3[] = [];

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  public activate(chapterId: string): void {
    const valid: MechChapterId[] = ['mech-chaos', 'mech-coupled', 'mech-gyro', 'mech-coriolis'];
    this.chapterId = valid.includes(chapterId as MechChapterId)
      ? (chapterId as MechChapterId)
      : 'mech-chaos';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'relaunchChaos') {
      this.rebuildScene();
      return;
    }
    if (apply.action === 'relaunchPuck') {
      this.simTime = 0;
      this.puckPts = [];
      return;
    }
    if (typeof apply.coupleMode === 'string') this.coupleMode = apply.coupleMode as CoupledModeKind;
    if (typeof apply.gyroSpin === 'number') this.gyroSpin = apply.gyroSpin;
    if (typeof apply.frame === 'string') {
      this.coriolisFrame = apply.frame as 'rotating' | 'inertial';
      this.simTime = 0;
      this.puckPts = [];
    }
    this.rebuildScene();
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
    this.ptsA = [];
    this.ptsB = [];
    this.puckPts = [];
    this.rodsA = null;
    this.rodsB = null;
    this.bobA2 = null;
    this.bobB2 = null;
    this.trailA = null;
    this.trailB = null;
    this.block1 = null;
    this.block2 = null;
    this.springLine = null;
    this.puckMesh = null;
    this.diskMesh = null;
    this.puckTrail = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;
    if (this.chapterId === 'mech-chaos') this.buildChaosScene();
    else if (this.chapterId === 'mech-coupled') this.buildCoupledScene();
    else if (this.chapterId === 'mech-gyro') this.buildGyroScene();
    else this.buildCoriolisScene();
  }

  private buildChaosScene(): void {
    this.pendA = { theta1: 2.15, omega1: 0, theta2: 2.35, omega2: 0 };
    this.pendB = { theta1: 2.15 + this.chaosOffset, omega1: 0, theta2: 2.35, omega2: 0 };

    const pivot = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.22, 14, 14)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xf8fafc })),
    );
    pivot.position.set(0, 2.5, 0);
    this.group.add(pivot);

    const makeRod = (color: number): THREE.Line => {
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      const l = new THREE.Line(g, this.track(new THREE.LineBasicMaterial({ color })));
      this.group.add(l);
      return l;
    };
    this.rodsA = makeRod(0x00f0ff);
    this.rodsB = makeRod(0xec4899);

    const bobG = this.track(new THREE.SphereGeometry(0.32, 16, 16));
    this.bobA2 = new THREE.Mesh(bobG, this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff })));
    this.bobB2 = new THREE.Mesh(bobG, this.track(new THREE.MeshBasicMaterial({ color: 0xec4899 })));
    this.attachStudy(this.bobA2, {
      key: 'chaos-pend',
      title: 'Twin Chaotic Double Pendulums',
      badge: 'BUTTERFLY EFFECT',
      accent: '#00f0ff',
      simple: 'Cyan and Pink start nearly identical—separated by 0.002 rad—yet rapidly diverge into completely uncorrelated paths!',
      deeper: 'Deterministic Lagrangian ODE integrated via 4th-order Runge-Kutta exhibits positive Lyapunov divergence exponent.',
    });
    this.group.add(this.bobA2, this.bobB2);

    const makeTrail = (color: number): THREE.Line => {
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
      const l = new THREE.Line(
        g,
        this.track(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })),
      );
      l.frustumCulled = false;
      this.group.add(l);
      return l;
    };
    this.trailA = makeTrail(0x00f0ff);
    this.trailB = makeTrail(0xec4899);
  }

  private buildCoupledScene(): void {
    const wallG = this.track(new THREE.BoxGeometry(0.35, 3.6, 2.2));
    const wallM = this.track(new THREE.MeshStandardMaterial({ color: 0x334155 }));
    for (const wx of [-8.0, 8.0]) {
      const w = new THREE.Mesh(wallG, wallM);
      w.position.set(wx, 0, 0);
      this.group.add(w);
    }

    const bG = this.track(new THREE.BoxGeometry(1.5, 1.5, 1.5));
    this.block1 = new THREE.Mesh(
      bG,
      this.track(new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x0284c7, emissiveIntensity: 0.5 })),
    );
    this.block2 = new THREE.Mesh(
      bG,
      this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.5 })),
    );
    this.attachStudy(this.block1, {
      key: 'coupled-m1',
      title: 'Coupled Oscillator Blocks (M₁ & M₂)',
      badge: 'NORMAL MODES',
      accent: '#38bdf8',
      simple: 'In Beat Mode, watch one mass come to a complete halt while all energy transfers smoothly through the center spring to its partner!',
      deeper: 'Linear superposition of symmetric mode ω₁ = √(k/m) and antisymmetric mode ω₂ = √((k + 2k_c)/m).',
    });
    this.attachStudy(this.block2, this.block1.userData.study as StudyMeta);
    this.group.add(this.block1, this.block2);

    const spG = this.track(new THREE.BufferGeometry());
    spG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(45 * 3), 3));
    this.springLine = new THREE.Line(spG, this.track(new THREE.LineBasicMaterial({ color: 0xf8fafc })));
    this.group.add(this.springLine);
  }

  private buildGyroScene(): void {
    // Support stand at origin
    const stand = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.14, 0.28, 4.2, 16)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x475569 })),
    );
    stand.position.set(0, -2.1, 0);
    this.group.add(stand);

    this.gyroArmGroup = new THREE.Group();
    const tiltRad = (this.gyroTiltDeg * Math.PI) / 180;

    const axle = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 12)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xf8fafc })),
    );
    axle.rotation.z = -Math.PI * 0.5;
    axle.position.set(2.3, 0, 0);

    this.gyroWheelGroup = new THREE.Group();
    this.gyroWheelGroup.position.set(3.2, 0, 0);
    const rim = new THREE.Mesh(
      this.track(new THREE.TorusGeometry(1.65, 0.22, 14, 40)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.6 })),
    );
    rim.rotation.y = Math.PI * 0.5;
    const spoke = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.12, 3.2, 0.18)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 })),
    );
    this.gyroWheelGroup.add(rim, spoke);
    this.attachStudy(rim, {
      key: 'gyro-wheel',
      title: 'Spinning Gyroscope Flywheel',
      badge: 'ANGULAR MOMENTUM',
      accent: '#38bdf8',
      simple: 'Instead of falling downward, gravity creates a sideways torque τ = r × mg that turns the angular momentum vector L horizontally!',
      deeper: 'Steady precession angular speed Ω_p = m g r / (I ω_s)—faster spin slows precession down!',
    });

    const holder = new THREE.Group();
    holder.rotation.z = tiltRad;
    holder.add(axle, this.gyroWheelGroup);
    this.gyroArmGroup.add(holder);
    this.group.add(this.gyroArmGroup);
  }

  private buildCoriolisScene(): void {
    this.diskMesh = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(7.2, 7.2, 0.28, 48)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })),
    );
    this.diskMesh.position.set(0, -0.2, 0);
    const radialLine = new THREE.Line(
      this.track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-7.2, 0.16, 0), new THREE.Vector3(7.2, 0.16, 0)])),
      this.track(new THREE.LineBasicMaterial({ color: 0x475569 })),
    );
    this.diskMesh.add(radialLine);
    this.attachStudy(this.diskMesh, {
      key: 'coriolis-disk',
      title: 'Rotating Carousel Turntable',
      badge: 'CORIOLIS EFFECT',
      accent: '#00f0ff',
      simple: 'Switch between Inertial (straight line!) and Rotating Camera (curved loop) to see that the Coriolis force is purely a frame effect!',
      deeper: 'F_cor = −2m(Ω × v_rot) curves frictionless motion sideways in any spinning reference frame.',
    });
    this.group.add(this.diskMesh);

    this.puckMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.36, 18, 18)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.7 })),
    );
    this.group.add(this.puckMesh);

    const tG = this.track(new THREE.BufferGeometry());
    tG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    this.puckTrail = new THREE.Line(tG, this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff })));
    this.puckTrail.frustumCulled = false;
    this.group.add(this.puckTrail);
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'mech-chaos') {
      const substeps = 5;
      const h = Math.min(dt, 0.04) / substeps;
      for (let s = 0; s < substeps; s++) {
        stepDoublePendulumRK4(this.pendA, 1, 1, 2.5, 2.5, this.chaosGravity, h);
        stepDoublePendulumRK4(this.pendB, 1, 1, 2.5, 2.5, this.chaosGravity, h);
      }

      const updatePend = (
        st: DoublePendulumState,
        rods: THREE.Line | null,
        bob: THREE.Mesh | null,
        trail: THREE.Line | null,
        pts: THREE.Vector3[],
      ) => {
        const y0 = 2.5;
        const x1 = 2.5 * Math.sin(st.theta1);
        const y1 = y0 - 2.5 * Math.cos(st.theta1);
        const x2 = x1 + 2.5 * Math.sin(st.theta2);
        const y2 = y1 - 2.5 * Math.cos(st.theta2);
        if (rods) {
          const attr = rods.geometry.getAttribute('position') as THREE.BufferAttribute;
          attr.setXYZ(0, 0, y0, 0);
          attr.setXYZ(1, x1, y1, 0);
          attr.setXYZ(2, x2, y2, 0);
          attr.needsUpdate = true;
        }
        if (bob) bob.position.set(x2, y2, 0);
        if (trail) {
          pts.push(new THREE.Vector3(x2, y2, 0));
          if (pts.length > TRAIL_N) pts.shift();
          const attr = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
          const last = pts[pts.length - 1] ?? new THREE.Vector3();
          for (let i = 0; i < TRAIL_N; i++) {
            const p = pts[i] ?? last;
            attr.setXYZ(i, p.x, p.y, p.z);
          }
          attr.needsUpdate = true;
        }
      };

      updatePend(this.pendA, this.rodsA, this.bobA2, this.trailA, this.ptsA);
      updatePend(this.pendB, this.rodsB, this.bobB2, this.trailB, this.ptsB);
      return;
    }

    if (this.chapterId === 'mech-coupled') {
      const m = evaluateCoupledModes(this.simTime, 2.4, this.coupleK, 1.0, this.coupleMode);
      const x1 = -3.0 + m.x1;
      const x2 = 3.0 + m.x2;
      if (this.block1) this.block1.position.x = x1;
      if (this.block2) this.block2.position.x = x2;
      if (this.springLine) {
        const attr = this.springLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < 45; i++) {
          const u = i / 44;
          let x = -8.0 + u * 16.0;
          if (u < 0.33) {
            x = -8.0 + (u / 0.33) * (x1 - 0.75 + 8.0);
          } else if (u < 0.67) {
            x = x1 + 0.75 + ((u - 0.33) / 0.34) * (x2 - x1 - 1.5);
          } else {
            x = x2 + 0.75 + ((u - 0.67) / 0.33) * (8.0 - x2 - 0.75);
          }
          const zig = (i % 2 === 0 ? 1 : -1) * 0.28;
          attr.setXYZ(i, x, zig, 0);
        }
        attr.needsUpdate = true;
      }
      return;
    }

    if (this.chapterId === 'mech-gyro') {
      const precessRate = gyroPrecessionRate(1.2, 9.8, 0.8, 1.0, this.gyroSpin);
      this.gyroPrecessAngle += precessRate * dt;
      this.gyroArmGroup.rotation.y = this.gyroPrecessAngle;
      this.gyroWheelGroup.rotation.x += this.gyroSpin * dt * 0.25;
      return;
    }

    // Coriolis
    const period = (2 * 6.8) / Math.max(0.5, this.puckSpeed);
    const tMod = this.simTime % period;
    if (tMod < dt * 1.5) this.puckPts = [];
    const pos = rotatingFramePosition(-6.5, 0, this.puckSpeed, 0, this.diskOmega, tMod);

    const px = this.coriolisFrame === 'rotating' ? pos.xRot : pos.xInertial;
    const pz = this.coriolisFrame === 'rotating' ? pos.zRot : pos.zInertial;

    if (this.diskMesh) {
      this.diskMesh.rotation.y = this.coriolisFrame === 'rotating' ? 0 : -this.diskOmega * tMod;
    }
    if (this.puckMesh) this.puckMesh.position.set(px, 0.35, pz);
    if (this.puckTrail) {
      this.puckPts.push(new THREE.Vector3(px, 0.35, pz));
      if (this.puckPts.length > TRAIL_N) this.puckPts.shift();
      const attr = this.puckTrail.geometry.getAttribute('position') as THREE.BufferAttribute;
      const last = this.puckPts[this.puckPts.length - 1] ?? new THREE.Vector3();
      for (let i = 0; i < TRAIL_N; i++) {
        const p = this.puckPts[i] ?? last;
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      attr.needsUpdate = true;
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'mech-chaos') {
      return {
        sliders: [
          { key: 'chaosGravity', label: 'Gravity g', min: 2, max: 18, step: 0.5, value: this.chaosGravity, unit: 'm/s²', noteTitle: 'Swing Speed', noteText: 'Higher g speeds up chaotic divergence.' },
        ],
        toggles: [],
        actions: [{ id: 'relaunchChaos', label: 'Reset Twin Pendulums' }],
      };
    }
    if (this.chapterId === 'mech-coupled') {
      return {
        sliders: [
          { key: 'coupleK', label: 'Coupling Spring k_c', min: 0.2, max: 4.5, step: 0.2, value: this.coupleK, unit: 'N/m', noteTitle: 'Energy Transfer Rate', noteText: 'Controls beat frequency between symmetric and antisymmetric modes.' },
        ],
        toggles: [],
        actions: [
          { id: 'mode-beat', label: 'Beat Transfer' },
          { id: 'mode-sym', label: 'Symmetric' },
          { id: 'mode-anti', label: 'Antisymmetric' },
        ],
      };
    }
    if (this.chapterId === 'mech-gyro') {
      return {
        sliders: [
          { key: 'gyroSpin', label: 'Flywheel Spin ω_s', min: 6, max: 60, step: 2, value: this.gyroSpin, unit: 'rad/s', noteTitle: 'Spin Rate', noteText: 'Faster spin INCREASES angular momentum and makes precession SLOWER!' },
          { key: 'gyroTiltDeg', label: 'Tilt Angle', min: 5, max: 45, step: 5, value: this.gyroTiltDeg, unit: '°', noteTitle: 'Axle Tilt', noteText: 'Gyroscope stays supported regardless of tilt.' },
        ],
        toggles: [],
        actions: [],
      };
    }
    return {
      sliders: [
        { key: 'diskOmega', label: 'Carousel Spin Ω', min: 0.1, max: 2.0, step: 0.1, value: this.diskOmega, unit: 'rad/s', noteTitle: 'Rotation Rate', noteText: 'Faster spin bends the rotating-frame path tighter.' },
        { key: 'puckSpeed', label: 'Puck Launch Speed', min: 1.0, max: 4.5, step: 0.2, value: this.puckSpeed, unit: 'm/s', noteTitle: 'Linear Speed', noteText: 'Straight-line velocity in inertial space.' },
      ],
      toggles: [],
      actions: [
        { id: 'frame-rotating', label: 'Rotating Frame' },
        { id: 'frame-inertial', label: 'Inertial Frame' },
      ],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'chaosGravity' && typeof value === 'number') this.chaosGravity = value;
    else if (key === 'coupleK' && typeof value === 'number') this.coupleK = value;
    else if (key === 'gyroSpin' && typeof value === 'number') this.gyroSpin = value;
    else if (key === 'gyroTiltDeg' && typeof value === 'number') {
      this.gyroTiltDeg = value;
      this.rebuildScene();
    } else if (key === 'diskOmega' && typeof value === 'number') this.diskOmega = value;
    else if (key === 'puckSpeed' && typeof value === 'number') {
      this.puckSpeed = value;
      this.simTime = 0;
      this.puckPts = [];
    }
  }

  public runAction(actionId: string): void {
    if (actionId === 'relaunchChaos') this.rebuildScene();
    else if (actionId === 'mode-beat') this.coupleMode = 'beat';
    else if (actionId === 'mode-sym') this.coupleMode = 'symmetric';
    else if (actionId === 'mode-anti') this.coupleMode = 'antisymmetric';
    else if (actionId === 'frame-rotating') {
      this.coriolisFrame = 'rotating';
      this.puckPts = [];
    } else if (actionId === 'frame-inertial') {
      this.coriolisFrame = 'inertial';
      this.puckPts = [];
    }
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'mech-chaos') {
      const e = doublePendulumEnergy(this.pendA, 1, 1, 2.5, 2.5, this.chaosGravity);
      const diff = Math.abs(this.pendA.theta2 - this.pendB.theta2);
      return [
        { labelSimple: 'Divergence |Δθ₂|', labelPhysics: 'Trajectory Split', value: `${diff.toFixed(3)} rad`, noteTitle: 'Chaos Divergence', noteText: 'Starts at 0.000 rad and explodes exponentially!' },
        { labelSimple: 'Total Energy E', labelPhysics: 'RK4 Energy', value: `${e.toFixed(2)} J`, noteTitle: 'Conserved Energy', noteText: 'Chaos does NOT mean random energy—energy stays constant!' },
        { labelSimple: 'Pendulum 1 Angle', labelPhysics: 'θ₁ (rad)', value: this.pendA.theta1.toFixed(2), noteTitle: 'Upper Arm', noteText: 'Angle of upper rod.' },
        { labelSimple: 'Initial Delta', labelPhysics: 'Seed Offset', value: `${this.chaosOffset} rad`, noteTitle: 'Butterfly Seed', noteText: 'Tiny initial angle separation.' },
      ];
    }
    if (this.chapterId === 'mech-coupled') {
      const m = evaluateCoupledModes(this.simTime, 2.4, this.coupleK, 1.0, this.coupleMode);
      return [
        { labelSimple: 'Active Pattern', labelPhysics: 'Mode', value: this.coupleMode.toUpperCase(), noteTitle: 'Oscillation Mode', noteText: 'Beat transfers energy alternately between both blocks.' },
        { labelSimple: 'Symmetric ω₁', labelPhysics: 'ω₁ = √(k/m)', value: `${m.omega1.toFixed(2)} rad/s`, noteTitle: 'In-Phase Mode', noteText: 'Middle spring stays unstretched.' },
        { labelSimple: 'Antisymmetric ω₂', labelPhysics: 'ω₂ = √((k+2k_c)/m)', value: `${m.omega2.toFixed(2)} rad/s`, noteTitle: 'Out-of-Phase Mode', noteText: 'Higher frequency due to center spring.' },
        { labelSimple: 'Beat Rate', labelPhysics: '|ω₂ − ω₁|', value: `${Math.abs(m.omega2 - m.omega1).toFixed(2)} rad/s`, noteTitle: 'Swap Speed', noteText: 'How quickly energy trades blocks.' },
      ];
    }
    if (this.chapterId === 'mech-gyro') {
      const rate = gyroPrecessionRate(1.2, 9.8, 0.8, 1.0, this.gyroSpin);
      return [
        { labelSimple: 'Precession Ω_p', labelPhysics: 'Ω_p = mgr / Iω_s', value: `${rate.toFixed(3)} rad/s`, noteTitle: 'Horizontal Precession', noteText: 'Slows down when flywheel spins faster.' },
        { labelSimple: 'Flywheel Spin ω_s', labelPhysics: 'Spin Speed', value: `${this.gyroSpin} rad/s`, noteTitle: 'Angular Velocity', noteText: 'Carries stabilizing angular momentum L.' },
        { labelSimple: 'Axle Tilt', labelPhysics: 'Angle', value: `${this.gyroTiltDeg}°`, noteTitle: 'Gravity Torque Lever', noteText: 'Torque acts perpendicular to L, steering horizontally.' },
        { labelSimple: 'Spin Direction', labelPhysics: 'Stability', value: 'Gyroscopic Lock', noteText: 'High L resists falling.', noteTitle: 'Gyro Stability' },
      ];
    }
    return [
      { labelSimple: 'Camera Frame', labelPhysics: 'Observer Frame', value: this.coriolisFrame.toUpperCase(), noteTitle: 'Reference Frame', noteText: 'Rotating frame shows fictitious Coriolis deflection.' },
      { labelSimple: 'Carousel Spin Ω', labelPhysics: 'Frame Ω', value: `${this.diskOmega.toFixed(1)} rad/s`, noteTitle: 'Angular Speed', noteText: 'Turntable rotation rate.' },
      { labelSimple: 'Launch Speed v', labelPhysics: 'Inertial Speed', value: `${this.puckSpeed.toFixed(1)} m/s`, noteTitle: 'Constant Speed', noteText: 'True motion is a straight line!' },
      { labelSimple: 'Fictitious Push', labelPhysics: '−2 Ω × v', value: `${(2 * this.diskOmega * this.puckSpeed).toFixed(1)} m/s²`, noteTitle: 'Coriolis Magnitude', noteText: 'Bends cyclones & hurricanes on Earth!' },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'mech-chaos') {
      return {
        captionSimple: 'Tiny differences grow exponentially—perfectly deterministic physics can still be unpredictable!',
        captionPhysics: 'Chaotic Sensitivity & Lyapunov Divergence',
        tex: String.raw`|\delta\boldsymbol{\theta}(t)| \approx |\delta\boldsymbol{\theta}_0|\,e^{\lambda t}`,
      };
    }
    if (this.chapterId === 'mech-coupled') {
      return {
        captionSimple: 'Two connected springs share two pure frequencies—mixing them creates rhythmic energy beats!',
        captionPhysics: 'Normal Mode Frequencies',
        tex: String.raw`\omega_1 = \sqrt{\frac{k}{m}}, \quad \omega_2 = \sqrt{\frac{k + 2k_c}{m}}`,
      };
    }
    if (this.chapterId === 'mech-gyro') {
      return {
        captionSimple: 'Gravity torque turns the gyroscope sideways instead of letting it topple downward.',
        captionPhysics: 'Gyroscopic Torque & Precession',
        tex: String.raw`\boldsymbol{\tau} = \frac{d\mathbf{L}}{dt} \implies \Omega_p = \frac{m g r}{I \omega_s}`,
      };
    }
    return {
      captionSimple: 'On a spinning platform, straight-line motion looks curved due to the Coriolis effect.',
      captionPhysics: 'Coriolis Acceleration in Rotating Frames',
      tex: String.raw`\mathbf{a}_{\text{cor}} = -2\,\boldsymbol{\Omega} \times \mathbf{v}_{\text{rot}}`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'mech-chaos') {
      return {
        ch1: this.pendA.theta2,
        ch2: this.pendB.theta2,
        ch3: Math.abs(this.pendA.theta2 - this.pendB.theta2),
        labels: ['θ₂A', 'θ₂B', '|Δθ|'],
        units: ['rad', 'rad', 'rad'],
      };
    }
    if (this.chapterId === 'mech-coupled') {
      const m = evaluateCoupledModes(this.simTime, 2.4, this.coupleK, 1.0, this.coupleMode);
      return { ch1: m.x1, ch2: m.x2, ch3: m.x1 + m.x2, labels: ['x₁', 'x₂', 'Sum'], units: ['', '', ''] };
    }
    if (this.chapterId === 'mech-gyro') {
      const r = gyroPrecessionRate(1.2, 9.8, 0.8, 1.0, this.gyroSpin);
      return { ch1: Math.cos(this.gyroPrecessAngle), ch2: Math.sin(this.gyroPrecessAngle), ch3: r, labels: ['Lx', 'Lz', 'Ωp'], units: ['', '', ''] };
    }
    return { ch1: this.puckMesh?.position.x ?? 0, ch2: this.puckMesh?.position.z ?? 0, ch3: this.diskOmega, labels: ['x', 'z', 'Ω'], units: ['', '', ''] };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<MechChapterId, string> = {
      'mech-chaos': 'Vol VII · Double Pendulum Chaos',
      'mech-coupled': 'Vol VII · Coupled Normal Modes',
      'mech-gyro': 'Vol VII · Gyroscope Precession',
      'mech-coriolis': 'Vol VII · Coriolis Turntable',
    };
    return { label: names[this.chapterId], color: '#38bdf8' };
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public inspectHit(hitObj: THREE.Object3D): LabHoverData | null {
    let cur: THREE.Object3D | null = hitObj;
    while (cur) {
      if (cur.userData?.study) return { ...(cur.userData.study as StudyMeta), metrics: [] };
      cur = cur.parent;
    }
    return null;
  }

  public getCallouts(): LabCalloutPoint[] {
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    if (this.chapterId === 'mech-coriolis') return { position: [0, 14, 13], target: [0, 0, 0] };
    return { position: [0, 4.5, 16.5], target: [0, 0, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
