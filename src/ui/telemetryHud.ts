import katex from 'katex';
import { SCENE_STUDY_NOTES } from '../data/projectBook';
import type { LabFormula, LabTelemetryCard } from '../labs/labModule';
import type { SegmentKind, TelemetrySnapshot } from '../types/simulation';

interface FormulaEntry {
  caption: string;
  tex: string;
}

const ZONE_FORMULAS: Record<SegmentKind, FormulaEntry> = {
  battery: {
    caption: 'Non-Electrostatic EMF Lifting Carrier Up Potential Hill',
    tex: String.raw`\mathbf{F}_{\text{net}} = -e\mathbf{E}_{\text{int}} + \mathbf{F}_{\text{chem}}, \quad \mathcal{E} = \oint \frac{\mathbf{F}_{\text{chem}}}{-e}\cdot d\mathbf{l}`,
  },
  wire: {
    caption: 'Drude-Sommerfeld Drift Driven by Surface Charge Gradient',
    tex: String.raw`\mathbf{E} = \frac{I\rho}{A}\hat{\mathbf{J}}, \quad \mathbf{v}_d = -\frac{e\tau}{m_e^*}\mathbf{E}, \quad I = n A e v_d`,
  },
  resistor: {
    caption: 'High-Scattering Constricted Zone & Joule Dissipation',
    tex: String.raw`P = \mathbf{J}\cdot\mathbf{E} = I^2 R, \quad \Delta K \rightarrow \text{Lattice Phonons}`,
  },
  resistor2: {
    caption: 'Series Divider R₂ Voltage Drop & Continuity',
    tex: String.raw`V_{R_2} = \frac{R_2}{R_1 + R_2 + r_{\text{int}}}V_{\text{src}}, \quad v_d \propto \frac{1}{A}`,
  },
  capacitor: {
    caption: 'Dielectric Barrier & Maxwell Displacement Current',
    tex: String.raw`\mathbf{J}_D = \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}, \quad I(t) = C\frac{dV_C}{dt}`,
  },
  inductor: {
    caption: 'Magnetic Flux Linkage & Faraday Back-EMF Inertia',
    tex: String.raw`\mathbf{E}_{\text{ind}} = -\frac{\partial \mathbf{A}}{\partial t}, \quad \mathcal{E}_{\text{back}} = -L\frac{dI}{dt}`,
  },
};

function formatSci(val: number, unit: string): string {
  const abs = Math.abs(val);
  if (abs === 0) return `0.00 ${unit}`;
  if (abs >= 0.01 && abs < 1000) {
    return `${val.toFixed(3)} ${unit}`;
  }
  const exp = Math.floor(Math.log10(abs));
  const mant = val / Math.pow(10, exp);
  return `${mant.toFixed(2)}×10^${exp} ${unit}`;
}

function formatTimeSI(sec: number): string {
  if (sec <= 0) return '—';
  if (sec >= 1e-12) return `${(sec * 1e12).toFixed(2)} ps`;
  if (sec >= 1e-15) return `${(sec * 1e15).toFixed(1)} fs`;
  return `${(sec * 1e18).toFixed(2)} as`;
}

export class TelemetryHUD {
  private readonly zonePill = document.getElementById('zone-pill') as HTMLElement;
  private readonly zonePillText = document.getElementById('zone-pill-text') as HTMLElement;
  private readonly zoneDot = document.querySelector('#zone-pill .zone-dot') as HTMLElement;

  private readonly circuitGrid = document.getElementById('circuit-telemetry-grid') as HTMLElement;
  private readonly labGrid = document.getElementById('lab-telemetry-grid') as HTMLElement;
  private readonly minimapSection = document.getElementById('minimap-section') as HTMLElement;
  private readonly oscLegend = document.getElementById('osc-legend') as HTMLElement;

  private readonly telE = document.getElementById('tel-e') as HTMLElement;
  private readonly telI = document.getElementById('tel-i') as HTMLElement;
  private readonly telVInst = document.getElementById('tel-vinst') as HTMLElement;
  private readonly telVDrift = document.getElementById('tel-vdrift') as HTMLElement;
  private readonly telV = document.getElementById('tel-v') as HTMLElement;
  private readonly telU = document.getElementById('tel-u') as HTMLElement;
  private readonly telTau = document.getElementById('tel-tau') as HTMLElement;
  private readonly telColl = document.getElementById('tel-coll') as HTMLElement;
  private readonly telP = document.getElementById('tel-p') as HTMLElement;
  private readonly telRatio = document.getElementById('tel-ratio') as HTMLElement;

  private readonly lblE = document.getElementById('lbl-e') as HTMLElement;
  private readonly lblI = document.getElementById('lbl-i') as HTMLElement;
  private readonly lblVInst = document.getElementById('lbl-vinst') as HTMLElement;
  private readonly lblVDrift = document.getElementById('lbl-vdrift') as HTMLElement;
  private readonly lblV = document.getElementById('lbl-v') as HTMLElement;
  private readonly lblU = document.getElementById('lbl-u') as HTMLElement;
  private readonly lblTau = document.getElementById('lbl-tau') as HTMLElement;
  private readonly lblColl = document.getElementById('lbl-coll') as HTMLElement;
  private readonly lblP = document.getElementById('lbl-p') as HTMLElement;
  private readonly lblRatio = document.getElementById('lbl-ratio') as HTMLElement;

  private readonly katexCard = document.getElementById('katex-card') as HTMLElement;
  private readonly barrierBanner = document.getElementById('barrier-banner') as HTMLElement;

  private lastUpdateMs = 0;
  private lastFormulaZone: SegmentKind | null = null;
  private lastLabFormulaTex = '';
  private simpleMode = true;
  private readonly renderedTex = new Map<SegmentKind, string>();

  constructor() {
    for (const [zone, entry] of Object.entries(ZONE_FORMULAS) as Array<[SegmentKind, FormulaEntry]>) {
      const html = katex.renderToString(entry.tex, {
        throwOnError: false,
        displayMode: false,
      });
      this.renderedTex.set(zone, html);
    }
    this.applyLabels();
  }

  public setTopicMode(isCircuits: boolean): void {
    this.circuitGrid.classList.toggle('hidden', !isCircuits);
    this.labGrid.classList.toggle('hidden', isCircuits);
    this.minimapSection.classList.toggle('hidden', !isCircuits);
    this.lastFormulaZone = null;
    this.lastLabFormulaTex = '';
    if (isCircuits) {
      this.zoneDot.style.background = '';
      this.zoneDot.style.boxShadow = '';
      this.setOscLegend(['V', 'I', 'U']);
    } else {
      this.barrierBanner.classList.add('hidden');
    }
  }

  public setOscLegend(labels: [string, string, string]): void {
    this.oscLegend.innerHTML = `
      <i class="leg-v">${labels[0]}</i>
      <i class="leg-i">${labels[1]}</i>
      <i class="leg-u">${labels[2]}</i>
    `;
  }

  public setSimpleMode(simple: boolean): void {
    this.simpleMode = simple;
    this.applyLabels();
    if (this.lastFormulaZone) {
      this.renderZoneCard(this.lastFormulaZone);
    }
    this.lastLabFormulaTex = '';
  }

  private applyLabels(): void {
    if (this.simpleMode) {
      this.lblE.textContent = 'Electric Push (E)';
      this.lblI.textContent = 'Loop Current (I)';
      this.lblVInst.textContent = 'Zip Speed (v_inst)';
      this.lblVDrift.textContent = 'Forward March (v_d)';
      this.lblV.textContent = 'Local Voltage (V)';
      this.lblU.textContent = 'Electron Energy (U)';
      this.lblTau.textContent = 'Avg Free Flight (τ)';
      this.lblColl.textContent = 'Atomic Bounces';
      this.lblP.textContent = 'Heat Power (P)';
      this.lblRatio.textContent = 'Zip / Drift Ratio';
    } else {
      this.lblE.textContent = 'Local E-Field';
      this.lblI.textContent = 'Loop Current I';
      this.lblVInst.innerHTML = 'Inst. Speed v<sub>inst</sub>';
      this.lblVDrift.innerHTML = 'Drift Speed v<sub>d</sub>';
      this.lblV.textContent = 'Local Potential V';
      this.lblU.textContent = 'Energy U = -eV';
      this.lblTau.textContent = 'Mean Free Time τ';
      this.lblColl.textContent = 'Collisions';
      this.lblP.textContent = 'Power P = I²R';
      this.lblRatio.textContent = 'Fermi / Drift Ratio';
    }
  }

  private renderZoneCard(zone: SegmentKind): void {
    const entry = ZONE_FORMULAS[zone];
    const study = SCENE_STUDY_NOTES[zone];
    const formulaHtml = this.renderedTex.get(zone) ?? '';
    if (this.simpleMode) {
      this.katexCard.innerHTML = `
        <div class="zone-simple-note">${study.simple}</div>
        <div class="katex-formula compact">${formulaHtml}</div>
      `;
    } else {
      this.katexCard.innerHTML = `
        <div class="katex-caption">${entry.caption}</div>
        <div class="katex-formula">${formulaHtml}</div>
      `;
    }
  }

  public update(telemetry: TelemetrySnapshot, nowMs: number, force = false): void {
    if (!force && nowMs - this.lastUpdateMs < 65) return;
    this.lastUpdateMs = nowMs;

    this.zonePill.className = `zone-pill zone-${telemetry.zone}`;
    this.zonePillText.textContent = telemetry.zoneLabel;

    this.telE.textContent = formatSci(Math.abs(telemetry.localE), 'V/m');
    this.telI.textContent = `${telemetry.current.toFixed(3)} A`;
    this.telVInst.textContent = formatSci(telemetry.vInst, 'm/s');
    this.telVDrift.textContent = formatSci(telemetry.vDrift, 'm/s');
    this.telV.textContent = `${telemetry.localV.toFixed(3)} V`;
    this.telU.textContent = `${telemetry.localU_eV.toFixed(3)} eV`;
    this.telTau.textContent = formatTimeSI(telemetry.meanFreeTime);
    this.telColl.textContent = telemetry.collisions.toLocaleString();
    this.telP.textContent = `${telemetry.totalPower.toFixed(3)} W`;

    if (telemetry.scaleRatioDisplay < 100) {
      this.telRatio.textContent = `${telemetry.scaleRatioDisplay.toFixed(1)} : 1`;
    } else {
      const exp = Math.floor(Math.log10(telemetry.scaleRatioDisplay));
      const mant = telemetry.scaleRatioDisplay / Math.pow(10, exp);
      this.telRatio.textContent = `${mant.toFixed(1)}×10^${exp} : 1`;
    }

    if (this.lastFormulaZone !== telemetry.zone) {
      this.lastFormulaZone = telemetry.zone;
      this.renderZoneCard(telemetry.zone);
    }

    if (telemetry.handoffMessage) {
      this.barrierBanner.textContent = telemetry.handoffMessage;
      this.barrierBanner.classList.remove('hidden');
    } else if (telemetry.atCapacitorBarrier) {
      this.barrierBanner.textContent =
        'Insulating Dielectric Barrier Reached — Electron cannot cross gap; E-field flux transfers energy via J_D = ε ∂E/∂t.';
      this.barrierBanner.classList.remove('hidden');
    } else {
      this.barrierBanner.classList.add('hidden');
    }
  }

  public updateLab(
    cards: LabTelemetryCard[],
    formula: LabFormula,
    zonePill: { label: string; color: string },
    nowMs: number,
    force = false,
  ): void {
    if (!force && nowMs - this.lastUpdateMs < 75) return;
    this.lastUpdateMs = nowMs;

    this.zonePill.className = 'zone-pill';
    this.zonePillText.textContent = zonePill.label;
    this.zoneDot.style.background = zonePill.color;
    this.zoneDot.style.boxShadow = `0 0 8px ${zonePill.color}`;

    this.labGrid.innerHTML = cards
      .map(
        (c) => `
      <div class="stat-card" data-dyn-title="${c.noteTitle}" data-dyn-text="${c.noteText}">
        <div class="stat-label">${this.simpleMode ? c.labelSimple : c.labelPhysics}</div>
        <div class="stat-value">${c.value}</div>
      </div>`,
      )
      .join('');

    const formulaKey = `${formula.tex}:${this.simpleMode ? 1 : 0}`;
    if (this.lastLabFormulaTex !== formulaKey) {
      this.lastLabFormulaTex = formulaKey;
      const html = katex.renderToString(formula.tex, {
        throwOnError: false,
        displayMode: false,
      });
      if (this.simpleMode) {
        this.katexCard.innerHTML = `
          <div class="zone-simple-note">${formula.captionSimple}</div>
          <div class="katex-formula compact">${html}</div>
        `;
      } else {
        this.katexCard.innerHTML = `
          <div class="katex-caption">${formula.captionPhysics}</div>
          <div class="katex-formula">${html}</div>
        `;
      }
    }
  }
}
