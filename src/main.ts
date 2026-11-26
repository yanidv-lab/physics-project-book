import 'katex/dist/katex.min.css';
import './styles.css';
import * as THREE from 'three';

import {
  BOOK_VOLUMES,
  getVolumeById,
  type BookActionParams,
  type BookChapterSummary,
} from './data/bookCatalog';
import { setModelsEnabled } from './render/modelLibrary';
import { PROJECT_CHAPTERS, resolveHeroAnchorS } from './data/projectBook';
import { EmLab } from './labs/emLab';
import { FluidsLab } from './labs/fluidsLab';
import { FusionLab } from './labs/fusionLab';
import { GravityLab } from './labs/gravityLab';
import type { LabModule } from './labs/labModule';
import { MechanicsLab } from './labs/mechanicsLab';
import { NuclearLab } from './labs/nuclearLab';
import { OpticsLab } from './labs/opticsLab';
import { RelativityLab } from './labs/relativityLab';
import { ThermoLab } from './labs/thermoLab';
import { WavesLab } from './labs/wavesLab';
import { createDefaultParams } from './physics/constants';
import { PathGeometry } from './physics/pathGeometry';
import { CircuitModel } from './physics/circuitModel';
import { DrudeEngine } from './physics/drudeEngine';
import { SceneManager } from './render/sceneManager';
import { CircuitMeshes } from './render/circuitMeshes';
import { InstancedPhysicsRenderer } from './render/instancedPhysics';
import { FieldVisualizers } from './render/fieldVisualizers';
import { CameraController } from './render/cameraController';
import { InteractionManager } from './render/interactionManager';
import { ControlPanel } from './ui/controlPanel';
import { TelemetryHUD } from './ui/telemetryHud';
import { SchematicMinimap } from './ui/schematicMinimap';
import { Oscilloscope } from './ui/oscilloscope';
import { AnnotationsManager } from './ui/annotationsManager';
import { ProjectBookPanel } from './ui/projectBookPanel';
import { TooltipManager } from './ui/tooltipManager';
import { DynamicLabControls } from './ui/dynamicLabControls';
import { BookCoverModal } from './ui/bookCover';
import { AudioTourDockUI } from './ui/audioTourPlayer';
import { PhoneModal } from './ui/phoneModal';
import { ShareVolumeModal } from './ui/shareVolumeModal';
import type { TopicId, TopologyId } from './types/simulation';

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.05;
const MAX_SUBSTEPS = 32;

function bootstrap(): void {
  const host = document.getElementById('canvas-host') as HTMLElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  const oscCanvas = document.getElementById('oscilloscope-canvas') as HTMLCanvasElement;
  const collisionVignette = document.getElementById('collision-vignette') as HTMLElement;

  const params = createDefaultParams();
  let path = new PathGeometry(params.topology);
  const circuit = new CircuitModel(path, params);
  const engine = new DrudeEngine(path, circuit, params);

  const sceneManager = new SceneManager(host);
  const circuitGroup = new THREEGroupWrapper(sceneManager.scene);

  const circuitMeshes = new CircuitMeshes(path, circuit);
  const instanced = new InstancedPhysicsRenderer(engine);
  const visualizers = new FieldVisualizers(path, circuit);
  circuitGroup.group.add(circuitMeshes.group, instanced.group, visualizers.group);

  const cameraController = new CameraController(sceneManager);

  // Lazy-created Volume II–IX 3D Labs
  const labs: Record<Exclude<TopicId, 'circuits'>, LabModule> = {
    em: new EmLab(),
    gravity: new GravityLab(),
    waves: new WavesLab(),
    thermo: new ThermoLab(),
    optics: new OpticsLab(),
    mechanics: new MechanicsLab(),
    fluids: new FluidsLab(),
    relativity: new RelativityLab(),
    nuclear: new NuclearLab(),
    fusion: new FusionLab(),
  };
  let activeTopic: TopicId = 'circuits';
  let activeLab: LabModule | null = null;
  let activeCircuitChapterId = 'ch2-bottleneck-heat';
  let audioTour!: AudioTourDockUI;

  const telemetryHud = new TelemetryHUD();
  const oscilloscope = new Oscilloscope(oscCanvas);
  new TooltipManager();
  const phoneModal = new PhoneModal();

  const annotations = new AnnotationsManager({
    onTeleport: (s) => {
      if (activeTopic !== 'circuits') return;
      engine.teleportHero(s, path, circuit);
      telemetryHud.update(
        engine.getTelemetry(circuit, circuit.getState(), path, params),
        performance.now(),
        true,
      );
    },
    onHoverCallout: (kind, x, y, s) => {
      interaction.showExternalStudyNote(kind, x, y, s);
    },
    onHoverLabCallout: (hoverData, x, y) => {
      interaction.showLabStudyNote(hoverData, x, y);
    },
    onLeaveCallout: () => {
      interaction.hideHover();
    },
    onPinsChanged: () => {
      // Automatically synced to minimap and overlay
    },
  });

  const interaction = new InteractionManager(
    sceneManager,
    path,
    circuit,
    engine,
    circuitMeshes,
    {
      onDropPin: (s, kind, defaultTitle, defaultNote) => {
        annotations.createPin(s, kind, defaultTitle, defaultNote);
        controls.setMarkMode(false);
      },
      onDropWorldPin: (topicId, chapterId, targetKey, x, y, z, defaultTitle, defaultNote) => {
        annotations.createWorldPin(topicId, chapterId, targetKey, x, y, z, defaultTitle, defaultNote);
        controls.setMarkMode(false);
      },
    },
  );

  const dynamicLabControls = new DynamicLabControls(() => {
    if (activeLab) {
      telemetryHud.updateLab(
        activeLab.getTelemetry(),
        activeLab.getFormula(),
        activeLab.getStatusZonePill(),
        performance.now(),
        true,
      );
    }
  });

  const rebuildCircuitTopology = (topology: TopologyId) => {
    path = new PathGeometry(topology);
    circuit.setPath(path, params);
    engine.rebuildForTopology(path, circuit, params);
    circuitMeshes.rebuild(path, circuit);
    instanced.rebuildIons(engine);
    visualizers.rebuild(path, circuit);
    interaction.updateRefs(path, circuit, engine, circuitMeshes);
    annotations.rebuildForTopology(topology, path);
    oscilloscope.clear();
  };

  const launchCircuitChapter = (chapterId: string) => {
    const ch = PROJECT_CHAPTERS.find((c) => c.id === chapterId) ?? PROJECT_CHAPTERS[1];
    const s = ch.setup;
    const topoChanged = params.topology !== s.topology;
    params.topology = s.topology;
    params.sourceMode = s.sourceMode;
    params.voltage = s.voltage;
    params.acFrequency = s.acFrequency ?? 1.59;
    params.resistance = s.resistance;
    params.resistance2 = s.resistance2 ?? 30;
    params.capacitance = s.capacitance ?? (s.topology === 'rlc' ? 0.004 : 0.025);
    params.inductance = s.inductance ?? 2.5;
    params.rcDischarging = s.rcDischarging ?? false;
    params.temperature = s.temperature;
    params.scaleCompression = s.scaleCompression;
    params.timeDilation = s.timeDilation;
    params.layers = { ...s.layers };
    params.paused = false;

    if (topoChanged) {
      rebuildCircuitTopology(s.topology);
    } else {
      circuit.resetState(params);
      engine.resetCarriers(path, circuit, params);
      oscilloscope.clear();
    }

    const heroS = resolveHeroAnchorS(s.heroAnchor, path);
    engine.teleportHero(heroS, path, circuit);

    controls.setActiveCameraButton(s.cameraMode);
    cameraController.setMode(s.cameraMode, path, engine, circuitMeshes, instanced);
    controls.syncUI();
    telemetryHud.update(
      engine.getTelemetry(circuit, circuit.getState(), path, params),
      performance.now(),
      true,
    );
  };

  const switchTopicAndChapter = (topicId: TopicId, chapterId?: string) => {
    const vol = getVolumeById(topicId);
    const targetChapterId = chapterId ?? vol.chapters[0]?.id ?? '';

    if (activeLab) {
      sceneManager.scene.remove(activeLab.group);
    }

    activeTopic = topicId;
    annotations.store.markChapterCompleted(targetChapterId);

    if (topicId === 'circuits') {
      activeCircuitChapterId = targetChapterId;
      activeLab = null;
      circuitGroup.group.visible = true;
      dynamicLabControls.setLab(null);
      controls.setTopicMode(true);
      telemetryHud.setTopicMode(true);
      interaction.setActiveLab(null);
      oscilloscope.setChannels(['V', 'I', 'U'], ['V', 'A', 'eV']);
      launchCircuitChapter(targetChapterId);
      annotations.rebuildForTopology(params.topology, path);
    } else {
      circuitGroup.group.visible = false;
      activeLab = labs[topicId];
      sceneManager.scene.add(activeLab.group);
      activeLab.activate(targetChapterId);

      controls.setTopicMode(false);
      telemetryHud.setTopicMode(false);
      interaction.setActiveLab(activeLab);
      dynamicLabControls.setLab(activeLab);
      annotations.setActiveLabContext(topicId, targetChapterId);

      const camSpec = activeLab.getRecommendedCamera();
      cameraController.setLabOrbit(camSpec.position, camSpec.target);
      oscilloscope.clear();
      const oscSample = activeLab.getOscilloscopeSample();
      oscilloscope.setChannels(oscSample.labels, oscSample.units);
      telemetryHud.setOscLegend(oscSample.labels);
      telemetryHud.updateLab(
        activeLab.getTelemetry(),
        activeLab.getFormula(),
        activeLab.getStatusZonePill(),
        performance.now(),
        true,
      );
    }

    bookPanel.setState(topicId, targetChapterId);
    bookCover.render();
  };

  const minimap = new SchematicMinimap(minimapCanvas, (targetS) => {
    if (activeTopic !== 'circuits') return;
    engine.teleportHero(targetS, path, circuit);
    const state = circuit.getState();
    const tel = engine.getTelemetry(circuit, state, path, params);
    telemetryHud.update(tel, performance.now(), true);
  });

  const controls = new ControlPanel(params, {
    onTopologyChange: (topology) => {
      rebuildCircuitTopology(topology);
      cameraController.setMode(
        cameraController.getMode(),
        path,
        engine,
        circuitMeshes,
        instanced,
      );
      telemetryHud.update(
        engine.getTelemetry(circuit, circuit.getState(), path, params),
        performance.now(),
        true,
      );
    },
    onCameraChange: (mode) => {
      if (activeTopic === 'circuits') {
        cameraController.setMode(mode, path, engine, circuitMeshes, instanced);
      }
    },
    onLabResetView: () => {
      if (activeLab) {
        const cam = activeLab.getRecommendedCamera();
        cameraController.setLabOrbit(cam.position, cam.target);
      }
    },
    onReset: () => {
      if (activeTopic === 'circuits') {
        circuit.resetState(params);
        engine.resetCarriers(path, circuit, params);
        oscilloscope.clear();
        cameraController.setMode(
          cameraController.getMode(),
          path,
          engine,
          circuitMeshes,
          instanced,
        );
        telemetryHud.update(
          engine.getTelemetry(circuit, circuit.getState(), path, params),
          performance.now(),
          true,
        );
      } else if (activeLab) {
        activeLab.reset();
        oscilloscope.clear();
        telemetryHud.updateLab(
          activeLab.getTelemetry(),
          activeLab.getFormula(),
          activeLab.getStatusZonePill(),
          performance.now(),
          true,
        );
      }
    },
    onCapHandoff: () => {
      engine.triggerCapacitorHandoff(circuit.getState().current, path);
    },
    onParamsChange: () => {
      if (activeTopic === 'circuits') {
        telemetryHud.update(
          engine.getTelemetry(circuit, circuit.getState(), path, params),
          performance.now(),
          true,
        );
      }
    },
    onMarkModeToggle: (enabled) => {
      interaction.setMarkMode(enabled);
    },
    onSimpleModeToggle: (simple) => {
      telemetryHud.setSimpleMode(simple);
      interaction.setSimpleMode(simple);
      if (activeLab) {
        telemetryHud.updateLab(
          activeLab.getTelemetry(),
          activeLab.getFormula(),
          activeLab.getStatusZonePill(),
          performance.now(),
          true,
        );
      }
    },
    onLabelsToggle: (visible) => {
      annotations.setLabelsVisible(visible);
    },
    onOpenBookCover: () => {
      bookCover.show();
    },
    onOpenPhoneModal: () => {
      void phoneModal.show();
    },
    onToggleAudioTour: () => {
      audioTour.toggleForTopic(activeTopic);
    },
  });

  const applyChapterCue = (topicId: TopicId, chapterId: string, apply?: BookActionParams): void => {
    const needsSwitch =
      topicId !== activeTopic ||
      (topicId === 'circuits'
        ? activeCircuitChapterId !== chapterId
        : activeLab?.getActiveChapterId() !== chapterId);

    if (needsSwitch) {
      switchTopicAndChapter(topicId, chapterId);
    }
    if (!apply) return;

    if (topicId === 'circuits') {
      const a = apply as Record<string, unknown>;
      if (typeof a.temperature === 'number') params.temperature = a.temperature;
      if (typeof a.voltage === 'number') params.voltage = a.voltage;
      if (typeof a.resistance === 'number') params.resistance = a.resistance;
      if (typeof a.resistance2 === 'number') params.resistance2 = a.resistance2;
      if (typeof a.sourceMode === 'string') params.sourceMode = a.sourceMode as 'dc' | 'ac';
      if (typeof a.acFrequency === 'number') params.acFrequency = a.acFrequency;
      if (typeof a.rcDischarging === 'boolean') params.rcDischarging = a.rcDischarging;
      if (typeof a.heroAnchor === 'string') {
        engine.teleportHero(
          resolveHeroAnchorS(a.heroAnchor as Parameters<typeof resolveHeroAnchorS>[0], path),
          path,
          circuit,
        );
      }
      if (typeof a.cameraMode === 'string') {
        const cm = a.cameraMode as Parameters<typeof controls.setActiveCameraButton>[0];
        controls.setActiveCameraButton(cm);
        cameraController.setMode(cm, path, engine, circuitMeshes, instanced);
      }
      controls.syncUI();
      telemetryHud.update(
        engine.getTelemetry(circuit, circuit.getState(), path, params),
        performance.now(),
        true,
      );
    } else if (activeLab) {
      activeLab.applyQuickAction(apply);
      dynamicLabControls.render();
      telemetryHud.updateLab(
        activeLab.getTelemetry(),
        activeLab.getFormula(),
        activeLab.getStatusZonePill(),
        performance.now(),
        true,
      );
    }
  };

  const bookCover = new BookCoverModal(annotations.store, {
    onSelectVolume: (topicId, chapterId) => {
      switchTopicAndChapter(topicId, chapterId);
      if (window.innerWidth <= 900) {
        controls.setMobileSheet('none');
      }
    },
    onStartAudioTour: (topicId) => {
      if (window.innerWidth <= 900) {
        controls.setMobileSheet('none');
      }
      audioTour.startVolume(topicId);
    },
    onOpenPhoneModal: () => {
      void phoneModal.show();
    },
  });

  const bookPanel = new ProjectBookPanel(annotations.store, {
    onSelectVolume: (topicId) => {
      switchTopicAndChapter(topicId);
    },
    onLaunchChapter: (ch: BookChapterSummary) => {
      switchTopicAndChapter(ch.topicId, ch.id);
      if (window.innerWidth <= 900) {
        controls.setMobileSheet('none');
      }
    },
    onQuickAction: (ch, action) => {
      applyChapterCue(ch.topicId, ch.id, action.apply);
    },
    onOpenCover: () => {
      bookCover.show();
    },
    onStartAudioTour: (topicId) => {
      if (window.innerWidth <= 900) {
        controls.setMobileSheet('none');
      }
      audioTour.startVolume(topicId);
    },
  });

  const hudOverlay = document.getElementById('hud-root');
  const macroViewBtn = document.getElementById('macro-view-btn') as HTMLButtonElement | null;
  let macroViewActive = false;

  const applyMacroFraming = () => {
    if (!macroViewActive) return;
    if (activeTopic === 'circuits') {
      cameraController.setMode('macro-overview', path, engine, circuitMeshes, instanced);
      controls.setActiveCameraButton('macro-overview');
    } else if (activeLab) {
      const camSpec = activeLab.getRecommendedCamera();
      cameraController.setLabMacroOrbit(camSpec.position, camSpec.target, true);
    }
  };

  const setMacroView = (on: boolean) => {
    macroViewActive = on;
    hudOverlay?.classList.toggle('hud-macro-mode', on);
    macroViewBtn?.classList.toggle('active', on);
    if (on) {
      if (window.innerWidth <= 900) controls.setMobileSheet('none');
      applyMacroFraming();
    } else if (activeLab) {
      const camSpec = activeLab.getRecommendedCamera();
      cameraController.setLabOrbit(camSpec.position, camSpec.target);
    } else {
      cameraController.setAutoRotate(false);
    }
  };

  macroViewBtn?.addEventListener('click', () => setMacroView(!macroViewActive));
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'v' || e.key === 'V') setMacroView(!macroViewActive);
  });

  let shareModal!: ShareVolumeModal;

  audioTour = new AudioTourDockUI({
    onCueStart: (topicId, cue) => {
      applyChapterCue(topicId, cue.chapterId, cue.apply);
      if (window.innerWidth <= 900) {
        controls.setMobileSheet('none');
      }
      // Present every audio tour lesson from a clean, unobstructed macro vantage
      setMacroView(true);
    },
    onStateChange: (snapshot) => {
      controls.setAudioTourActive(snapshot.active);
      if (!snapshot.active) {
        shareModal?.onAudioTourFinished();
        if (macroViewActive && !hudOverlay?.classList.contains('hud-solo-mode')) {
          setMacroView(false);
        }
      }
    },
  });

  annotations.rebuildForTopology(params.topology, path);
  cameraController.setMode('locked-drift', path, engine, circuitMeshes, instanced);
  controls.syncUI();
  interaction.setMarkMode(false);

  const soloDock = document.getElementById('solo-theater-dock');
  const soloVolBadge = document.getElementById('solo-vol-badge');
  const soloVolTitle = document.getElementById('solo-vol-title');
  const soloChapterPills = document.getElementById('solo-chapter-pills');
  const soloLiveParams = document.getElementById('solo-live-params');
  const soloTourBtn = document.getElementById('solo-tour-btn') as HTMLButtonElement | null;
  const soloPipBtn = document.getElementById('solo-pip-btn') as HTMLButtonElement | null;
  const soloMinBtn = document.getElementById('solo-min-btn') as HTMLButtonElement | null;
  const soloRestoreBarBtn = document.getElementById('solo-restore-bar-btn') as HTMLButtonElement | null;
  const soloShareBtn = document.getElementById('solo-share-btn') as HTMLButtonElement | null;
  const shareVolumeBtn = document.getElementById('share-volume-btn') as HTMLButtonElement | null;
  const mobShareBtn = document.getElementById('mob-share-btn') as HTMLButtonElement | null;

  let bottomBarsMinimized = false;
  const setBottomBarsMinimized = (minimized: boolean) => {
    bottomBarsMinimized = minimized;
    hudOverlay?.classList.toggle('bottom-bars-minimized', minimized);
    const hasBottomBar = hudOverlay?.classList.contains('hud-solo-mode') || audioTour.isActive();
    soloRestoreBarBtn?.classList.toggle('hidden', !minimized || !hasBottomBar);
  };

  soloMinBtn?.addEventListener('click', () => setBottomBarsMinimized(true));
  soloRestoreBarBtn?.addEventListener('click', () => setBottomBarsMinimized(false));

  // Quick tap on the 3D canvas toggles minimizing the bottom bar on phones so it never covers the simulation
  let tapStartX = 0;
  let tapStartY = 0;
  let tapStartTime = 0;
  const glCanvas = sceneManager.renderer.domElement;
  glCanvas.addEventListener('pointerdown', (e) => {
    tapStartX = e.clientX;
    tapStartY = e.clientY;
    tapStartTime = performance.now();
  });
  glCanvas.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY);
    const elapsed = performance.now() - tapStartTime;
    if (moved < 10 && elapsed < 320) {
      const hasBottomBar = hudOverlay?.classList.contains('hud-solo-mode') || audioTour.isActive();
      if (hasBottomBar) {
        setBottomBarsMinimized(!bottomBarsMinimized);
      }
    }
  });

  const renderSoloLiveParams = () => {
    if (!soloLiveParams) return;
    soloLiveParams.innerHTML = '';
    if (!activeLab) return;
    const sliders = activeLab.getControlSchema().sliders.slice(0, 2);
    for (const s of sliders) {
      const wrap = document.createElement('label');
      wrap.className = 'solo-param-item';
      const lbl = document.createElement('span');
      lbl.textContent = s.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(s.value);
      const val = document.createElement('span');
      val.className = 'solo-param-val';
      val.textContent = `${s.value}${s.unit}`;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        activeLab?.setParam(s.key, v);
        val.textContent = `${v}${s.unit}`;
      });
      wrap.append(lbl, input, val);
      soloLiveParams.appendChild(wrap);
    }
  };

  const renderSoloDock = (topicId: TopicId, activeChId: string) => {
    const vol = getVolumeById(topicId);
    if (soloVolBadge) soloVolBadge.textContent = vol.roman;
    if (soloVolTitle) soloVolTitle.textContent = vol.title;
    if (soloChapterPills) {
      soloChapterPills.innerHTML = '';
      for (const ch of vol.chapters) {
        const btn = document.createElement('button');
        btn.className = `solo-ch-pill${ch.id === activeChId ? ' active' : ''}`;
        btn.dataset.chapterId = ch.id;
        btn.textContent = `${ch.number}. ${ch.title}`;
        btn.addEventListener('click', () => {
          switchTopicAndChapter(topicId, ch.id);
          applyMacroFraming();
          renderSoloDock(topicId, ch.id);
        });
        soloChapterPills.appendChild(btn);
      }
    }
    renderSoloLiveParams();
  };

  const enterSoloScreenInScreen = (topicId: TopicId, chapterId?: string, pipFrame = true) => {
    const vol = getVolumeById(topicId);
    const chId = chapterId && vol.chapters.some((c) => c.id === chapterId) ? chapterId : vol.chapters[0]?.id ?? '';
    switchTopicAndChapter(topicId, chId);
    bookCover.hide();
    hudOverlay?.classList.add('hud-solo-mode');
    soloDock?.classList.remove('hidden');
    document.body.classList.toggle('solo-pip-frame', pipFrame);
    soloPipBtn?.classList.toggle('active', pipFrame);
    setBottomBarsMinimized(false);
    setMacroView(true);
    renderSoloDock(topicId, chId);
    sceneManager.resize(host.clientWidth, host.clientHeight);
  };

  shareModal = new ShareVolumeModal({
    getActiveTopicId: () => activeTopic,
    getActiveChapterId: () => (activeTopic === 'circuits' ? activeCircuitChapterId : activeLab?.getActiveChapterId() ?? ''),
    getCanvas: () => sceneManager.renderer.domElement,
    getAudioElement: () => audioTour.getAudioElement(),
    onStartTourForRecording: (topicId) => {
      setBottomBarsMinimized(true);
      audioTour.startVolume(topicId);
    },
    onStopTourAfterRecording: () => {
      if (audioTour.isActive()) audioTour.stop();
      setBottomBarsMinimized(false);
    },
    onEnterSoloMode: (topicId) => {
      const chId = activeTopic === 'circuits' ? activeCircuitChapterId : activeLab?.getActiveChapterId();
      enterSoloScreenInScreen(topicId, chId, true);
    },
  });

  shareVolumeBtn?.addEventListener('click', () => shareModal.show());
  mobShareBtn?.addEventListener('click', () => {
    controls.setMobileSheet('none');
    shareModal.show();
  });
  soloShareBtn?.addEventListener('click', () => shareModal.show());
  soloTourBtn?.addEventListener('click', () => {
    if (audioTour.isActive()) audioTour.stop();
    else audioTour.startVolume(activeTopic);
  });
  soloPipBtn?.addEventListener('click', () => {
    const next = !document.body.classList.contains('solo-pip-frame');
    document.body.classList.toggle('solo-pip-frame', next);
    soloPipBtn.classList.toggle('active', next);
    sceneManager.resize(host.clientWidth, host.clientHeight);
  });

  // Deep links:
  // - ?volume=<topicId>&solo=1 (or ?chapter=<id>&solo=1): clean Screen-in-Screen single-volume player for messaging apps
  // - ?chapter=<chapter-id>: opens a lab directly; ?macro=1 opens in wide Macro Lesson View; ?models=off compares procedural meshes
  const query = new URLSearchParams(window.location.search);
  if (query.get('models') === 'off') setModelsEnabled(false);
  const queryVolume = query.get('volume');
  const deepChapter = query.get('chapter');
  const isSolo = query.get('solo') === '1';

  const deepVolume =
    (queryVolume ? BOOK_VOLUMES.find((v) => v.id === queryVolume) : undefined) ??
    (deepChapter
      ? BOOK_VOLUMES.find((v) => v.id === deepChapter || v.chapters.some((c) => c.id === deepChapter))
      : undefined);

  if (deepVolume && isSolo) {
    enterSoloScreenInScreen(
      deepVolume.id,
      deepChapter && deepChapter !== deepVolume.id ? deepChapter : undefined,
      query.get('pip') !== '0',
    );
  } else if (deepVolume) {
    switchTopicAndChapter(deepVolume.id, deepChapter && deepChapter !== deepVolume.id ? deepChapter : undefined);
    bookCover.hide();
    if (query.get('macro') === '1') setMacroView(true);
  } else {
    bookCover.show();
  }

  window.addEventListener('resize', () => {
    sceneManager.resize(host.clientWidth, host.clientHeight);
  });

  let prevTime = performance.now();
  let accumulator = 0;

  const animate = (now: number) => {
    requestAnimationFrame(animate);

    const rawDt = Math.min((now - prevTime) / 1000, MAX_FRAME_DT);
    prevTime = now;

    if (activeTopic === 'circuits') {
      if (!params.paused) {
        const dilatedDt = Math.min(rawDt * params.timeDilation, MAX_SUBSTEPS * FIXED_DT);
        accumulator += dilatedDt;

        let steps = 0;
        while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
          const state = circuit.step(FIXED_DT, params);
          engine.step(FIXED_DT, circuit, state, path, params);
          const sampledHero = circuit.sampleAtS(engine.s[0]);
          const vTrace =
            params.topology === 'rc' || params.topology === 'rlc'
              ? state.capacitorVoltage
              : (state.nodeVoltages[2] ?? state.sourceVoltage);
          oscilloscope.pushSample(FIXED_DT, vTrace, state.current, sampledHero.localU_eV);
          accumulator -= FIXED_DT;
          steps++;
        }
        if (steps >= MAX_SUBSTEPS) {
          accumulator = 0;
        }
      }

      const state = circuit.getState();
      const animDt = params.paused ? 0 : rawDt;

      sceneManager.update(animDt);
      circuitMeshes.update(animDt, state, params);
      instanced.update(animDt, engine, state, params);
      visualizers.update(animDt, circuit, state, params);
      cameraController.update(rawDt, path, engine, circuitMeshes);
      interaction.update();

      annotations.projectOverlays(
        sceneManager.camera,
        path,
        cameraController.getMode(),
        host.clientWidth,
        host.clientHeight,
      );

      if (cameraController.getMode() === 'raw-pov') {
        const pulse = instanced.getHeroCollisionPulse();
        collisionVignette.style.opacity = String(Math.min(0.45, pulse * 0.45));
      } else {
        collisionVignette.style.opacity = '0';
      }

      const telemetry = engine.getTelemetry(circuit, state, path, params);
      telemetryHud.update(telemetry, now);
      minimap.render(
        rawDt,
        path,
        circuit,
        state,
        params,
        engine.s[0],
        annotations.store.getPinsForTopology(params.topology),
      );
      oscilloscope.render();
    } else if (activeLab) {
      const animDt = params.paused ? 0 : rawDt;
      sceneManager.update(animDt);
      activeLab.update(animDt);

      // Audio-synced keyframed camera choreography & chapter pill progress bar
      const playback = audioTour.getPlaybackState();
      if (playback.active && playback.playing && playback.cue?.cameraKeyframes?.length) {
        const kfs = playback.cue.cameraKeyframes;
        let activeKf = kfs[0];
        for (const kf of kfs) {
          if (playback.currentTime >= kf.atSec) activeKf = kf;
        }
        cameraController.lerpLabOrbit(activeKf.position, activeKf.target, rawDt);
      } else {
        cameraController.updateLabOrbit();
      }
      if (soloChapterPills && playback.active && playback.cue) {
        const activePill = soloChapterPills.querySelector<HTMLElement>(
          `.solo-ch-pill[data-chapter-id="${playback.cue.chapterId}"]`,
        );
        if (activePill) {
          activePill.style.setProperty('--ch-progress', `${(playback.progress * 100).toFixed(1)}%`);
        }
      }

      interaction.update();
      collisionVignette.style.opacity = '0';

      annotations.projectLabOverlays(
        sceneManager.camera,
        activeLab.getCallouts(),
        host.clientWidth,
        host.clientHeight,
      );

      const osc = activeLab.getOscilloscopeSample();
      if (!params.paused) {
        oscilloscope.pushSample(rawDt, osc.ch1, osc.ch2, osc.ch3);
      }
      oscilloscope.render();

      telemetryHud.updateLab(
        activeLab.getTelemetry(),
        activeLab.getFormula(),
        activeLab.getStatusZonePill(),
        now,
      );
    }

    sceneManager.render();
  };

  requestAnimationFrame(animate);
}

class THREEGroupWrapper {
  public readonly group = new THREE.Group();
  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }
}

bootstrap();
