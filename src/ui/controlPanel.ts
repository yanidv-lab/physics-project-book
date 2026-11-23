import type { CameraMode, SimParams, SourceMode, TopologyId } from '../types/simulation';

export type LeftTabId = 'book' | 'controls' | 'marks';
export type MobileSheetMode = 'none' | 'book' | 'controls' | 'stats' | 'marks';

export interface ControlCallbacks {
  onTopologyChange: (topology: TopologyId) => void;
  onCameraChange: (mode: CameraMode) => void;
  onLabResetView: () => void;
  onReset: () => void;
  onCapHandoff: () => void;
  onParamsChange: () => void;
  onMarkModeToggle: (enabled: boolean) => void;
  onSimpleModeToggle: (simple: boolean) => void;
  onLabelsToggle: (visible: boolean) => void;
  onOpenBookCover: () => void;
  onOpenPhoneModal: () => void;
}

function logSliderToResistance(t: number): number {
  const val = Math.pow(10, Math.max(0, Math.min(1, t)) * 3);
  return Math.round(val * 10) / 10;
}

function resistanceToLogSlider(r: number): number {
  return Math.max(0, Math.min(1, Math.log10(Math.max(1, r)) / 3));
}

function logSliderToTimeDilation(t: number): number {
  return 0.01 * Math.pow(1000, Math.max(0, Math.min(1, t)));
}

function timeDilationToLogSlider(s: number): number {
  return Math.max(0, Math.min(1, Math.log(Math.max(0.01, s) / 0.01) / Math.log(1000)));
}

export class ControlPanel {
  private readonly params: SimParams;
  private readonly callbacks: ControlCallbacks;

  private readonly hudRoot = document.getElementById('hud-root') as HTMLElement;
  private readonly panelLeft = document.getElementById('panel-left') as HTMLElement;
  private readonly panelRight = document.getElementById('panel-right') as HTMLElement;
  private readonly showHudBtn = document.getElementById('show-hud-btn') as HTMLButtonElement;
  private readonly hideHudBtn = document.getElementById('hide-hud-btn') as HTMLButtonElement;
  private readonly playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
  private readonly resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

  private readonly openBookBtn = document.getElementById('open-book-btn') as HTMLButtonElement;
  private readonly openPhoneBtn = document.getElementById('open-phone-btn') as HTMLButtonElement;
  private readonly markBtn = document.getElementById('mark-mode-btn') as HTMLButtonElement;
  private readonly labelsBtn = document.getElementById('labels-btn') as HTMLButtonElement;
  private readonly simpleModeBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-readability]'),
  );
  private readonly drawerTabBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tab]'),
  );
  private readonly drawerPanes = {
    book: document.getElementById('tab-book') as HTMLElement,
    controls: document.getElementById('tab-controls') as HTMLElement,
    marks: document.getElementById('tab-marks') as HTMLElement,
  };

  private readonly circuitCameraBar = document.getElementById('circuit-camera-bar') as HTMLElement;
  private readonly labCameraBar = document.getElementById('lab-camera-bar') as HTMLElement;
  private readonly labResetViewBtn = document.getElementById('lab-reset-view-btn') as HTMLButtonElement;
  private readonly circuitControlsBox = document.getElementById('circuit-controls-box') as HTMLElement;

  private readonly mobileNavBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-mobile-sheet]'),
  );

  private readonly topologySelect = document.getElementById('topology-select') as HTMLSelectElement;
  private readonly sourceBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-source]'));
  private readonly acControls = document.getElementById('ac-controls') as HTMLElement;
  private readonly acFreqSlider = document.getElementById('ac-freq-slider') as HTMLInputElement;
  private readonly acFreqVal = document.getElementById('ac-freq-val') as HTMLElement;
  private readonly tuneF0Btn = document.getElementById('tune-f0-btn') as HTMLButtonElement;

  private readonly rcControls = document.getElementById('rc-controls') as HTMLElement;
  private readonly rcModeBtn = document.getElementById('rc-mode-btn') as HTMLButtonElement;
  private readonly capHandoffBtn = document.getElementById('cap-handoff-btn') as HTMLButtonElement;
  private readonly autoHandoffChk = document.getElementById('auto-handoff-chk') as HTMLInputElement;
  private readonly rlcInfo = document.getElementById('rlc-info') as HTMLElement;

  private readonly voltageSlider = document.getElementById('voltage-slider') as HTMLInputElement;
  private readonly voltageVal = document.getElementById('voltage-val') as HTMLElement;
  private readonly r1Slider = document.getElementById('r1-slider') as HTMLInputElement;
  private readonly r1Val = document.getElementById('r1-val') as HTMLElement;
  private readonly r2Row = document.getElementById('r2-row') as HTMLElement;
  private readonly r2Slider = document.getElementById('r2-slider') as HTMLInputElement;
  private readonly r2Val = document.getElementById('r2-val') as HTMLElement;
  private readonly tempSlider = document.getElementById('temp-slider') as HTMLInputElement;
  private readonly tempVal = document.getElementById('temp-val') as HTMLElement;
  private readonly tempChips = Array.from(document.querySelectorAll<HTMLButtonElement>('.temp-chip'));

  private readonly scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
  private readonly scaleVal = document.getElementById('scale-val') as HTMLElement;
  private readonly timeSlider = document.getElementById('time-slider') as HTMLInputElement;
  private readonly timeVal = document.getElementById('time-val') as HTMLElement;
  private readonly speedChips = Array.from(document.querySelectorAll<HTMLButtonElement>('.speed-chip'));

  private readonly camBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.cam-btn'));

  private readonly layerE = document.getElementById('layer-e') as HTMLInputElement;
  private readonly layerSigma = document.getElementById('layer-sigma') as HTMLInputElement;
  private readonly layerU = document.getElementById('layer-u') as HTMLInputElement;
  private readonly layerPhonon = document.getElementById('layer-phonon') as HTMLInputElement;
  private readonly layerB = document.getElementById('layer-b') as HTMLInputElement;

  private hudVisible = true;
  private markMode = false;
  private labelsVisible = true;
  private simpleMode = true;
  private isCircuitsTopic = true;

  constructor(params: SimParams, callbacks: ControlCallbacks) {
    this.params = params;
    this.callbacks = callbacks;
    this.bindEvents();
    this.syncUI();
  }

  private bindEvents(): void {
    this.openBookBtn.addEventListener('click', () => this.callbacks.onOpenBookCover());
    this.openPhoneBtn.addEventListener('click', () => this.callbacks.onOpenPhoneModal());
    this.labResetViewBtn.addEventListener('click', () => this.callbacks.onLabResetView());

    for (const btn of this.drawerTabBtns) {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.dataset.tab as LeftTabId);
      });
    }

    for (const btn of this.mobileNavBtns) {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mobileSheet as MobileSheetMode;
        this.setMobileSheet(mode);
      });
    }

    this.markBtn.addEventListener('click', () => {
      this.setMarkMode(!this.markMode);
    });

    this.labelsBtn.addEventListener('click', () => {
      this.labelsVisible = !this.labelsVisible;
      this.labelsBtn.classList.toggle('active', this.labelsVisible);
      this.callbacks.onLabelsToggle(this.labelsVisible);
    });

    for (const btn of this.simpleModeBtns) {
      btn.addEventListener('click', () => {
        this.simpleMode = btn.dataset.readability === 'simple';
        for (const b of this.simpleModeBtns) {
          b.classList.toggle('active', (b.dataset.readability === 'simple') === this.simpleMode);
        }
        this.callbacks.onSimpleModeToggle(this.simpleMode);
      });
    }

    this.topologySelect.addEventListener('change', () => {
      const top = this.topologySelect.value as TopologyId;
      this.params.topology = top;
      if (top === 'rc') {
        this.params.capacitance = 0.025;
      } else if (top === 'rlc') {
        this.params.capacitance = 0.004;
        this.params.inductance = 2.5;
      }
      this.syncUI();
      this.callbacks.onTopologyChange(top);
    });

    for (const btn of this.sourceBtns) {
      btn.addEventListener('click', () => {
        this.params.sourceMode = btn.dataset.source as SourceMode;
        this.syncUI();
        this.callbacks.onParamsChange();
      });
    }

    this.acFreqSlider.addEventListener('input', () => {
      this.params.acFrequency = parseFloat(this.acFreqSlider.value);
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.tuneF0Btn.addEventListener('click', () => {
      const f0 = 1 / (2 * Math.PI * Math.sqrt(this.params.inductance * this.params.capacitance));
      this.params.acFrequency = Math.round(f0 * 100) / 100;
      this.params.sourceMode = 'ac';
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.rcModeBtn.addEventListener('click', () => {
      this.params.rcDischarging = !this.params.rcDischarging;
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.capHandoffBtn.addEventListener('click', () => {
      this.callbacks.onCapHandoff();
    });

    this.autoHandoffChk.addEventListener('change', () => {
      this.params.autoCapHandoff = this.autoHandoffChk.checked;
    });

    this.voltageSlider.addEventListener('input', () => {
      this.params.voltage = parseFloat(this.voltageSlider.value);
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.r1Slider.addEventListener('input', () => {
      this.params.resistance = logSliderToResistance(parseFloat(this.r1Slider.value));
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.r2Slider.addEventListener('input', () => {
      this.params.resistance2 = logSliderToResistance(parseFloat(this.r2Slider.value));
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.tempSlider.addEventListener('input', () => {
      this.params.temperature = parseFloat(this.tempSlider.value);
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    for (const chip of this.tempChips) {
      chip.addEventListener('click', () => {
        this.params.temperature = parseFloat(chip.dataset.temp ?? '300');
        this.syncUI();
        this.callbacks.onParamsChange();
      });
    }

    this.scaleSlider.addEventListener('input', () => {
      this.params.scaleCompression = parseFloat(this.scaleSlider.value);
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    this.timeSlider.addEventListener('input', () => {
      this.params.timeDilation = logSliderToTimeDilation(parseFloat(this.timeSlider.value));
      this.syncUI();
      this.callbacks.onParamsChange();
    });

    for (const chip of this.speedChips) {
      chip.addEventListener('click', () => {
        this.params.timeDilation = parseFloat(chip.dataset.speed ?? '1');
        this.syncUI();
        this.callbacks.onParamsChange();
      });
    }

    const bindLayer = (el: HTMLInputElement, key: keyof SimParams['layers']) => {
      el.addEventListener('change', () => {
        this.params.layers[key] = el.checked;
        this.callbacks.onParamsChange();
      });
    };
    bindLayer(this.layerE, 'electricField');
    bindLayer(this.layerSigma, 'surfaceCharge');
    bindLayer(this.layerU, 'potentialLandscape');
    bindLayer(this.layerPhonon, 'phononGlow');
    bindLayer(this.layerB, 'magneticField');

    for (const btn of this.camBtns) {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.cam as CameraMode;
        this.setActiveCameraButton(mode);
        this.callbacks.onCameraChange(mode);
      });
    }

    this.playPauseBtn.addEventListener('click', () => {
      this.togglePause();
    });

    this.resetBtn.addEventListener('click', () => {
      this.callbacks.onReset();
    });

    this.hideHudBtn.addEventListener('click', () => {
      this.setHudVisible(false);
    });

    this.showHudBtn.addEventListener('click', () => {
      this.setHudVisible(true);
    });

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'INPUT' && (target as HTMLInputElement).type === 'text') return;

      if (this.isCircuitsTopic && e.key === '1') {
        this.setActiveCameraButton('locked-drift');
        this.callbacks.onCameraChange('locked-drift');
      } else if (this.isCircuitsTopic && e.key === '2') {
        this.setActiveCameraButton('raw-pov');
        this.callbacks.onCameraChange('raw-pov');
      } else if (this.isCircuitsTopic && e.key === '3') {
        this.setActiveCameraButton('side-cutaway');
        this.callbacks.onCameraChange('side-cutaway');
      } else if (this.isCircuitsTopic && e.key === '4') {
        this.setActiveCameraButton('macro-overview');
        this.callbacks.onCameraChange('macro-overview');
      } else if (e.code === 'Space') {
        if (tag !== 'BUTTON') {
          e.preventDefault();
          this.togglePause();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        this.callbacks.onReset();
      } else if (e.key === 'h' || e.key === 'H') {
        this.setHudVisible(!this.hudVisible);
      } else if (e.key === 'm' || e.key === 'M') {
        this.setMarkMode(!this.markMode);
      }
    });
  }

  public setTopicMode(isCircuits: boolean): void {
    this.isCircuitsTopic = isCircuits;
    this.circuitCameraBar.classList.toggle('hidden', !isCircuits);
    this.labCameraBar.classList.toggle('hidden', isCircuits);
    this.circuitControlsBox.classList.toggle('hidden', !isCircuits);
  }

  public setMobileSheet(mode: MobileSheetMode): void {
    for (const btn of this.mobileNavBtns) {
      btn.classList.toggle('active', btn.dataset.mobileSheet === mode);
    }

    this.panelLeft.classList.remove('mobile-sheet-open');
    this.panelRight.classList.remove('mobile-sheet-open');

    if (mode === 'book' || mode === 'controls' || mode === 'marks') {
      this.setActiveTab(mode);
      this.panelLeft.classList.add('mobile-sheet-open');
    } else if (mode === 'stats') {
      this.panelRight.classList.add('mobile-sheet-open');
    }
  }

  public setActiveTab(tab: LeftTabId): void {
    for (const btn of this.drawerTabBtns) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    this.drawerPanes.book.classList.toggle('hidden', tab !== 'book');
    this.drawerPanes.controls.classList.toggle('hidden', tab !== 'controls');
    this.drawerPanes.marks.classList.toggle('hidden', tab !== 'marks');
  }

  public setMarkMode(enabled: boolean): void {
    this.markMode = enabled;
    this.markBtn.classList.toggle('active', enabled);
    this.callbacks.onMarkModeToggle(enabled);
  }

  private togglePause(): void {
    this.params.paused = !this.params.paused;
    this.playPauseBtn.textContent = this.params.paused ? 'Resume' : 'Pause';
    this.callbacks.onParamsChange();
  }

  private setHudVisible(visible: boolean): void {
    this.hudVisible = visible;
    this.hudRoot.classList.toggle('hidden', !visible);
    this.showHudBtn.classList.toggle('hidden', visible);
  }

  public setActiveCameraButton(mode: CameraMode): void {
    for (const btn of this.camBtns) {
      btn.classList.toggle('active', btn.dataset.cam === mode);
    }
  }

  public syncUI(): void {
    this.topologySelect.value = this.params.topology;

    for (const btn of this.sourceBtns) {
      btn.classList.toggle('active', btn.dataset.source === this.params.sourceMode);
    }

    this.acControls.classList.toggle('hidden', this.params.sourceMode !== 'ac');
    this.acFreqSlider.value = String(this.params.acFrequency);
    this.acFreqVal.textContent = `${this.params.acFrequency.toFixed(2)} Hz`;
    this.tuneF0Btn.classList.toggle('hidden', this.params.topology !== 'rlc');

    const hasCap = this.params.topology === 'rc' || this.params.topology === 'rlc';
    this.rcControls.classList.toggle('hidden', !hasCap);
    this.rcModeBtn.classList.toggle('hidden', this.params.topology !== 'rc');
    this.rcModeBtn.textContent = this.params.rcDischarging ? 'Mode: Discharging' : 'Mode: Charging';
    this.rcModeBtn.classList.toggle('active', this.params.rcDischarging);
    this.autoHandoffChk.checked = this.params.autoCapHandoff;

    this.rlcInfo.classList.toggle('hidden', this.params.topology !== 'rlc');
    this.r2Row.classList.toggle('hidden', this.params.topology !== 'divider');

    this.voltageSlider.value = String(this.params.voltage);
    this.voltageVal.textContent = `${this.params.voltage.toFixed(1)} V`;

    this.r1Slider.value = String(resistanceToLogSlider(this.params.resistance));
    this.r1Val.textContent = `${this.params.resistance >= 100 ? Math.round(this.params.resistance) : this.params.resistance.toFixed(1)} Ω`;

    this.r2Slider.value = String(resistanceToLogSlider(this.params.resistance2));
    this.r2Val.textContent = `${this.params.resistance2 >= 100 ? Math.round(this.params.resistance2) : this.params.resistance2.toFixed(1)} Ω`;

    this.tempSlider.value = String(this.params.temperature);
    this.tempVal.textContent = `${Math.round(this.params.temperature)} K`;
    for (const chip of this.tempChips) {
      const t = parseFloat(chip.dataset.temp ?? '300');
      chip.classList.toggle('active', Math.abs(this.params.temperature - t) < 1);
    }

    this.scaleSlider.value = String(this.params.scaleCompression);
    const ratio = 5 * Math.pow(10, 9.6 * this.params.scaleCompression);
    if (this.params.scaleCompression < 0.05) {
      this.scaleVal.textContent = 'Pedagogical (5:1)';
    } else if (this.params.scaleCompression > 0.95) {
      this.scaleVal.textContent = 'Physical (10¹⁰:1)';
    } else {
      const exp = Math.floor(Math.log10(ratio));
      const mant = ratio / Math.pow(10, exp);
      this.scaleVal.textContent = `${mant.toFixed(1)}×10^${exp}:1`;
    }

    this.timeSlider.value = String(timeDilationToLogSlider(this.params.timeDilation));
    this.timeVal.textContent = `${this.params.timeDilation.toFixed(2)}×`;
    for (const chip of this.speedChips) {
      const s = parseFloat(chip.dataset.speed ?? '1');
      chip.classList.toggle('active', Math.abs(this.params.timeDilation - s) < 0.005);
    }

    this.layerE.checked = this.params.layers.electricField;
    this.layerSigma.checked = this.params.layers.surfaceCharge;
    this.layerU.checked = this.params.layers.potentialLandscape;
    this.layerPhonon.checked = this.params.layers.phononGlow;
    this.layerB.checked = this.params.layers.magneticField;

    this.playPauseBtn.textContent = this.params.paused ? 'Resume' : 'Pause';
  }
}
