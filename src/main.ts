import 'katex/dist/katex.min.css';
import './styles.css';
import * as THREE from 'three';

import { getVolumeById, type BookChapterSummary } from './data/bookCatalog';
import { PROJECT_CHAPTERS, resolveHeroAnchorS } from './data/projectBook';
import { EmLab } from './labs/emLab';
import { FluidsLab } from './labs/fluidsLab';
import { GravityLab } from './labs/gravityLab';
import type { LabModule } from './labs/labModule';
import { MechanicsLab } from './labs/mechanicsLab';
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
import { PhoneModal } from './ui/phoneModal';
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
  };
  let activeTopic: TopicId = 'circuits';
  let activeLab: LabModule | null = null;

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
  });

  const bookCover = new BookCoverModal(annotations.store, {
    onSelectVolume: (topicId, chapterId) => {
      switchTopicAndChapter(topicId, chapterId);
      if (window.innerWidth <= 900) {
        controls.setMobileSheet('none');
      }
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
      if (ch.topicId !== activeTopic || (activeLab && activeLab.getActiveChapterId() !== ch.id)) {
        switchTopicAndChapter(ch.topicId, ch.id);
      }
      if (ch.topicId === 'circuits') {
        const a = action.apply as Record<string, unknown>;
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
        activeLab.applyQuickAction(action.apply);
        dynamicLabControls.render();
        telemetryHud.updateLab(
          activeLab.getTelemetry(),
          activeLab.getFormula(),
          activeLab.getStatusZonePill(),
          performance.now(),
          true,
        );
      }
    },
    onOpenCover: () => {
      bookCover.show();
    },
  });

  annotations.rebuildForTopology(params.topology, path);
  cameraController.setMode('locked-drift', path, engine, circuitMeshes, instanced);
  controls.syncUI();
  interaction.setMarkMode(false);
  bookCover.show();

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
      cameraController.updateLabOrbit();
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
