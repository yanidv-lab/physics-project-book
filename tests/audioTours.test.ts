import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAudioTourForVolume, VOLUME_AUDIO_TOURS } from '../src/data/audioTours';
import { BOOK_VOLUMES } from '../src/data/bookCatalog';
import { AudioTourController, pickBestSpeechVoice } from '../src/ui/audioTourPlayer';

describe('Synchronized Volume Audio Tours', () => {
  it('provides a complete choreographed tour with generated neural MP3s for every volume', () => {
    expect(VOLUME_AUDIO_TOURS.length).toBe(BOOK_VOLUMES.length);
    const audioDir = path.resolve(__dirname, '../public/audio/tours');

    for (const vol of BOOK_VOLUMES) {
      const tour = getAudioTourForVolume(vol.id);
      expect(tour.topicId).toBe(vol.id);
      expect(tour.cues.length).toBeGreaterThanOrEqual(4);

      const validChapterIds = new Set(vol.chapters.map((c) => c.id));
      for (const cue of tour.cues) {
        expect(validChapterIds.has(cue.chapterId)).toBe(true);
        expect(cue.title.trim().length).toBeGreaterThan(2);
        expect(cue.actionLabel.trim().length).toBeGreaterThan(3);
        expect(cue.narration.trim().split(/\s+/).length).toBeGreaterThanOrEqual(8);

        const mp3Path = path.join(audioDir, `${cue.id}.mp3`);
        expect(fs.existsSync(mp3Path), `Missing neural audio clip: ${mp3Path}`).toBe(true);
        expect(fs.statSync(mp3Path).size).toBeGreaterThan(5000);

        if (vol.id === 'circuits' && cue.apply) {
          const a = cue.apply as Record<string, unknown>;
          if (typeof a.voltage === 'number') {
            expect(a.voltage).toBeGreaterThanOrEqual(0);
            expect(a.voltage).toBeLessThanOrEqual(12);
          }
          if (typeof a.temperature === 'number') {
            expect(a.temperature).toBeGreaterThanOrEqual(10);
            expect(a.temperature).toBeLessThanOrEqual(800);
          }
          if (typeof a.resistance === 'number') {
            expect(a.resistance).toBeGreaterThanOrEqual(1);
            expect(a.resistance).toBeLessThanOrEqual(1000);
          }
        }
      }
    }
  });

  it('prefers natural/neural speech synthesis voices over legacy desktop voices', () => {
    const picked = pickBestSpeechVoice([
      {
        name: 'Microsoft David Desktop - English (United States)',
        lang: 'en-US',
        localService: true,
        default: true,
      },
      {
        name: 'Microsoft Zira Desktop - English (United States)',
        lang: 'en-US',
        localService: true,
        default: false,
      },
      {
        name: 'Google US English',
        lang: 'en-US',
        localService: false,
        default: false,
      },
      {
        name: 'Microsoft Andrew Online (Natural) - English (United States)',
        lang: 'en-US',
        localService: false,
        default: false,
      },
    ]);

    expect(picked?.name).toBe('Microsoft Andrew Online (Natural) - English (United States)');

    const fallbackGoogle = pickBestSpeechVoice([
      {
        name: 'Microsoft Zira Desktop - English (United States)',
        lang: 'en-US',
        localService: true,
        default: true,
      },
      {
        name: 'Google US English',
        lang: 'en-US',
        localService: false,
        default: false,
      },
    ]);

    expect(fallbackGoogle?.name).toBe('Google US English');
  });

  it('controls playback transitions, rate cycling, mute state, and stops cleanly', () => {
    const triggeredCues: string[] = [];
    const controller = new AudioTourController({
      onCueStart: (_topicId, cue) => {
        triggeredCues.push(cue.id);
      },
    });

    controller.startVolume('em');
    let snap = controller.getSnapshot();
    expect(snap.active).toBe(true);
    expect(snap.playing).toBe(true);
    expect(snap.topicId).toBe('em');
    expect(snap.cueIndex).toBe(0);
    expect(triggeredCues).toEqual([VOLUME_AUDIO_TOURS[1].cues[0].id]);

    controller.next();
    snap = controller.getSnapshot();
    expect(snap.cueIndex).toBe(1);
    expect(triggeredCues.length).toBe(2);

    controller.prev();
    snap = controller.getSnapshot();
    expect(snap.cueIndex).toBe(0);

    controller.pause();
    expect(controller.getSnapshot().playing).toBe(false);
    expect(controller.getSnapshot().active).toBe(true);

    controller.resume();
    expect(controller.getSnapshot().playing).toBe(true);

    controller.setMuted(true);
    expect(controller.getSnapshot().muted).toBe(true);

    const nextRate = controller.cycleRate();
    expect(nextRate).toBe(1.25);

    controller.stop();
    snap = controller.getSnapshot();
    expect(snap.active).toBe(false);
    expect(snap.playing).toBe(false);
  });
});
