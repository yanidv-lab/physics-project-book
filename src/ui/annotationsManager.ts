import * as THREE from 'three';
import { SCENE_STUDY_NOTES } from '../data/projectBook';
import type { LabCalloutPoint, LabHoverData } from '../labs/labModule';
import { PathGeometry } from '../physics/pathGeometry';
import type {
  CameraMode,
  HoverTargetKind,
  PinColor,
  TopicId,
  TopologyId,
  UserPin,
  WorldPin,
} from '../types/simulation';

const STORAGE_KEY = 'electron-pov-notebook-v2';
const LEGACY_STORAGE_KEY = 'electron-pov-notebook-v1';

interface StoredNotebook {
  pins: UserPin[];
  worldPins: WorldPin[];
  completedChapters: string[];
  starredChapters: string[];
}

export const PIN_COLOR_HEX: Record<PinColor, string> = {
  cyan: '#00f0ff',
  gold: '#fbbf24',
  magenta: '#ec4899',
  emerald: '#10b981',
};

/**
 * Pure persistence & CRUD store for study pins (both Volume I circuit pins and
 * Volumes II-IV 3D world pins) and chapter progress.
 */
export class NotebookStore {
  private pins: UserPin[] = [];
  private worldPins: WorldPin[] = [];
  private completedChapters = new Set<string>();
  private starredChapters = new Set<string>();
  private nextPinSeq = 1;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredNotebook>;
      if (Array.isArray(parsed.pins)) {
        this.pins = parsed.pins;
      }
      if (Array.isArray(parsed.worldPins)) {
        this.worldPins = parsed.worldPins;
      }
      this.nextPinSeq = this.pins.length + this.worldPins.length + 1;
      if (Array.isArray(parsed.completedChapters)) {
        this.completedChapters = new Set(parsed.completedChapters);
      }
      if (Array.isArray(parsed.starredChapters)) {
        this.starredChapters = new Set(parsed.starredChapters);
      }
    } catch {
      // Ignore storage read errors
    }
  }

  private save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload: StoredNotebook = {
        pins: this.pins,
        worldPins: this.worldPins,
        completedChapters: [...this.completedChapters],
        starredChapters: [...this.starredChapters],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  public getAllPins(): UserPin[] {
    return [...this.pins];
  }

  public getPinsForTopology(topology: TopologyId): UserPin[] {
    return this.pins.filter((p) => p.topology === topology);
  }

  public addPin(
    topology: TopologyId,
    s: number,
    targetKind: HoverTargetKind,
    title: string,
    note: string,
    color: PinColor = 'gold',
  ): UserPin {
    const pin: UserPin = {
      id: `pin-${Date.now()}-${this.nextPinSeq++}`,
      topology,
      s,
      targetKind,
      title,
      note,
      color,
      createdAt: Date.now(),
    };
    this.pins.unshift(pin);
    this.save();
    return pin;
  }

  public updatePin(
    id: string,
    patch: Partial<Pick<UserPin, 'title' | 'note' | 'color'>>,
  ): UserPin | null {
    const pin = this.pins.find((p) => p.id === id);
    if (!pin) return null;
    if (patch.title !== undefined) pin.title = patch.title;
    if (patch.note !== undefined) pin.note = patch.note;
    if (patch.color !== undefined) pin.color = patch.color;
    this.save();
    return pin;
  }

  public deletePin(id: string): boolean {
    const before = this.pins.length;
    this.pins = this.pins.filter((p) => p.id !== id);
    if (this.pins.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  // World pins for Volumes II - IV
  public getAllWorldPins(): WorldPin[] {
    return [...this.worldPins];
  }

  public getWorldPinsForChapter(topicId: Exclude<TopicId, 'circuits'>, chapterId: string): WorldPin[] {
    return this.worldPins.filter((p) => p.topicId === topicId && p.chapterId === chapterId);
  }

  public addWorldPin(
    topicId: Exclude<TopicId, 'circuits'>,
    chapterId: string,
    targetKey: string,
    x: number,
    y: number,
    z: number,
    title: string,
    note: string,
    color: PinColor = 'gold',
  ): WorldPin {
    const pin: WorldPin = {
      id: `wpin-${Date.now()}-${this.nextPinSeq++}`,
      topicId,
      chapterId,
      targetKey,
      x,
      y,
      z,
      title,
      note,
      color,
      createdAt: Date.now(),
    };
    this.worldPins.unshift(pin);
    this.save();
    return pin;
  }

  public updateWorldPin(
    id: string,
    patch: Partial<Pick<WorldPin, 'title' | 'note' | 'color'>>,
  ): WorldPin | null {
    const pin = this.worldPins.find((p) => p.id === id);
    if (!pin) return null;
    if (patch.title !== undefined) pin.title = patch.title;
    if (patch.note !== undefined) pin.note = patch.note;
    if (patch.color !== undefined) pin.color = patch.color;
    this.save();
    return pin;
  }

  public deleteWorldPin(id: string): boolean {
    const before = this.worldPins.length;
    this.worldPins = this.worldPins.filter((p) => p.id !== id);
    if (this.worldPins.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public isChapterCompleted(id: string): boolean {
    return this.completedChapters.has(id);
  }

  public toggleChapterCompleted(id: string): boolean {
    if (this.completedChapters.has(id)) {
      this.completedChapters.delete(id);
    } else {
      this.completedChapters.add(id);
    }
    this.save();
    return this.completedChapters.has(id);
  }

  public markChapterCompleted(id: string): void {
    if (!this.completedChapters.has(id)) {
      this.completedChapters.add(id);
      this.save();
    }
  }

  public isChapterStarred(id: string): boolean {
    return this.starredChapters.has(id);
  }

  public toggleChapterStarred(id: string): boolean {
    if (this.starredChapters.has(id)) {
      this.starredChapters.delete(id);
    } else {
      this.starredChapters.add(id);
    }
    this.save();
    return this.starredChapters.has(id);
  }

  public getCompletedCount(): number {
    return this.completedChapters.size;
  }

  public getCompletedCountForIds(ids: string[]): number {
    let n = 0;
    for (const id of ids) {
      if (this.completedChapters.has(id)) n++;
    }
    return n;
  }

  public exportMarkdown(): string {
    const lines: string[] = [
      '# Physics Project Book — Study Notes & Marked Pins',
      '',
      `Completed Chapters: ${this.completedChapters.size}`,
      `Starred Chapters: ${[...this.starredChapters].join(', ') || 'None'}`,
      '',
      '## Circuit Pins (Vol. I)',
    ];
    if (this.pins.length === 0) {
      lines.push('- (No circuit pins recorded yet)');
    } else {
      for (const p of this.pins) {
        lines.push(`- **[${p.topology.toUpperCase()} · ${p.color}] ${p.title}** (s = ${p.s.toFixed(1)}): ${p.note}`);
      }
    }
    lines.push('', '## Physics Lab Pins (Vol. II–IV)');
    if (this.worldPins.length === 0) {
      lines.push('- (No lab pins recorded yet)');
    } else {
      for (const p of this.worldPins) {
        lines.push(`- **[${p.topicId.toUpperCase()} · ${p.chapterId}] ${p.title}**: ${p.note}`);
      }
    }
    return lines.join('\n');
  }
}

interface CalloutDef {
  id: string;
  label: string;
  kind: HoverTargetKind;
  s: number;
  accent: string;
}

export interface AnnotationsCallbacks {
  onTeleport: (s: number) => void;
  onHoverCallout: (kind: HoverTargetKind, x: number, y: number, s: number) => void;
  onHoverLabCallout: (hover: LabHoverData, x: number, y: number) => void;
  onLeaveCallout: () => void;
  onPinsChanged: () => void;
}

export class AnnotationsManager {
  public readonly store = new NotebookStore();
  private readonly callbacks: AnnotationsCallbacks;

  private readonly pinOverlay = document.getElementById('pin-overlay') as HTMLElement;
  private readonly calloutOverlay = document.getElementById('callout-overlay') as HTMLElement;
  private readonly marksListEl = document.getElementById('marks-list') as HTMLElement;
  private readonly pinsCountBadge = document.getElementById('pins-count-badge') as HTMLElement;
  private readonly exportNotesBtn = document.getElementById('export-notes-btn') as HTMLButtonElement;
  private readonly pinEditor = document.getElementById('pin-editor-popover') as HTMLElement;

  private pinElements = new Map<string, HTMLButtonElement>();
  private calloutDefs: CalloutDef[] = [];
  private calloutElements: HTMLButtonElement[] = [];
  private labCalloutElements = new Map<string, HTMLButtonElement>();

  private activeTopic: TopicId = 'circuits';
  private activeTopology: TopologyId = 'simple-r';
  private activeChapterId = '';
  private showLabels = true;
  private editingPinId: string | null = null;
  private editingIsWorldPin = false;

  private readonly tmpWorld = new THREE.Vector3();
  private readonly tmpNdc = new THREE.Vector3();

  constructor(callbacks: AnnotationsCallbacks) {
    this.callbacks = callbacks;

    this.exportNotesBtn.addEventListener('click', async () => {
      const md = this.store.exportMarkdown();
      try {
        await navigator.clipboard.writeText(md);
        this.exportNotesBtn.textContent = 'Copied Markdown!';
      } catch {
        this.exportNotesBtn.textContent = 'Exported to Console';
        console.info(md);
      }
      setTimeout(() => {
        this.exportNotesBtn.textContent = 'Copy Notes (MD)';
      }, 1800);
    });

    this.rebuildMarksList();
  }

  public setLabelsVisible(visible: boolean): void {
    this.showLabels = visible;
    this.calloutOverlay.classList.toggle('hidden', !visible);
  }

  public getLabelsVisible(): boolean {
    return this.showLabels;
  }

  public setActiveLabContext(topic: TopicId, chapterId: string): void {
    this.activeTopic = topic;
    this.activeChapterId = chapterId;
    this.closePinEditor();
    this.calloutOverlay.innerHTML = '';
    this.calloutElements = [];
    this.labCalloutElements.clear();
    this.rebuildPinOverlay();
    this.rebuildMarksList();
  }

  public rebuildForTopology(topology: TopologyId, path: PathGeometry): void {
    this.activeTopic = 'circuits';
    this.activeTopology = topology;
    this.closePinEditor();
    this.labCalloutElements.clear();
    this.rebuildPinOverlay();
    this.rebuildCallouts(topology, path);
    this.rebuildMarksList();
  }

  public createPin(
    s: number,
    kind: HoverTargetKind,
    defaultTitle: string,
    defaultNote: string,
  ): void {
    const pin = this.store.addPin(this.activeTopology, s, kind, defaultTitle, defaultNote, 'gold');
    this.rebuildPinOverlay();
    this.rebuildMarksList();
    this.openPinEditor(pin.id, false);
    this.callbacks.onPinsChanged();
  }

  public createWorldPin(
    topicId: Exclude<TopicId, 'circuits'>,
    chapterId: string,
    targetKey: string,
    x: number,
    y: number,
    z: number,
    defaultTitle: string,
    defaultNote: string,
  ): void {
    const pin = this.store.addWorldPin(
      topicId,
      chapterId,
      targetKey,
      x,
      y,
      z,
      defaultTitle,
      defaultNote,
      'gold',
    );
    this.rebuildPinOverlay();
    this.rebuildMarksList();
    this.openPinEditor(pin.id, true);
    this.callbacks.onPinsChanged();
  }

  private rebuildCallouts(topology: TopologyId, path: PathGeometry): void {
    this.calloutOverlay.innerHTML = '';
    this.calloutElements = [];
    this.calloutDefs = [];

    const a = path.anchors;
    this.calloutDefs.push({
      id: 'callout-bat',
      label: 'Battery EMF',
      kind: 'battery',
      s: 0.5 * (a.batteryStart + a.batteryEnd),
      accent: SCENE_STUDY_NOTES.battery.accent,
    });
    this.calloutDefs.push({
      id: 'callout-r1',
      label: 'Resistor R₁',
      kind: 'resistor',
      s: 0.5 * (a.res1Start + a.res1End),
      accent: SCENE_STUDY_NOTES.resistor.accent,
    });
    this.calloutDefs.push({
      id: 'callout-corner',
      label: '90° Corner',
      kind: 'corner',
      s: a.res1Start - 10.75,
      accent: SCENE_STUDY_NOTES.corner.accent,
    });

    if (topology === 'divider' && a.res2Start !== null && a.res2End !== null) {
      this.calloutDefs.push({
        id: 'callout-r2',
        label: 'Resistor R₂',
        kind: 'resistor2',
        s: 0.5 * (a.res2Start + a.res2End),
        accent: SCENE_STUDY_NOTES.resistor2.accent,
      });
    }
    if ((topology === 'rc' || topology === 'rlc') && a.capGapStart !== null && a.capGapEnd !== null) {
      this.calloutDefs.push({
        id: 'callout-cap',
        label: 'Capacitor C',
        kind: 'capacitor',
        s: 0.5 * (a.capGapStart + a.capGapEnd),
        accent: SCENE_STUDY_NOTES.capacitor.accent,
      });
    }
    if (topology === 'rlc' && a.inductorStart !== null && a.inductorEnd !== null) {
      this.calloutDefs.push({
        id: 'callout-ind',
        label: 'Inductor L',
        kind: 'inductor',
        s: 0.5 * (a.inductorStart + a.inductorEnd),
        accent: SCENE_STUDY_NOTES.inductor.accent,
      });
    }

    for (const def of this.calloutDefs) {
      const btn = document.createElement('button');
      btn.className = 'scene-callout';
      btn.textContent = def.label;
      btn.style.borderColor = `${def.accent}66`;
      btn.addEventListener('mouseenter', (e) => {
        this.callbacks.onHoverCallout(def.kind, e.clientX, e.clientY, def.s);
      });
      btn.addEventListener('mouseleave', () => {
        this.callbacks.onLeaveCallout();
      });
      btn.addEventListener('click', () => {
        this.callbacks.onTeleport(def.s);
      });
      this.calloutOverlay.appendChild(btn);
      this.calloutElements.push(btn);
    }
  }

  private rebuildPinOverlay(): void {
    this.pinOverlay.innerHTML = '';
    this.pinElements.clear();

    if (this.activeTopic === 'circuits') {
      const pins = this.store.getPinsForTopology(this.activeTopology);
      for (const pin of pins) {
        const btn = document.createElement('button');
        btn.className = 'scene-pin-marker';
        btn.style.borderColor = PIN_COLOR_HEX[pin.color];
        btn.innerHTML = `<span class="pin-dot" style="background:${PIN_COLOR_HEX[pin.color]}"></span><span class="pin-text">${this.escapeHtml(pin.title)}</span>`;

        btn.addEventListener('mouseenter', (e) => {
          this.callbacks.onHoverCallout(pin.targetKind, e.clientX, e.clientY, pin.s);
        });
        btn.addEventListener('mouseleave', () => {
          this.callbacks.onLeaveCallout();
        });
        btn.addEventListener('click', () => {
          this.callbacks.onTeleport(pin.s);
          this.openPinEditor(pin.id, false);
        });

        this.pinOverlay.appendChild(btn);
        this.pinElements.set(pin.id, btn);
      }
      return;
    }

    const wPins = this.store.getWorldPinsForChapter(this.activeTopic, this.activeChapterId);
    for (const pin of wPins) {
      const btn = document.createElement('button');
      btn.className = 'scene-pin-marker';
      btn.style.borderColor = PIN_COLOR_HEX[pin.color];
      btn.innerHTML = `<span class="pin-dot" style="background:${PIN_COLOR_HEX[pin.color]}"></span><span class="pin-text">${this.escapeHtml(pin.title)}</span>`;
      btn.addEventListener('click', () => {
        this.openPinEditor(pin.id, true);
      });
      this.pinOverlay.appendChild(btn);
      this.pinElements.set(pin.id, btn);
    }
  }

  private openPinEditor(pinId: string, isWorldPin: boolean): void {
    const pin = isWorldPin
      ? this.store.getAllWorldPins().find((p) => p.id === pinId)
      : this.store.getAllPins().find((p) => p.id === pinId);
    if (!pin) return;
    this.editingPinId = pinId;
    this.editingIsWorldPin = isWorldPin;

    const colors: PinColor[] = ['cyan', 'gold', 'magenta', 'emerald'];
    this.pinEditor.innerHTML = `
      <div class="pin-editor-head">
        <span>Edit Study Pin</span>
        <button id="pin-ed-close" class="mini-icon-btn" title="Close">✕</button>
      </div>
      <input id="pin-ed-title" class="pin-input" type="text" value="${this.escapeAttr(pin.title)}" placeholder="Pin title" />
      <textarea id="pin-ed-note" class="pin-textarea" rows="3" placeholder="Your observation or note...">${this.escapeHtml(pin.note)}</textarea>
      <div class="pin-color-row">
        ${colors
          .map(
            (c) =>
              `<button class="pin-color-dot ${pin.color === c ? 'active' : ''}" data-color="${c}" style="background:${PIN_COLOR_HEX[c]}"></button>`,
          )
          .join('')}
        <button id="pin-ed-del" class="chip-btn danger-btn">Delete</button>
      </div>
    `;
    this.pinEditor.classList.remove('hidden');

    const titleInput = document.getElementById('pin-ed-title') as HTMLInputElement;
    const noteInput = document.getElementById('pin-ed-note') as HTMLTextAreaElement;
    const closeBtn = document.getElementById('pin-ed-close') as HTMLButtonElement;
    const delBtn = document.getElementById('pin-ed-del') as HTMLButtonElement;

    titleInput.addEventListener('input', () => {
      if (!this.editingPinId) return;
      const t = titleInput.value || 'Untitled Pin';
      if (this.editingIsWorldPin) this.store.updateWorldPin(this.editingPinId, { title: t });
      else this.store.updatePin(this.editingPinId, { title: t });
      this.rebuildPinOverlay();
      this.rebuildMarksList();
      this.callbacks.onPinsChanged();
    });

    noteInput.addEventListener('input', () => {
      if (!this.editingPinId) return;
      if (this.editingIsWorldPin) this.store.updateWorldPin(this.editingPinId, { note: noteInput.value });
      else this.store.updatePin(this.editingPinId, { note: noteInput.value });
      this.rebuildMarksList();
    });

    for (const dot of Array.from(this.pinEditor.querySelectorAll<HTMLButtonElement>('.pin-color-dot'))) {
      dot.addEventListener('click', () => {
        if (!this.editingPinId) return;
        const c = dot.dataset.color as PinColor;
        if (this.editingIsWorldPin) this.store.updateWorldPin(this.editingPinId, { color: c });
        else this.store.updatePin(this.editingPinId, { color: c });
        this.openPinEditor(this.editingPinId, this.editingIsWorldPin);
        this.rebuildPinOverlay();
        this.rebuildMarksList();
        this.callbacks.onPinsChanged();
      });
    }

    delBtn.addEventListener('click', () => {
      if (!this.editingPinId) return;
      if (this.editingIsWorldPin) this.store.deleteWorldPin(this.editingPinId);
      else this.store.deletePin(this.editingPinId);
      this.closePinEditor();
      this.rebuildPinOverlay();
      this.rebuildMarksList();
      this.callbacks.onPinsChanged();
    });

    closeBtn.addEventListener('click', () => this.closePinEditor());
  }

  public closePinEditor(): void {
    this.editingPinId = null;
    this.pinEditor.classList.add('hidden');
  }

  public rebuildMarksList(): void {
    const cPins = this.store.getAllPins();
    const wPins = this.store.getAllWorldPins();
    const total = cPins.length + wPins.length;
    this.pinsCountBadge.textContent = String(total);

    if (total === 0) {
      this.marksListEl.innerHTML = `
        <div class="empty-marks">
          <strong>No Study Pins Yet</strong>
          <p>Tap <b>Mark [M]</b> in the top bar (or <b>Shift + Click</b>) on any 3D object or circuit wire to save a note pin.</p>
        </div>
      `;
      return;
    }

    this.marksListEl.innerHTML = '';

    for (const pin of cPins) {
      const card = document.createElement('div');
      card.className = 'mark-card';
      card.style.borderLeftColor = PIN_COLOR_HEX[pin.color];
      card.innerHTML = `
        <div class="mark-card-top">
          <span class="mark-title">${this.escapeHtml(pin.title)}</span>
          <span class="mark-topo-tag">VOL I · ${pin.topology}</span>
        </div>
        <p class="mark-note-preview">${this.escapeHtml(pin.note)}</p>
        <div class="mark-actions">
          <button class="chip-btn mark-jump">Jump</button>
          <button class="chip-btn mark-edit">Edit</button>
          <button class="chip-btn danger-btn mark-del">Delete</button>
        </div>
      `;

      const jumpBtn = card.querySelector('.mark-jump') as HTMLButtonElement;
      jumpBtn.disabled = this.activeTopic !== 'circuits' || pin.topology !== this.activeTopology;
      jumpBtn.addEventListener('click', () => {
        if (this.activeTopic === 'circuits' && pin.topology === this.activeTopology) {
          this.callbacks.onTeleport(pin.s);
        }
      });

      (card.querySelector('.mark-edit') as HTMLButtonElement).addEventListener('click', () => {
        this.openPinEditor(pin.id, false);
      });
      (card.querySelector('.mark-del') as HTMLButtonElement).addEventListener('click', () => {
        if (this.editingPinId === pin.id) this.closePinEditor();
        this.store.deletePin(pin.id);
        this.rebuildPinOverlay();
        this.rebuildMarksList();
        this.callbacks.onPinsChanged();
      });

      this.marksListEl.appendChild(card);
    }

    for (const pin of wPins) {
      const card = document.createElement('div');
      card.className = 'mark-card';
      card.style.borderLeftColor = PIN_COLOR_HEX[pin.color];
      card.innerHTML = `
        <div class="mark-card-top">
          <span class="mark-title">${this.escapeHtml(pin.title)}</span>
          <span class="mark-topo-tag">${pin.topicId.toUpperCase()}</span>
        </div>
        <p class="mark-note-preview">${this.escapeHtml(pin.note)}</p>
        <div class="mark-actions">
          <button class="chip-btn mark-edit">Edit</button>
          <button class="chip-btn danger-btn mark-del">Delete</button>
        </div>
      `;
      (card.querySelector('.mark-edit') as HTMLButtonElement).addEventListener('click', () => {
        this.openPinEditor(pin.id, true);
      });
      (card.querySelector('.mark-del') as HTMLButtonElement).addEventListener('click', () => {
        if (this.editingPinId === pin.id) this.closePinEditor();
        this.store.deleteWorldPin(pin.id);
        this.rebuildPinOverlay();
        this.rebuildMarksList();
        this.callbacks.onPinsChanged();
      });
      this.marksListEl.appendChild(card);
    }
  }

  public projectOverlays(
    camera: THREE.Camera,
    path: PathGeometry,
    cameraMode: CameraMode,
    viewportW: number,
    viewportH: number,
  ): void {
    const pins = this.store.getPinsForTopology(this.activeTopology);
    for (const pin of pins) {
      const el = this.pinElements.get(pin.id);
      if (!el) continue;
      const frame = path.sampleFrame(pin.s);
      this.tmpWorld.copy(frame.pos).addScaledVector(frame.binormal, frame.tubeRadius + 0.65);
      this.positionOverlayEl(el, camera, viewportW, viewportH, 80);
    }

    const showCallouts =
      this.showLabels && (cameraMode === 'macro-overview' || cameraMode === 'side-cutaway');
    for (let i = 0; i < this.calloutDefs.length; i++) {
      const def = this.calloutDefs[i];
      const el = this.calloutElements[i];
      if (!el) continue;
      if (!showCallouts) {
        el.style.display = 'none';
        continue;
      }
      const frame = path.sampleFrame(def.s);
      this.tmpWorld.copy(frame.pos);
      this.tmpWorld.y += frame.tubeRadius + 1.35;
      this.positionOverlayEl(el, camera, viewportW, viewportH, 40);
    }
  }

  public projectLabOverlays(
    camera: THREE.Camera,
    callouts: LabCalloutPoint[],
    viewportW: number,
    viewportH: number,
  ): void {
    if (this.activeTopic === 'circuits') return;

    // 1. Project world pins
    const wPins = this.store.getWorldPinsForChapter(this.activeTopic, this.activeChapterId);
    for (const pin of wPins) {
      const el = this.pinElements.get(pin.id);
      if (!el) continue;
      this.tmpWorld.set(pin.x, pin.y + 0.45, pin.z);
      this.positionOverlayEl(el, camera, viewportW, viewportH, 80);
    }

    // 2. Sync & project dynamic lab callouts
    const activeIds = new Set(callouts.map((c) => c.id));
    for (const [id, el] of this.labCalloutElements.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.labCalloutElements.delete(id);
      }
    }

    for (const c of callouts) {
      let el = this.labCalloutElements.get(c.id);
      if (!el) {
        el = document.createElement('button');
        el.className = 'scene-callout';
        el.textContent = c.label;
        el.style.borderColor = `${c.accent}66`;
        el.addEventListener('mouseenter', (e) => {
          this.callbacks.onHoverLabCallout(c.hover, e.clientX, e.clientY);
        });
        el.addEventListener('mouseleave', () => {
          this.callbacks.onLeaveCallout();
        });
        el.addEventListener('click', (e) => {
          this.callbacks.onHoverLabCallout(c.hover, e.clientX, e.clientY);
        });
        this.calloutOverlay.appendChild(el);
        this.labCalloutElements.set(c.id, el);
      }

      if (!this.showLabels) {
        el.style.display = 'none';
        continue;
      }
      this.tmpWorld.set(c.x, c.y, c.z);
      this.positionOverlayEl(el, camera, viewportW, viewportH, 60);
    }
  }

  private positionOverlayEl(
    el: HTMLElement,
    camera: THREE.Camera,
    viewportW: number,
    viewportH: number,
    margin: number,
  ): void {
    this.tmpNdc.copy(this.tmpWorld).project(camera);
    if (this.tmpNdc.z > 1 || this.tmpNdc.z < -1) {
      el.style.display = 'none';
      return;
    }
    const x = (this.tmpNdc.x * 0.5 + 0.5) * viewportW;
    const y = (-this.tmpNdc.y * 0.5 + 0.5) * viewportH;
    if (x < -margin || x > viewportW + margin || y < 50 || y > viewportH + margin) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'inline-flex';
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private escapeAttr(str: string): string {
    return this.escapeHtml(str).replace(/"/g, '&quot;');
  }
}
