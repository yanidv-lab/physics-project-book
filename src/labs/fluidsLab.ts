import * as THREE from 'three';
import {
  evaluateCylinderPotentialFlow,
  evaluateKarmanWake,
  evaluateKdvSoliton,
  evaluateVenturi,
  kuttaJoukowskiLift,
  venturiRadius,
} from '../physics/fluidsPhysics';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type FluidsChapterId = 'fluid-venturi' | 'fluid-airfoil' | 'fluid-vortex' | 'fluid-wave';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

const STREAM_PARTICLES = 180;

export class FluidsLab implements LabModule {
  public readonly topicId = 'fluids' as const;
  public readonly group = new THREE.Group();

  private chapterId: FluidsChapterId = 'fluid-venturi';
  private simTime = 0;

  // Venturi
  private throatRatio = 0.45;
  private flowQ = 10.0;
  private gaugeBars: THREE.Mesh[] = [];

  // Airfoil / Magnus
  private uInf = 2.6;
  private circulation = 6.0;
  private liftArrow: THREE.ArrowHelper | null = null;

  // Soliton tank
  private solitonAmp1 = 2.8;
  private solitonAmp2 = 1.1;
  private solitonGeom: THREE.PlaneGeometry | null = null;
  private solitonMesh: THREE.Mesh | null = null;

  // Streamline particle buffer
  private streamMesh: THREE.InstancedMesh | null = null;
  private streamCoords = new Float32Array(STREAM_PARTICLES * 3);

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpCol = new THREE.Color();

  public activate(chapterId: string): void {
    const valid: FluidsChapterId[] = ['fluid-venturi', 'fluid-airfoil', 'fluid-vortex', 'fluid-wave'];
    this.chapterId = valid.includes(chapterId as FluidsChapterId)
      ? (chapterId as FluidsChapterId)
      : 'fluid-venturi';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (apply.action === 'relaunchSoliton') {
      this.simTime = 0;
      return;
    }
    if (typeof apply.throatRatio === 'number') this.throatRatio = apply.throatRatio;
    if (typeof apply.circulation === 'number') this.circulation = apply.circulation;
    if (typeof apply.amp1 === 'number') this.solitonAmp1 = apply.amp1;
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
    this.gaugeBars = [];
    this.liftArrow = null;
    this.solitonGeom = null;
    this.solitonMesh = null;
    this.streamMesh = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;

    if (this.chapterId === 'fluid-wave') {
      this.buildSolitonScene();
      return;
    }

    if (this.chapterId === 'fluid-venturi') {
      this.buildVenturiScene();
    } else {
      this.buildCylinderFlowScene(this.chapterId === 'fluid-vortex');
    }

    const pGeom = this.track(new THREE.SphereGeometry(0.12, 8, 8));
    const pMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.streamMesh = new THREE.InstancedMesh(pGeom, pMat, STREAM_PARTICLES);
    this.streamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.streamMesh.frustumCulled = false;

    for (let i = 0; i < STREAM_PARTICLES; i++) {
      this.streamCoords[i * 3] = -10 + Math.random() * 20;
      this.streamCoords[i * 3 + 1] = (Math.random() - 0.5) * 4.2;
      this.streamCoords[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
      this.streamMesh.setColorAt(i, this.tmpCol.setHex(0x06b6d4));
    }
    if (this.streamMesh.instanceColor) this.streamMesh.instanceColor.needsUpdate = true;
    this.group.add(this.streamMesh);
  }

  private buildVenturiScene(): void {
    const rIn = 2.6;
    const rTh = rIn * this.throatRatio;
    const ptsTop: THREE.Vector3[] = [];
    const ptsBot: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const x = -9.5 + (i / 60) * 19.0;
      const r = venturiRadius(x, rIn, rTh);
      ptsTop.push(new THREE.Vector3(x, r, 0));
      ptsBot.push(new THREE.Vector3(x, -r, 0));
    }
    const lineM = this.track(new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
    this.group.add(
      new THREE.Line(this.track(new THREE.BufferGeometry().setFromPoints(ptsTop)), lineM),
      new THREE.Line(this.track(new THREE.BufferGeometry().setFromPoints(ptsBot)), lineM),
    );

    // 3 Manometer Pressure Columns (-6, 0, +6)
    const barG = this.track(new THREE.BoxGeometry(0.55, 1, 0.55));
    barG.translate(0, 0.5, 0);
    for (const gx of [-6, 0, 6]) {
      const bar = new THREE.Mesh(
        barG,
        this.track(
          new THREE.MeshStandardMaterial({
            color: gx === 0 ? 0xf59e0b : 0x06b6d4,
            emissive: gx === 0 ? 0xd97706 : 0x0284c7,
            emissiveIntensity: 0.45,
          }),
        ),
      );
      const r = venturiRadius(gx, rIn, rTh);
      bar.position.set(gx, r + 0.1, 0);
      this.attachStudy(bar, {
        key: `venturi-gauge-${gx}`,
        title: gx === 0 ? 'Throat Low-Pressure Manometer' : 'Inlet High-Pressure Manometer',
        badge: 'BERNOULLI GAUGE',
        accent: gx === 0 ? '#f59e0b' : '#06b6d4',
        simple:
          gx === 0
            ? 'Fluid speeds up sharply through the tight throat—dropping internal static pressure!'
            : 'Wide pipe section flows slowly, maintaining higher static pressure.',
        deeper: 'P + ½ρv² = constant along every steady inviscid streamline.',
      });
      this.group.add(bar);
      this.gaugeBars.push(bar);
    }
  }

  private buildCylinderFlowScene(isVortexStreet: boolean): void {
    const cyl = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 28)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: isVortexStreet ? 0x64748b : 0xf97316,
          emissive: isVortexStreet ? 0x1e293b : 0xc2410c,
          emissiveIntensity: 0.45,
        }),
      ),
    );
    cyl.rotation.x = Math.PI * 0.5;
    this.attachStudy(cyl, {
      key: isVortexStreet ? 'vortex-cyl' : 'magnus-cyl',
      title: isVortexStreet ? 'Wake-Shedding Cylinder' : 'Spinning Magnus / Airfoil Cylinder',
      badge: isVortexStreet ? 'VORTEX STREET' : 'KUTTA-JOUKOWSKI',
      accent: '#06b6d4',
      simple: isVortexStreet
        ? 'Above moderate speed, smooth flow detaches behind the obstacle into an alternating Kármán vortex street!'
        : 'Positive circulation speeds flow over the top surface and slows it underneath—generating upward aerodynamic lift!',
      deeper: isVortexStreet
        ? 'Alternating Strouhal vortex shedding drives bridge/tower wind resonance (St ≈ 0.21).'
        : 'Kutta-Joukowski Lift Theorem: L′ = ρ U_∞ Γ perpendicular to freestream flow.',
    });
    this.group.add(cyl);

    if (!isVortexStreet) {
      this.liftArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        2.5,
        0xfbbf24,
        0.5,
        0.3,
      );
      this.group.add(this.liftArrow);
    }
  }

  private buildSolitonScene(): void {
    const geom = this.track(new THREE.PlaneGeometry(24, 6.5, 84, 10));
    geom.rotateX(-Math.PI * 0.5);
    const vCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    this.solitonGeom = geom;
    this.solitonMesh = new THREE.Mesh(
      geom,
      this.track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })),
    );
    this.attachStudy(this.solitonMesh, {
      key: 'kdv-soliton',
      title: 'Nonlinear KdV Soliton Waves',
      badge: 'SOLITON COLLISION',
      accent: '#06b6d4',
      simple: 'Watch the tall fast cyan wave overtake the short slower wave—and emerge on the other side completely intact!',
      deeper: 'Exact soliton solution of Korteweg–de Vries equation: speed scales linearly with amplitude.',
    });
    this.group.add(this.solitonMesh);
  }

  public update(dt: number): void {
    this.simTime += dt;

    if (this.chapterId === 'fluid-wave' && this.solitonGeom) {
      const tLoop = this.simTime % 11.5;
      const posAttr = this.solitonGeom.attributes.position as THREE.BufferAttribute;
      const colAttr = this.solitonGeom.attributes.color as THREE.BufferAttribute;
      const cBase = new THREE.Color(0x0f172a);
      const cPeak = new THREE.Color(0x00f0ff);

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const h = evaluateKdvSoliton(x, tLoop, this.solitonAmp1, this.solitonAmp2, -9.0, -2.5);
        posAttr.setY(i, h);
        this.tmpCol.copy(cBase).lerp(cPeak, Math.min(1, h / 3.0));
        colAttr.setXYZ(i, this.tmpCol.r, this.tmpCol.g, this.tmpCol.b);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      return;
    }

    if (this.chapterId === 'fluid-venturi') {
      const rIn = 2.6;
      const rTh = rIn * this.throatRatio;
      [-6, 0, 6].forEach((gx, idx) => {
        const sample = evaluateVenturi(gx, rIn, rTh, this.flowQ);
        const hBar = Math.max(0.25, Math.min(4.0, (sample.pressure / 100) * 3.2));
        if (this.gaugeBars[idx]) {
          this.gaugeBars[idx].scale.y = hBar;
        }
      });

      if (this.streamMesh) {
        this.tmpQuat.identity();
        this.tmpScale.set(1, 1, 1);
        for (let i = 0; i < STREAM_PARTICLES; i++) {
          let x = this.streamCoords[i * 3];
          const normLane = (i / STREAM_PARTICLES - 0.5) * 2;
          const samp = evaluateVenturi(x, rIn, rTh, this.flowQ);
          x += samp.velocity * 2.2 * dt;
          if (x > 9.5) x -= 19.0;
          this.streamCoords[i * 3] = x;

          const rLocal = venturiRadius(x, rIn, rTh);
          const y = normLane * (rLocal * 0.85);
          this.tmpPos.set(x, y, this.streamCoords[i * 3 + 2] * 0.4);
          this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.streamMesh.setMatrixAt(i, this.tmpMat);

          const speedHue = Math.min(1, samp.velocity / 3.0);
          this.tmpCol.setHex(0x06b6d4).lerp(new THREE.Color(0xfbbf24), speedHue);
          this.streamMesh.setColorAt(i, this.tmpCol);
        }
        this.streamMesh.instanceMatrix.needsUpdate = true;
        if (this.streamMesh.instanceColor) this.streamMesh.instanceColor.needsUpdate = true;
      }
      return;
    }

    // Airfoil / Vortex flow
    const isVortex = this.chapterId === 'fluid-vortex';
    if (this.liftArrow) {
      const lift = kuttaJoukowskiLift(1.0, this.uInf, this.circulation);
      const dirY = lift >= 0 ? 1 : -1;
      this.liftArrow.visible = Math.abs(lift) > 0.2;
      if (this.liftArrow.visible) {
        this.liftArrow.setDirection(new THREE.Vector3(0, dirY, 0));
        this.liftArrow.setLength(Math.min(4.8, 0.8 + Math.abs(lift) * 0.12), 0.5, 0.3);
      }
    }

    if (this.streamMesh) {
      this.tmpQuat.identity();
      this.tmpScale.set(1, 1, 1);
      for (let i = 0; i < STREAM_PARTICLES; i++) {
        let x = this.streamCoords[i * 3];
        let y = this.streamCoords[i * 3 + 1];
        const v = isVortex
          ? evaluateKarmanWake(x, y, this.simTime, this.uInf, 1.5)
          : evaluateCylinderPotentialFlow(x, y, this.uInf, 1.5, this.circulation);

        x += v.ux * dt * 1.1;
        y += v.uy * dt * 1.1;

        const r = Math.hypot(x, y);
        if (r < 1.58) {
          x = (x / Math.max(0.1, r)) * 1.62;
          y = (y / Math.max(0.1, r)) * 1.62;
        }
        if (x > 10.5 || x < -10.5 || Math.abs(y) > 5.5) {
          x = -10.2;
          y = (Math.random() - 0.5) * 7.0;
        }
        this.streamCoords[i * 3] = x;
        this.streamCoords[i * 3 + 1] = y;
        this.tmpPos.set(x, y, this.streamCoords[i * 3 + 2] * 0.5);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.streamMesh.setMatrixAt(i, this.tmpMat);
      }
      this.streamMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'fluid-venturi') {
      return {
        sliders: [
          { key: 'throatRatio', label: 'Throat Squeeze', min: 0.25, max: 0.9, step: 0.05, value: this.throatRatio, unit: 'r/R', noteTitle: 'Constriction Ratio', noteText: 'Narrowing the throat forces faster flow and lower Bernoulli pressure!' },
          { key: 'flowQ', label: 'Flow Rate Q', min: 3, max: 18, step: 0.5, value: this.flowQ, unit: 'L/s', noteTitle: 'Volume Flux', noteText: 'Total fluid passing every cross-section per second.' },
        ],
        toggles: [],
        actions: [],
      };
    }
    if (this.chapterId === 'fluid-wave') {
      return {
        sliders: [
          { key: 'solitonAmp1', label: 'Tall Soliton Height', min: 1.5, max: 3.8, step: 0.2, value: this.solitonAmp1, unit: 'm', noteTitle: 'Nonlinear Wave Speed', noteText: 'Taller KdV solitons outrun shorter ones!' },
          { key: 'solitonAmp2', label: 'Short Soliton Height', min: 0.5, max: 2.0, step: 0.2, value: this.solitonAmp2, unit: 'm', noteTitle: 'Slower Wave', noteText: 'Overtaken by the tall cyan pulse.' },
        ],
        toggles: [],
        actions: [{ id: 'relaunchSoliton', label: 'Restart Collision' }],
      };
    }
    const sliders = [
      { key: 'uInf', label: 'Wind Speed U_∞', min: 1.0, max: 5.0, step: 0.2, value: this.uInf, unit: 'm/s', noteTitle: 'Freestream Velocity', noteText: 'Incoming air speed from left to right.' },
    ];
    if (this.chapterId === 'fluid-airfoil') {
      sliders.push({ key: 'circulation', label: 'Circulation Spin Γ', min: -12, max: 12, step: 1, value: this.circulation, unit: 'm²/s', noteTitle: 'Bound Vortex', noteText: 'Positive Γ pushes upper flow faster, generating upward Lift!' });
    }
    return { sliders, toggles: [], actions: [] };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'throatRatio' && typeof value === 'number') {
      this.throatRatio = value;
      this.rebuildScene();
    } else if (key === 'flowQ' && typeof value === 'number') this.flowQ = value;
    else if (key === 'uInf' && typeof value === 'number') this.uInf = value;
    else if (key === 'circulation' && typeof value === 'number') this.circulation = value;
    else if (key === 'solitonAmp1' && typeof value === 'number') this.solitonAmp1 = value;
    else if (key === 'solitonAmp2' && typeof value === 'number') this.solitonAmp2 = value;
  }

  public runAction(actionId: string): void {
    if (actionId === 'relaunchSoliton') this.simTime = 0;
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'fluid-venturi') {
      const inlet = evaluateVenturi(-6, 2.6, 2.6 * this.throatRatio, this.flowQ);
      const throat = evaluateVenturi(0, 2.6, 2.6 * this.throatRatio, this.flowQ);
      return [
        { labelSimple: 'Inlet Speed v₁', labelPhysics: 'Wide Speed v₁', value: `${inlet.velocity.toFixed(2)} m/s`, noteTitle: 'Wide Pipe Speed', noteText: 'Slower flow in wide pipe section.' },
        { labelSimple: 'Throat Speed v₂', labelPhysics: 'Squeezed Speed v₂', value: `${throat.velocity.toFixed(2)} m/s`, noteTitle: 'Continuity Equation', noteText: 'A₁v₁ = A₂v₂ speeds flow up sharply!' },
        { labelSimple: 'Pressure Drop ΔP', labelPhysics: 'P₁ − P₂', value: `${(inlet.pressure - throat.pressure).toFixed(1)} Pa`, noteTitle: 'Bernoulli Drop', noteText: 'Kinetic energy gain reduces throat pressure.' },
        { labelSimple: 'Throat Ratio', labelPhysics: 'r₂ / r₁', value: `${(this.throatRatio * 100).toFixed(0)}%`, noteTitle: 'Area Ratio', noteText: 'Velocity scales as 1/r².' },
      ];
    }
    if (this.chapterId === 'fluid-airfoil') {
      const lift = kuttaJoukowskiLift(1.2, this.uInf, this.circulation);
      return [
        { labelSimple: 'Aerodynamic Lift', labelPhysics: 'Lift L′ = ρUΓ', value: `${lift.toFixed(1)} N/m`, noteTitle: 'Kutta-Joukowski Force', noteText: 'Upward force per unit wingspan.' },
        { labelSimple: 'Wind Speed U_∞', labelPhysics: 'Freestream U_∞', value: `${this.uInf.toFixed(1)} m/s`, noteTitle: 'Airspeed', noteText: 'Lift grows linearly with both U_∞ and Γ.' },
        { labelSimple: 'Circulation Γ', labelPhysics: 'Vortex Γ', value: `${this.circulation.toFixed(1)} m²/s`, noteTitle: 'Spin / Camber', noteText: 'Reverses lift downward when negative.' },
        { labelSimple: 'Top vs Bottom', labelPhysics: 'Pressure Diff', value: this.circulation > 0 ? 'Low Top Pressure' : 'Downforce', noteTitle: 'Bernoulli Wing', noteText: 'Faster air on top lowers pressure above wing.' },
      ];
    }
    if (this.chapterId === 'fluid-vortex') {
      return [
        { labelSimple: 'Wind Speed U_∞', labelPhysics: 'Flow Speed', value: `${this.uInf.toFixed(1)} m/s`, noteTitle: 'Incoming Stream', noteText: 'Drives alternating wake shedding.' },
        { labelSimple: 'Shed Frequency', labelPhysics: 'Strouhal f_s', value: `${(0.21 * this.uInf / 3.0).toFixed(2)} Hz`, noteTitle: 'Vortex Cadence', noteText: 'Universal cylinder shedding relation fD/U ≈ 0.21.' },
        { labelSimple: 'Strouhal Number', labelPhysics: 'St = fD / U', value: '0.21', noteTitle: 'Dimensionless St', noteText: 'Governs Tacoma-style wake resonance.' },
        { labelSimple: 'Wake Pattern', labelPhysics: 'Alternating', value: 'Kármán Street', noteText: 'Opposite-spin eddies.', noteTitle: 'Vortex Street' },
      ];
    }
    return [
      { labelSimple: 'Tall Wave Speed', labelPhysics: 'c₁ = 0.75 A₁', value: `${(0.75 * this.solitonAmp1).toFixed(2)} m/s`, noteTitle: 'Amplitude-Dependent Speed', noteText: 'Nonlinear wave speed grows with height!' },
      { labelSimple: 'Short Wave Speed', labelPhysics: 'c₂ = 0.75 A₂', value: `${(0.75 * this.solitonAmp2).toFixed(2)} m/s`, noteTitle: 'Smaller Pulse', noteText: 'Gets cleanly overtaken without dispersing.' },
      { labelSimple: 'Height Ratio', labelPhysics: 'A₁ / A₂', value: `${(this.solitonAmp1 / this.solitonAmp2).toFixed(2)}×`, noteTitle: 'Amplitude Ratio', noteText: 'Determines overtaking time.' },
      { labelSimple: 'Wave Regime', labelPhysics: 'Soliton Equation', value: 'KdV Nonlinear', noteTitle: 'Solitary Waves', noteText: 'Dispersion cancels steepening.' },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'fluid-venturi') {
      return {
        captionSimple: 'Squeeze a pipe and fluid speeds up—stealing energy from pressure!',
        captionPhysics: 'Continuity & Bernoulli Equations',
        tex: String.raw`A_1 v_1 = A_2 v_2, \quad P + \frac{1}{2}\rho v^2 = \text{const}`,
      };
    }
    if (this.chapterId === 'fluid-airfoil') {
      return {
        captionSimple: 'Air spinning faster over the top of a wing or cylinder lifts it upward.',
        captionPhysics: 'Kutta-Joukowski Lift Theorem',
        tex: String.raw`L' = \rho U_\infty \Gamma`,
      };
    }
    if (this.chapterId === 'fluid-vortex') {
      return {
        captionSimple: 'Bluff obstacles shed alternating swirling eddies downstream at a universal frequency ratio.',
        captionPhysics: 'Strouhal Vortex Shedding',
        tex: String.raw`\text{St} = \frac{f D}{U_\infty} \approx 0.21`,
      };
    }
    return {
      captionSimple: 'In shallow channels, tall solitary waves travel faster and pass straight through smaller waves intact!',
      captionPhysics: 'Korteweg–de Vries (KdV) Soliton Equation',
      tex: String.raw`u_t + 6 u u_x + u_{xxx} = 0`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'fluid-venturi') {
      const i = evaluateVenturi(-6, 2.6, 2.6 * this.throatRatio, this.flowQ);
      const t = evaluateVenturi(0, 2.6, 2.6 * this.throatRatio, this.flowQ);
      return { ch1: i.pressure, ch2: t.pressure, ch3: t.velocity, labels: ['P_in', 'P_thr', 'v_thr'], units: ['Pa', 'Pa', 'm/s'] };
    }
    if (this.chapterId === 'fluid-wave') {
      const tLoop = this.simTime % 11.5;
      return {
        ch1: evaluateKdvSoliton(0, tLoop, this.solitonAmp1, this.solitonAmp2, -9.0, -2.5),
        ch2: evaluateKdvSoliton(4, tLoop, this.solitonAmp1, this.solitonAmp2, -9.0, -2.5),
        ch3: 0.75 * this.solitonAmp1,
        labels: ['h(0)', 'h(4)', 'c₁'],
        units: ['m', 'm', 'm/s'],
      };
    }
    return {
      ch1: kuttaJoukowskiLift(1.0, this.uInf, this.circulation),
      ch2: this.uInf,
      ch3: this.circulation,
      labels: ['Lift', 'U_∞', 'Γ'],
      units: ['N', 'm/s', ''],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<FluidsChapterId, string> = {
      'fluid-venturi': 'Vol VIII · Venturi & Bernoulli',
      'fluid-airfoil': 'Vol VIII · Magnus Lift & Wing Flow',
      'fluid-vortex': 'Vol VIII · Kármán Vortex Street',
      'fluid-wave': 'Vol VIII · KdV Shallow Solitons',
    };
    return { label: names[this.chapterId], color: '#06b6d4' };
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
    if (this.chapterId === 'fluid-wave') return { position: [0, 9, 19], target: [0, 0.5, 0] };
    return { position: [0, 3.5, 16.5], target: [0, 0.5, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
