import { describe, expect, it } from 'vitest';
import {
  PROJECT_CHAPTERS,
  SCENE_STUDY_NOTES,
  UI_STUDY_NOTES,
  resolveHeroAnchorS,
} from '../src/data/projectBook';
import { PathGeometry } from '../src/physics/pathGeometry';
import type { SegmentKind } from '../src/types/simulation';
import { NotebookStore } from '../src/ui/annotationsManager';

describe('Project Book Chapters, Study Notes & NotebookStore', () => {
  it('defines 10 unique chapters with valid bounds and safe hero anchors outside capacitor gaps', () => {
    expect(PROJECT_CHAPTERS.length).toBe(10);
    const ids = new Set<string>();

    for (const ch of PROJECT_CHAPTERS) {
      expect(ids.has(ch.id)).toBe(false);
      ids.add(ch.id);

      expect(['simple-r', 'rc', 'rlc', 'divider']).toContain(ch.setup.topology);
      expect(ch.setup.voltage).toBeGreaterThanOrEqual(0);
      expect(ch.setup.voltage).toBeLessThanOrEqual(12);
      expect(ch.setup.resistance).toBeGreaterThanOrEqual(1);
      expect(ch.setup.resistance).toBeLessThanOrEqual(1000);
      expect(ch.setup.temperature).toBeGreaterThanOrEqual(10);
      expect(ch.setup.temperature).toBeLessThanOrEqual(800);
      expect(ch.setup.scaleCompression).toBeGreaterThanOrEqual(0);
      expect(ch.setup.scaleCompression).toBeLessThanOrEqual(1);
      expect(ch.watchFor.length).toBeGreaterThanOrEqual(2);

      const path = new PathGeometry(ch.setup.topology);
      const s = resolveHeroAnchorS(ch.setup.heroAnchor, path);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(path.totalLength);

      if (path.anchors.capGapStart !== null && path.anchors.capGapEnd !== null) {
        const insideGap = s >= path.anchors.capGapStart && s <= path.anchors.capGapEnd;
        expect(insideGap).toBe(false);
      }
    }

    const ch10 = PROJECT_CHAPTERS.find((c) => c.id === 'ch10-ac-wiggle');
    expect(ch10).toBeDefined();
    expect(ch10?.setup.sourceMode).toBe('ac');
  });

  it('covers all circuit segment kinds, corners, hero electron, and UI study notes', () => {
    const requiredKinds: Array<SegmentKind | 'corner' | 'hero'> = [
      'battery',
      'wire',
      'resistor',
      'resistor2',
      'capacitor',
      'inductor',
      'corner',
      'hero',
    ];

    for (const k of requiredKinds) {
      const note = SCENE_STUDY_NOTES[k];
      expect(note).toBeDefined();
      expect(note.simple.length).toBeGreaterThan(20);
      expect(note.deeper.length).toBeGreaterThan(20);
    }

    expect(UI_STUDY_NOTES.voltage).toBeDefined();
    expect(UI_STUDY_NOTES['tel-vdrift']).toBeDefined();
    expect(UI_STUDY_NOTES.oscilloscope).toBeDefined();
    expect(UI_STUDY_NOTES.minimap).toBeDefined();
  });

  it('supports CRUD, chapter progress, and Markdown export in NotebookStore in Node', () => {
    const store = new NotebookStore();

    const p1 = store.addPin('simple-r', 12.5, 'resistor', 'Hot Spot', 'Atoms shake fast here', 'gold');
    expect(store.getPinsForTopology('simple-r').some((p) => p.id === p1.id)).toBe(true);

    const updated = store.updatePin(p1.id, { title: 'Very Hot R1', color: 'magenta' });
    expect(updated?.title).toBe('Very Hot R1');
    expect(updated?.color).toBe('magenta');

    store.toggleChapterCompleted('ch2-bottleneck-heat');
    store.toggleChapterStarred('ch2-bottleneck-heat');
    expect(store.isChapterCompleted('ch2-bottleneck-heat')).toBe(true);
    expect(store.isChapterStarred('ch2-bottleneck-heat')).toBe(true);

    const md = store.exportMarkdown();
    expect(md).toContain('Very Hot R1');
    expect(md).toContain('ch2-bottleneck-heat');

    expect(store.deletePin(p1.id)).toBe(true);
    expect(store.getAllPins().some((p) => p.id === p1.id)).toBe(false);
  });
});
