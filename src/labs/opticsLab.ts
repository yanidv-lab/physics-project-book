import * as THREE from 'three';
import {
  cauchyIndex,
  computeSnellRefraction,
  evaluateMalusStack,
  solveThinLens,
} from '../physics/opticsPhysics';
import type {
  LabCalloutPoint,
  LabControlSchema,
  LabFormula,
  LabHoverData,
  LabModule,
  LabOscilloscopeSample,
  LabTelemetryCard,
} from './labModule';

type OpticsChapterId = 'opt-snell' | 'opt-prism' | 'opt-lens' | 'opt-polar';

interface StudyMeta {
  key: string;
  title: string;
  badge: string;
  accent: string;
  simple: string;
  deeper: string;
}

export class OpticsLab implements LabModule {
  public readonly topicId = 'optics' as const;
  public readonly group = new THREE.Group();

  private chapterId: OpticsChapterId = 'opt-snell';
  private simTime = 0;

  // Snell params
  private thetaIncDeg = 35;
  private n1 = 1.5;
  private n2 = 1.0;

  // Prism params
  private prismIncDeg = 42;
  private cauchyB = 42000;

  // Lens params
  private objectDist = 6.5;
  private focalLength = 3.2;

  // Polarization params
  private pol2Deg = 45;
  private pol3Deg = 90;
  private useMiddlePol = true;
  private polarWaveLine1: THREE.Line | null = null;
  private polarWaveLine2: THREE.Line | null = null;
  private polarWaveLine3: THREE.Line | null = null;

  private hitTargets: THREE.Object3D[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  public activate(chapterId: string): void {
    const valid: OpticsChapterId[] = ['opt-snell', 'opt-prism', 'opt-lens', 'opt-polar'];
    this.chapterId = valid.includes(chapterId as OpticsChapterId)
      ? (chapterId as OpticsChapterId)
      : 'opt-snell';
    this.rebuildScene();
  }

  public getActiveChapterId(): string {
    return this.chapterId;
  }

  public applyQuickAction(apply: Record<string, number | boolean | string>): void {
    if (typeof apply.thetaIncDeg === 'number') this.thetaIncDeg = apply.thetaIncDeg;
    if (typeof apply.n1 === 'number') this.n1 = apply.n1;
    if (typeof apply.n2 === 'number') this.n2 = apply.n2;
    if (typeof apply.prismIncDeg === 'number') this.prismIncDeg = apply.prismIncDeg;
    if (typeof apply.objectDist === 'number') this.objectDist = apply.objectDist;
    if (typeof apply.focalLength === 'number') this.focalLength = apply.focalLength;
    if (typeof apply.useMiddlePol === 'boolean') this.useMiddlePol = apply.useMiddlePol;
    if (typeof apply.pol2Deg === 'number') this.pol2Deg = apply.pol2Deg;
    if (typeof apply.pol3Deg === 'number') this.pol3Deg = apply.pol3Deg;
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
    this.polarWaveLine1 = null;
    this.polarWaveLine2 = null;
    this.polarWaveLine3 = null;
  }

  private attachStudy(obj: THREE.Object3D, meta: StudyMeta): void {
    obj.userData.study = meta;
    this.hitTargets.push(obj);
  }

  private addRay(a: THREE.Vector3, b: THREE.Vector3, color: number, opacity = 1.0): void {
    const g = this.track(new THREE.BufferGeometry().setFromPoints([a, b]));
    const l = new THREE.Line(
      g,
      this.track(new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })),
    );
    this.group.add(l);
  }

  private rebuildScene(): void {
    this.clearScene();
    this.simTime = 0;
    if (this.chapterId === 'opt-snell') this.buildSnellScene();
    else if (this.chapterId === 'opt-prism') this.buildPrismScene();
    else if (this.chapterId === 'opt-lens') this.buildLensScene();
    else this.buildPolarScene();
  }

  private buildSnellScene(): void {
    // Medium 1 (top half) & Medium 2 (bottom half)
    const topBlock = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(16, 4.5, 4.5)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        }),
      ),
    );
    topBlock.position.set(0, 2.25, 0);
    this.attachStudy(topBlock, {
      key: 'snell-med1',
      title: `Incident Medium (n₁ = ${this.n1.toFixed(2)})`,
      badge: 'UPPER MEDIUM',
      accent: '#38bdf8',
      simple: 'Light slows down inside higher-index glass or water (v = c / n).',
      deeper: 'Boundary wavefront phase matching forces n₁ sin θ₁ = n₂ sin θ₂.',
    });

    const botBlock = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(16, 4.5, 4.5)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
        }),
      ),
    );
    botBlock.position.set(0, -2.25, 0);
    this.attachStudy(botBlock, {
      key: 'snell-med2',
      title: `Lower Medium (n₂ = ${this.n2.toFixed(2)})`,
      badge: 'REFRACTIVE TARGET',
      accent: '#ec4899',
      simple: 'If n₁ > n₂ and you tilt past the critical angle, NO light crosses—100% bounces back (Total Internal Reflection)!',
      deeper: 'Fiber-optic cables guide laser pulses for thousands of kilometers using Total Internal Reflection.',
    });
    this.group.add(topBlock, botBlock);

    // Normal dashed guide line
    this.addRay(new THREE.Vector3(0, -4.5, 0), new THREE.Vector3(0, 4.5, 0), 0x64748b, 0.55);

    const incRad = (this.thetaIncDeg * Math.PI) / 180;
    const len = 5.4;
    const src = new THREE.Vector3(-len * Math.sin(incRad), len * Math.cos(incRad), 0);
    const hit = new THREE.Vector3(0, 0, 0);
    const refl = new THREE.Vector3(len * Math.sin(incRad), len * Math.cos(incRad), 0);

    this.addRay(src, hit, 0xfbbf24, 1.0);
    const res = computeSnellRefraction(incRad, this.n1, this.n2);
    this.addRay(hit, refl, 0x00f0ff, Math.max(0.25, res.reflectance));

    if (!res.isTIR && res.thetaTransRad !== null) {
      const tr = res.thetaTransRad;
      const transEnd = new THREE.Vector3(len * Math.sin(tr), -len * Math.cos(tr), 0);
      this.addRay(hit, transEnd, 0xec4899, 1.0 - res.reflectance * 0.45);
    }
  }

  private buildPrismScene(): void {
    // Equilateral triangular prism along Z
    const shape = new THREE.Shape();
    const r = 2.6;
    shape.moveTo(0, r);
    shape.lineTo(-r * Math.cos(Math.PI / 6), -r * Math.sin(Math.PI / 6));
    shape.lineTo(r * Math.cos(Math.PI / 6), -r * Math.sin(Math.PI / 6));
    shape.closePath();

    const prismG = this.track(
      new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false }),
    );
    prismG.translate(0, 0, -1.6);
    const prism = new THREE.Mesh(
      prismG,
      this.track(
        new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.28,
          roughness: 0.1,
          transmission: 0.4,
          depthWrite: false,
        }),
      ),
    );
    this.attachStudy(prism, {
      key: 'dispersion-prism',
      title: 'Optical Glass Dispersion Prism',
      badge: 'CAUCHY DISPERSION',
      accent: '#ec4899',
      simple: 'Glass bends short-wavelength violet rays sharper than long-wavelength red rays—fanning white sunlight into a rainbow!',
      deeper: 'Cauchy equation n(λ) = A + B/λ² creates continuous angular separation across 410–680 nm.',
    });
    this.group.add(prism);

    const incRad = (this.prismIncDeg * Math.PI) / 180;
    const entry = new THREE.Vector3(-1.1, 0.2, 0);
    const beamIn = new THREE.Vector3(
      entry.x - 6.5 * Math.cos(incRad * 0.5),
      entry.y - 6.5 * Math.sin(incRad * 0.5) * 0.5,
      0,
    );
    this.addRay(beamIn, entry, 0xf8fafc, 1.0);

    const spectrum: Array<{ wl: number; color: number }> = [
      { wl: 670, color: 0xef4444 },
      { wl: 610, color: 0xf97316 },
      { wl: 575, color: 0xfacc15 },
      { wl: 530, color: 0x22c55e },
      { wl: 490, color: 0x06b6d4 },
      { wl: 455, color: 0x3b82f6 },
      { wl: 415, color: 0xa855f7 },
    ];

    for (const band of spectrum) {
      const nVal = cauchyIndex(band.wl, 1.504, this.cauchyB);
      const dev = (nVal - 1.45) * 2.2 + (this.prismIncDeg - 30) * 0.012;
      const mid = new THREE.Vector3(1.1, 0.2 - dev * 0.6, 0);
      const exitEnd = new THREE.Vector3(8.5, mid.y - Math.tan(dev * 1.1) * 7.4, 0);
      this.addRay(entry, mid, band.color, 0.85);
      this.addRay(mid, exitEnd, band.color, 0.95);
    }
  }

  private buildLensScene(): void {
    // Optical axis
    this.addRay(new THREE.Vector3(-11, 0, 0), new THREE.Vector3(11, 0, 0), 0x475569, 0.6);

    // Thin lens at x = 0
    const lensMesh = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(3.2, 3.2, 0.25, 32)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      ),
    );
    lensMesh.rotation.z = Math.PI * 0.5;
    this.attachStudy(lensMesh, {
      key: 'thin-lens',
      title: `Thin Lens (f = ${this.focalLength.toFixed(1)} m)`,
      badge: 'IMAGE FORMATION',
      accent: '#38bdf8',
      simple: 'Follow the 3 golden rays: parallel through F, straight through center, and through near F—their crossing forms the image!',
      deeper: 'Thin lens equation 1/f = 1/d_o + 1/d_i predicts real inverted images (d_o > f) and virtual upright magnifiers (d_o < f).',
    });
    this.group.add(lensMesh);

    // Focal markers (-f, +f)
    const fDotG = this.track(new THREE.SphereGeometry(0.18, 12, 12));
    const fMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    for (const fx of [-this.focalLength, this.focalLength]) {
      const m = new THREE.Mesh(fDotG, fMat);
      m.position.set(fx, 0, 0);
      this.group.add(m);
    }

    // Object arrow at x = -d_o, height = 2.0
    const hObj = 2.0;
    const xObj = -this.objectDist;
    this.addRay(new THREE.Vector3(xObj, 0, 0), new THREE.Vector3(xObj, hObj, 0), 0x00f0ff, 1.0);

    const sol = solveThinLens(this.objectDist, this.focalLength);
    const xImg = Math.max(-10.5, Math.min(10.5, sol.imageDist));
    const hImg = Math.max(-5.5, Math.min(5.5, hObj * sol.magnification));

    // Image arrow
    this.addRay(
      new THREE.Vector3(xImg, 0, 0),
      new THREE.Vector3(xImg, hImg, 0),
      sol.isReal ? 0x10b981 : 0xec4899,
      sol.isReal ? 1.0 : 0.7,
    );

    // 3 Principal Rays from object tip
    const tip = new THREE.Vector3(xObj, hObj, 0);
    const hitParallel = new THREE.Vector3(0, hObj, 0);
    this.addRay(tip, hitParallel, 0xfbbf24, 0.9);
    const slope1 = -hObj / Math.max(0.2, Math.abs(this.focalLength));
    const end1X = 10.5;
    const end1Y = this.focalLength > 0 ? hObj + slope1 * end1X : hObj - slope1 * end1X;
    this.addRay(hitParallel, new THREE.Vector3(end1X, end1Y, 0), 0xfbbf24, 0.9);

    // Center ray
    const slopeC = -hObj / Math.max(0.2, this.objectDist);
    this.addRay(tip, new THREE.Vector3(10.5, slopeC * 10.5, 0), 0xf472b6, 0.9);

    // Virtual back-extensions when image is virtual
    if (!sol.isReal) {
      this.addRay(hitParallel, new THREE.Vector3(xImg, hImg, 0), 0xec4899, 0.45);
    }
  }

  private buildPolarScene(): void {
    this.addRay(new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0), 0x475569, 0.55);

    const makePol = (x: number, deg: number, color: number, title: string): THREE.Mesh => {
      const m = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(2.6, 2.6, 0.14, 32)),
        this.track(
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
          }),
        ),
      );
      m.rotation.z = Math.PI * 0.5;
      m.position.set(x, 0, 0);
      const rad = (deg * Math.PI) / 180;
      const bar = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.18, 4.8, 0.16)),
        this.track(new THREE.MeshBasicMaterial({ color })),
      );
      bar.rotation.x = rad;
      m.add(bar);
      this.attachStudy(m, {
        key: `pol-${x}`,
        title,
        badge: `${deg}° AXIS`,
        accent: '#ec4899',
        simple: 'Only the light component vibrating parallel to this slit can pass—scaling intensity by cos²θ!',
        deeper: 'Malus Law: I = I₀ cos²(Δθ). Slipping a 45° middle filter between crossed 0°/90° filters restores light!',
      });
      this.group.add(m);
      return m;
    };

    makePol(-5, 0, 0x00f0ff, 'Polarizer P1 (Vertical 0°)');
    if (this.useMiddlePol) {
      makePol(0, this.pol2Deg, 0xfbbf24, 'Middle Polarizer P2');
    }
    makePol(5, this.pol3Deg, 0xec4899, 'Analyzer P3');

    const makeWave = (color: number): THREE.Line => {
      const g = this.track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
      const l = new THREE.Line(g, this.track(new THREE.LineBasicMaterial({ color })));
      this.group.add(l);
      return l;
    };
    this.polarWaveLine1 = makeWave(0x00f0ff);
    this.polarWaveLine2 = makeWave(0xfbbf24);
    this.polarWaveLine3 = makeWave(0xec4899);
    this.updatePolarWaves();
  }

  private updatePolarWaves(): void {
    const res = evaluateMalusStack(0, this.pol2Deg, this.pol3Deg, this.useMiddlePol);
    const writeSeg = (
      line: THREE.Line | null,
      xStart: number,
      xEnd: number,
      angDeg: number,
      amp: number,
    ) => {
      if (!line) return;
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const rad = (angDeg * Math.PI) / 180;
      const cy = Math.cos(rad);
      const cz = Math.sin(rad);
      for (let i = 0; i < 40; i++) {
        const x = xStart + (i / 39) * (xEnd - xStart);
        const s = amp * Math.sin(1.4 * x - 4.5 * this.simTime);
        attr.setXYZ(i, x, s * cy, s * cz);
      }
      attr.needsUpdate = true;
    };

    writeSeg(this.polarWaveLine1, -9.5, -5.0, 0, 2.0);
    writeSeg(
      this.polarWaveLine2,
      -5.0,
      5.0,
      this.useMiddlePol ? this.pol2Deg : 0,
      2.0 * Math.sqrt(this.useMiddlePol ? res.i2 * 2 : 1),
    );
    writeSeg(this.polarWaveLine3, 5.0, 9.5, this.pol3Deg, 2.0 * Math.sqrt(res.i3 * 2));
  }

  public update(dt: number): void {
    this.simTime += dt;
    if (this.chapterId === 'opt-polar') {
      this.updatePolarWaves();
    }
  }

  public getControlSchema(): LabControlSchema {
    if (this.chapterId === 'opt-snell') {
      return {
        sliders: [
          {
            key: 'thetaIncDeg',
            label: 'Incident Angle θ₁',
            min: 0,
            max: 85,
            step: 1,
            value: this.thetaIncDeg,
            unit: '°',
            noteTitle: 'Angle from Normal',
            noteText: 'Sweep past critical angle θ_c when n₁ > n₂ to trigger Total Internal Reflection!',
          },
          {
            key: 'n1',
            label: 'Upper Index n₁',
            min: 1.0,
            max: 2.4,
            step: 0.05,
            value: this.n1,
            unit: '',
            noteTitle: 'Incident Medium Index',
            noteText: 'Air = 1.0, Water = 1.33, Glass = 1.5, Diamond = 2.4.',
          },
          {
            key: 'n2',
            label: 'Lower Index n₂',
            min: 1.0,
            max: 2.4,
            step: 0.05,
            value: this.n2,
            unit: '',
            noteTitle: 'Target Medium Index',
            noteText: 'Light bends toward the normal when entering higher n₂.',
          },
        ],
        toggles: [],
        actions: [],
      };
    }

    if (this.chapterId === 'opt-prism') {
      return {
        sliders: [
          {
            key: 'prismIncDeg',
            label: 'Beam Entry Angle',
            min: 20,
            max: 70,
            step: 1,
            value: this.prismIncDeg,
            unit: '°',
            noteTitle: 'Prism Incidence',
            noteText: 'Adjusts how steeply white light enters the triangular prism.',
          },
          {
            key: 'cauchyB',
            label: 'Glass Dispersion (B)',
            min: 10000,
            max: 95000,
            step: 5000,
            value: this.cauchyB,
            unit: '',
            noteTitle: 'Cauchy B Coefficient',
            noteText: 'Higher dispersion fans the red-to-violet rainbow wider!',
          },
        ],
        toggles: [],
        actions: [],
      };
    }

    if (this.chapterId === 'opt-lens') {
      return {
        sliders: [
          {
            key: 'objectDist',
            label: 'Object Distance d_o',
            min: 1.2,
            max: 9.5,
            step: 0.2,
            value: this.objectDist,
            unit: 'm',
            noteTitle: 'Object Position',
            noteText: 'Move inside focal length (d_o < f) to switch from a real image to a virtual magnifier!',
          },
          {
            key: 'focalLength',
            label: 'Focal Length f',
            min: 1.5,
            max: 5.5,
            step: 0.1,
            value: this.focalLength,
            unit: 'm',
            noteTitle: 'Lens Strength',
            noteText: 'Shorter f bends light rays more sharply.',
          },
        ],
        toggles: [],
        actions: [],
      };
    }

    return {
      sliders: [
        {
          key: 'pol2Deg',
          label: 'Middle Filter Angle',
          min: 0,
          max: 90,
          step: 5,
          value: this.pol2Deg,
          unit: '°',
          noteTitle: 'Intermediate Polarizer',
          noteText: 'At 45°, lets 25% of P1 light rotate so 12.5% passes crossed P3!',
        },
        {
          key: 'pol3Deg',
          label: 'Analyzer Angle',
          min: 0,
          max: 90,
          step: 5,
          value: this.pol3Deg,
          unit: '°',
          noteTitle: 'Final Polarizer',
          noteText: '90° blocks all vertical light unless middle filter rotates the wave.',
        },
      ],
      toggles: [
        {
          key: 'useMiddlePol',
          label: 'Insert Middle 45° Filter',
          checked: this.useMiddlePol,
          swatchColor: '#fbbf24',
          noteTitle: '3-Polarizer Paradox',
          noteText: 'Adding a filter can INCREASE light passing through crossed polarizers!',
        },
      ],
      actions: [],
    };
  }

  public setParam(key: string, value: number | boolean): void {
    if (key === 'thetaIncDeg' && typeof value === 'number') this.thetaIncDeg = value;
    else if (key === 'n1' && typeof value === 'number') this.n1 = value;
    else if (key === 'n2' && typeof value === 'number') this.n2 = value;
    else if (key === 'prismIncDeg' && typeof value === 'number') this.prismIncDeg = value;
    else if (key === 'cauchyB' && typeof value === 'number') this.cauchyB = value;
    else if (key === 'objectDist' && typeof value === 'number') this.objectDist = value;
    else if (key === 'focalLength' && typeof value === 'number') this.focalLength = value;
    else if (key === 'pol2Deg' && typeof value === 'number') this.pol2Deg = value;
    else if (key === 'pol3Deg' && typeof value === 'number') this.pol3Deg = value;
    else if (key === 'useMiddlePol' && typeof value === 'boolean') this.useMiddlePol = value;
    this.rebuildScene();
  }

  public runAction(): void {
    // Controlled via sliders/toggles & quick actions
  }

  public getTelemetry(): LabTelemetryCard[] {
    if (this.chapterId === 'opt-snell') {
      const res = computeSnellRefraction((this.thetaIncDeg * Math.PI) / 180, this.n1, this.n2);
      const tDeg = res.thetaTransRad !== null ? `${((res.thetaTransRad * 180) / Math.PI).toFixed(1)}°` : 'TIR (100%)';
      const cDeg = res.criticalAngleRad !== null ? `${((res.criticalAngleRad * 180) / Math.PI).toFixed(1)}°` : 'None (n₁ ≤ n₂)';
      return [
        { labelSimple: 'Refracted θ₂', labelPhysics: 'Transmitted θ₂', value: tDeg, noteTitle: "Snell's Angle", noteText: 'Turns Total Internal Reflection above critical angle.' },
        { labelSimple: 'Critical Angle θ_c', labelPhysics: 'arcsin(n₂/n₁)', value: cDeg, noteTitle: 'TIR Threshold', noteText: 'Exists only when traveling from higher index into lower index.' },
        { labelSimple: 'Reflected Power', labelPhysics: 'Fresnel R', value: `${(res.reflectance * 100).toFixed(1)}%`, noteTitle: 'Fresnel Reflectance', noteText: '100% once incident angle exceeds critical angle.' },
        { labelSimple: 'Indices Ratio', labelPhysics: 'n₁ / n₂', value: (this.n1 / this.n2).toFixed(2), noteTitle: 'Relative Index', noteText: 'Controls ray bending strength.' },
      ];
    }

    if (this.chapterId === 'opt-prism') {
      const nBlue = cauchyIndex(415, 1.504, this.cauchyB);
      const nRed = cauchyIndex(670, 1.504, this.cauchyB);
      return [
        { labelSimple: 'Violet Index (415nm)', labelPhysics: 'n(violet)', value: nBlue.toFixed(4), noteTitle: 'Short Wavelength', noteText: 'Bends sharpest inside glass.' },
        { labelSimple: 'Red Index (670nm)', labelPhysics: 'n(red)', value: nRed.toFixed(4), noteTitle: 'Long Wavelength', noteText: 'Bends least inside glass.' },
        { labelSimple: 'Spread Δn', labelPhysics: 'Dispersion Δn', value: (nBlue - nRed).toFixed(4), noteTitle: 'Spectral Fan', noteText: 'Angular separation between rainbow edges.' },
        { labelSimple: 'Entry Angle', labelPhysics: 'Incident θ', value: `${this.prismIncDeg}°`, noteTitle: 'Beam Tilt', noteText: 'Angle hitting first prism face.' },
      ];
    }

    if (this.chapterId === 'opt-lens') {
      const sol = solveThinLens(this.objectDist, this.focalLength);
      return [
        { labelSimple: 'Image Distance d_i', labelPhysics: 'd_i = d_o f/(d_o−f)', value: `${sol.imageDist.toFixed(2)} m`, noteTitle: 'Image Location', noteText: 'Positive = real image on right; negative = virtual image on left.' },
        { labelSimple: 'Magnification M', labelPhysics: 'M = −d_i / d_o', value: `${sol.magnification.toFixed(2)}×`, noteTitle: 'Scale & Flip', noteText: 'Negative means inverted; positive means upright magnifier.' },
        { labelSimple: 'Image Type', labelPhysics: 'Nature', value: sol.isReal ? 'Real (Inverted)' : 'Virtual (Upright)', noteTitle: 'Optical Regime', noteText: 'Switches right at d_o = f!' },
        { labelSimple: 'Focal Power', labelPhysics: '1/f', value: `${(1 / this.focalLength).toFixed(2)} D`, noteTitle: 'Diopters', noteText: 'Reciprocal focal length.' },
      ];
    }

    const mal = evaluateMalusStack(0, this.pol2Deg, this.pol3Deg, this.useMiddlePol);
    return [
      { labelSimple: 'Output Brightness', labelPhysics: 'Final I / I₀', value: `${(mal.i3 * 100).toFixed(1)}%`, noteTitle: 'Transmitted Fraction', noteText: 'Reaches 12.5% at 0°→45°→90°, drops to 0% without middle filter!' },
      { labelSimple: 'After Filter 1', labelPhysics: 'I₁ / I₀', value: '50.0%', noteTitle: 'Unpolarized Cut', noteText: 'First ideal polarizer always transmits 50%.' },
      { labelSimple: 'After Filter 2', labelPhysics: 'I₂ / I₀', value: `${(mal.i2 * 100).toFixed(1)}%`, noteTitle: 'Middle Projection', noteText: 'Rotates polarization axis to θ₂.' },
      { labelSimple: 'Middle Filter', labelPhysics: '3-Filter Mode', value: this.useMiddlePol ? `ON (${this.pol2Deg}°)` : 'Bypassed', noteTitle: 'Paradox Switch', noteText: 'Toggle to test adding vs removing the center filter.' },
    ];
  }

  public getFormula(): LabFormula {
    if (this.chapterId === 'opt-snell') {
      return {
        captionSimple: 'Light bends toward slower media—or reflects 100% if it hits shallow enough from inside!',
        captionPhysics: "Snell's Law & Critical Angle",
        tex: String.raw`n_1 \sin\theta_1 = n_2 \sin\theta_2, \quad \sin\theta_c = \frac{n_2}{n_1}`,
      };
    }
    if (this.chapterId === 'opt-prism') {
      return {
        captionSimple: 'Glass slows violet light slightly more than red, splitting white beams into a spectrum.',
        captionPhysics: 'Cauchy Dispersion Equation',
        tex: String.raw`n(\lambda) = A + \frac{B}{\lambda^2}`,
      };
    }
    if (this.chapterId === 'opt-lens') {
      return {
        captionSimple: 'Object distance vs focal length sets whether rays cross into a real photo or diverge like a magnifying glass.',
        captionPhysics: 'Gaussian Thin Lens Equation',
        tex: String.raw`\frac{1}{f} = \frac{1}{d_o} + \frac{1}{d_i}, \quad M = -\frac{d_i}{d_o}`,
      };
    }
    return {
      captionSimple: 'Polarizers project light along their slit axis—so a 45° middle filter rescues light blocked by crossed 0°/90° filters!',
      captionPhysics: "Malus's Law of Polarization",
      tex: String.raw`I = I_0 \cos^2(\Delta\theta)`,
    };
  }

  public getOscilloscopeSample(): LabOscilloscopeSample {
    if (this.chapterId === 'opt-snell') {
      const r = computeSnellRefraction((this.thetaIncDeg * Math.PI) / 180, this.n1, this.n2);
      return {
        ch1: r.reflectance * 100,
        ch2: (1 - r.reflectance) * 100,
        ch3: this.thetaIncDeg,
        labels: ['R%', 'T%', 'θ₁'],
        units: ['%', '%', '°'],
      };
    }
    if (this.chapterId === 'opt-polar') {
      const m = evaluateMalusStack(0, this.pol2Deg, this.pol3Deg, this.useMiddlePol);
      return {
        ch1: m.i1 * 100,
        ch2: m.i2 * 100,
        ch3: m.i3 * 100,
        labels: ['I₁', 'I₂', 'I₃'],
        units: ['%', '%', '%'],
      };
    }
    const sol = solveThinLens(this.objectDist, this.focalLength);
    return {
      ch1: this.objectDist,
      ch2: Math.max(-15, Math.min(15, sol.imageDist)),
      ch3: Math.max(-5, Math.min(5, sol.magnification)),
      labels: ['d_o', 'd_i', 'M'],
      units: ['m', 'm', '×'],
    };
  }

  public getStatusZonePill(): { label: string; color: string } {
    const names: Record<OpticsChapterId, string> = {
      'opt-snell': "Vol VI · Snell's Law & TIR",
      'opt-prism': 'Vol VI · Dispersion Prism',
      'opt-lens': 'Vol VI · Thin Lens Optics',
      'opt-polar': "Vol VI · Malus's Law",
    };
    return { label: names[this.chapterId], color: '#ec4899' };
  }

  public getHitTargets(): THREE.Object3D[] {
    return this.hitTargets;
  }

  public inspectHit(hitObj: THREE.Object3D): LabHoverData | null {
    let cur: THREE.Object3D | null = hitObj;
    while (cur) {
      if (cur.userData?.study) {
        return { ...(cur.userData.study as StudyMeta), metrics: [] };
      }
      cur = cur.parent;
    }
    return null;
  }

  public getCallouts(): LabCalloutPoint[] {
    return [];
  }

  public getRecommendedCamera(): { position: [number, number, number]; target: [number, number, number] } {
    return { position: [0, 3.5, 16.5], target: [0, 0, 0] };
  }

  public dispose(): void {
    this.clearScene();
  }
}
