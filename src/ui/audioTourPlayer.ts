import { getAudioTourForVolume, type AudioTourCue, type VolumeAudioTour } from '../data/audioTours';
import type { TopicId } from '../types/simulation';

export interface AudioTourSnapshot {
  active: boolean;
  playing: boolean;
  muted: boolean;
  rate: number;
  topicId: TopicId | null;
  volumeTitle: string;
  cueIndex: number;
  totalCues: number;
  cue: AudioTourCue | null;
  speechSupported: boolean;
}

export interface AudioTourCallbacks {
  onCueStart?: (topicId: TopicId, cue: AudioTourCue, index: number, total: number) => void;
  onStateChange?: (snapshot: AudioTourSnapshot) => void;
}

const PLAYBACK_RATES = [1.0, 1.25, 1.5, 0.85] as const;

/**
 * Headless state machine for synchronized volume audio tours.
 * Safe in Node/Vitest environments where `window` and `speechSynthesis` are absent.
 */
export class AudioTourController {
  private readonly callbacks: AudioTourCallbacks;
  private active = false;
  private playing = false;
  private muted = false;
  private rate = 1.0;
  private tour: VolumeAudioTour | null = null;
  private cueIndex = 0;
  private runToken = 0;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: AudioTourCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public isSpeechSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  public startVolume(topicId: TopicId, startIndex = 0): void {
    const tour = getAudioTourForVolume(topicId);
    this.tour = tour;
    this.active = true;
    this.playing = true;
    const clamped = Math.max(0, Math.min(startIndex, Math.max(0, tour.cues.length - 1)));
    this.cueIndex = clamped;
    this.runCurrentCue(true);
  }

  public pause(): void {
    if (!this.active || !this.playing) return;
    this.playing = false;
    this.runToken += 1;
    this.clearTimers();
    this.cancelSpeech();
    this.emitState();
  }

  public resume(): void {
    if (!this.active || !this.tour || this.playing) return;
    this.playing = true;
    this.runCurrentCue(true);
  }

  public togglePlayPause(): void {
    if (!this.active) {
      if (this.tour) {
        this.startVolume(this.tour.topicId, this.cueIndex);
      }
      return;
    }
    if (this.playing) {
      this.pause();
    } else {
      this.resume();
    }
  }

  public next(): void {
    if (!this.tour || this.tour.cues.length === 0) return;
    this.cueIndex = (this.cueIndex + 1) % this.tour.cues.length;
    this.runCurrentCue(true);
  }

  public prev(): void {
    if (!this.tour || this.tour.cues.length === 0) return;
    this.cueIndex = Math.max(0, this.cueIndex - 1);
    this.runCurrentCue(true);
  }

  public setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (this.active && this.playing) {
      this.runToken += 1;
      this.clearTimers();
      this.cancelSpeech();
      if (muted) {
        const cue = this.getCurrentCue();
        if (cue) this.scheduleFallbackAdvance(cue, this.runToken);
      } else {
        this.speakOrSchedule(this.runToken);
      }
    }
    this.emitState();
  }

  public toggleMute(): void {
    this.setMuted(!this.muted);
  }

  public cycleRate(): number {
    const idx = PLAYBACK_RATES.indexOf(this.rate as (typeof PLAYBACK_RATES)[number]);
    const nextIdx = (idx + 1) % PLAYBACK_RATES.length;
    this.rate = PLAYBACK_RATES[nextIdx];
    if (this.active && this.playing) {
      this.runCurrentCue(false);
    } else {
      this.emitState();
    }
    return this.rate;
  }

  public stop(): void {
    this.runToken += 1;
    this.active = false;
    this.playing = false;
    this.clearTimers();
    this.cancelSpeech();
    this.emitState();
  }

  public destroy(): void {
    this.stop();
  }

  public getSnapshot(): AudioTourSnapshot {
    const cue = this.getCurrentCue();
    return {
      active: this.active,
      playing: this.playing,
      muted: this.muted,
      rate: this.rate,
      topicId: this.tour?.topicId ?? null,
      volumeTitle: this.tour?.title ?? '',
      cueIndex: this.cueIndex,
      totalCues: this.tour?.cues.length ?? 0,
      cue,
      speechSupported: this.isSpeechSupported(),
    };
  }

  private getCurrentCue(): AudioTourCue | null {
    if (!this.tour) return null;
    return this.tour.cues[this.cueIndex] ?? null;
  }

  private runCurrentCue(triggerCueCallback: boolean): void {
    if (!this.tour) return;
    const cue = this.getCurrentCue();
    if (!cue) return;

    this.runToken += 1;
    const token = this.runToken;
    this.clearTimers();
    this.cancelSpeech();

    if (triggerCueCallback) {
      this.callbacks.onCueStart?.(
        this.tour.topicId,
        cue,
        this.cueIndex,
        this.tour.cues.length
      );
    }

    this.emitState();

    if (this.playing) {
      this.speakOrSchedule(token);
    }
  }

  private speakOrSchedule(token: number): void {
    const cue = this.getCurrentCue();
    if (!cue || token !== this.runToken || !this.playing) return;

    if (!this.muted && this.isSpeechSupported()) {
      try {
        const utterance = new SpeechSynthesisUtterance(cue.narration);
        utterance.lang = 'en-US';
        utterance.rate = this.rate;

        utterance.onend = () => {
          if (token !== this.runToken || !this.playing) return;
          this.advanceAfterCue();
        };

        utterance.onerror = () => {
          if (token !== this.runToken || !this.playing) return;
          // Fallback to reading timer if speech synthesis is blocked/unavailable at runtime
          this.scheduleFallbackAdvance(cue, token);
        };

        window.speechSynthesis.speak(utterance);
        return;
      } catch {
        // Fall through to timed caption advance
      }
    }

    this.scheduleFallbackAdvance(cue, token);
  }

  private scheduleFallbackAdvance(cue: AudioTourCue, token: number): void {
    const words = cue.narration.trim().split(/\s+/).filter(Boolean).length;
    const baseMs = Math.max(cue.minDurationMs ?? 3200, Math.round((words / 2.6) * 1000 + 1100));
    const delayMs = Math.max(900, Math.round(baseMs / this.rate));

    this.fallbackTimer = setTimeout(() => {
      if (token !== this.runToken || !this.playing) return;
      this.advanceAfterCue();
    }, delayMs);
  }

  private advanceAfterCue(): void {
    if (!this.tour) return;
    if (this.cueIndex + 1 < this.tour.cues.length) {
      this.cueIndex += 1;
      this.runCurrentCue(true);
    } else {
      // Completed final cue cleanly; stay visible so learner sees final state
      this.runToken += 1;
      this.playing = false;
      this.clearTimers();
      this.emitState();
    }
  }

  private clearTimers(): void {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private cancelSpeech(): void {
    if (!this.isSpeechSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore Web Speech cancel quirks in restricted contexts
    }
  }

  private emitState(): void {
    this.callbacks.onStateChange?.(this.getSnapshot());
  }
}

export class AudioTourDockUI {
  private readonly controller: AudioTourController;
  private readonly bar = document.getElementById('audio-tour-bar') as HTMLElement;
  private readonly badge = document.getElementById('tour-volume-badge') as HTMLElement;
  private readonly titleEl = document.getElementById('tour-cue-title') as HTMLElement;
  private readonly stepEl = document.getElementById('tour-step-pill') as HTMLElement;
  private readonly actionEl = document.getElementById('tour-action-pill') as HTMLElement;
  private readonly captionEl = document.getElementById('tour-caption') as HTMLElement;
  private readonly prevBtn = document.getElementById('tour-prev-btn') as HTMLButtonElement;
  private readonly playBtn = document.getElementById('tour-play-btn') as HTMLButtonElement;
  private readonly nextBtn = document.getElementById('tour-next-btn') as HTMLButtonElement;
  private readonly muteBtn = document.getElementById('tour-mute-btn') as HTMLButtonElement;
  private readonly rateBtn = document.getElementById('tour-rate-btn') as HTMLButtonElement;
  private readonly closeBtn = document.getElementById('tour-close-btn') as HTMLButtonElement;

  constructor(callbacks: AudioTourCallbacks = {}) {
    this.controller = new AudioTourController({
      onCueStart: callbacks.onCueStart,
      onStateChange: (snapshot) => {
        this.render(snapshot);
        callbacks.onStateChange?.(snapshot);
      },
    });
    this.bindEvents();
  }

  public startVolume(topicId: TopicId, startIndex = 0): void {
    this.controller.startVolume(topicId, startIndex);
  }

  public toggleForTopic(topicId: TopicId): void {
    const snap = this.controller.getSnapshot();
    if (snap.active && snap.topicId === topicId) {
      this.controller.stop();
    } else {
      this.controller.startVolume(topicId, 0);
    }
  }

  public stop(): void {
    this.controller.stop();
  }

  public isActive(): boolean {
    return this.controller.getSnapshot().active;
  }

  private bindEvents(): void {
    this.prevBtn.addEventListener('click', () => this.controller.prev());
    this.playBtn.addEventListener('click', () => this.controller.togglePlayPause());
    this.nextBtn.addEventListener('click', () => this.controller.next());
    this.muteBtn.addEventListener('click', () => this.controller.toggleMute());
    this.rateBtn.addEventListener('click', () => this.controller.cycleRate());
    this.closeBtn.addEventListener('click', () => this.controller.stop());
  }

  private render(snapshot: AudioTourSnapshot): void {
    if (!snapshot.active || !snapshot.cue) {
      this.bar.classList.add('hidden');
      this.bar.classList.remove('speaking');
      return;
    }

    this.bar.classList.remove('hidden');
    this.bar.classList.toggle('speaking', snapshot.playing && !snapshot.muted);

    const romanMatch = snapshot.volumeTitle.match(/Vol\.\s*[IVX]+/);
    this.badge.textContent = romanMatch ? romanMatch[0] : 'Tour';
    this.titleEl.textContent = snapshot.cue.title;
    this.stepEl.textContent = `${snapshot.cueIndex + 1} / ${snapshot.totalCues}`;
    this.actionEl.textContent = `⚡ ${snapshot.cue.actionLabel}`;
    this.captionEl.textContent = snapshot.cue.narration;

    this.playBtn.textContent = snapshot.playing ? '⏸ Pause' : '▶ Play';
    this.playBtn.title = snapshot.playing ? 'Pause Tour' : 'Resume Tour';

    this.muteBtn.textContent = snapshot.muted ? '🔇' : '🔊';
    this.muteBtn.title = snapshot.muted
      ? 'Unmute Spoken Audio'
      : 'Mute Voice (Keep Timed Captions)';

    const rateStr = Number.isInteger(snapshot.rate) ? `${snapshot.rate}×` : `${snapshot.rate}×`;
    this.rateBtn.textContent = rateStr;
  }
}
