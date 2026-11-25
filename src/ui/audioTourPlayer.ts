import { getAudioTourForVolume, type AudioTourCue, type VolumeAudioTour } from '../data/audioTours';
import type { TopicId } from '../types/simulation';

export type AudioPlaybackMode = 'neural-mp3' | 'speech' | 'captions';

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
  audioMode: AudioPlaybackMode;
}

export interface AudioTourCallbacks {
  onCueStart?: (topicId: TopicId, cue: AudioTourCue, index: number, total: number) => void;
  onStateChange?: (snapshot: AudioTourSnapshot) => void;
}

export type SpeechVoiceLike = Pick<
  SpeechSynthesisVoice,
  'name' | 'lang' | 'localService' | 'default'
>;

const PLAYBACK_RATES = [1.0, 1.25, 1.5, 0.85] as const;

/**
 * Ranks available browser SpeechSynthesis voices so realistic neural/natural
 * voices beat robotic legacy desktop voices when used as offline fallback.
 */
export function pickBestSpeechVoice(
  voices: ReadonlyArray<SpeechVoiceLike>,
): SpeechVoiceLike | null {
  if (!voices.length) return null;

  const scoreVoice = (v: SpeechVoiceLike): number => {
    const lang = v.lang.toLowerCase();
    const name = v.name.toLowerCase();
    let score = 0;

    if (lang === 'en-us') score += 40;
    else if (lang.startsWith('en-gb') || lang.startsWith('en-au') || lang.startsWith('en-ca')) {
      score += 32;
    } else if (lang.startsWith('en')) {
      score += 24;
    } else {
      return -1000;
    }

    if (/natural|neural|multilingual|online/.test(name)) score += 100;
    if (/google\s+(us|uk)\s+english/.test(name)) score += 85;
    else if (/google/.test(name)) score += 70;
    if (/premium|enhanced|siri|ava|andrew|emma|brian|samantha|daniel|aria/.test(name)) {
      score += 75;
    }
    if (!v.localService) score += 12;
    if (/microsoft\s+(david|zira|mark)|espeak|festival/.test(name)) score -= 60;
    if (v.default) score += 2;

    return score;
  };

  let best: SpeechVoiceLike | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const s = scoreVoice(voice);
    if (s > bestScore) {
      bestScore = s;
      best = voice;
    }
  }
  return bestScore > -500 ? best : null;
}

/**
 * Headless state machine for synchronized volume audio tours.
 * Plays studio-quality neural MP3 narration first, falling back to the best
 * available Web Speech voice or reading-pace captions when offline/headless.
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
  private audioMode: AudioPlaybackMode = 'captions';
  private audioEl: HTMLAudioElement | null = null;
  private preloadEl: HTMLAudioElement | null = null;
  private pausedAudioCueId: string | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: AudioTourCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public isNeuralAudioSupported(): boolean {
    return typeof Audio !== 'undefined';
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

    const cue = this.getCurrentCue();
    if (this.audioMode === 'neural-mp3' && this.audioEl) {
      this.audioEl.onended = null;
      this.audioEl.onerror = null;
      this.audioEl.pause();
      this.pausedAudioCueId = cue?.id ?? null;
    } else {
      this.cancelSpeech();
      this.pausedAudioCueId = null;
    }

    this.emitState();
  }

  public resume(): void {
    if (!this.active || !this.tour || this.playing) return;
    this.playing = true;

    const cue = this.getCurrentCue();
    if (
      this.audioMode === 'neural-mp3' &&
      this.audioEl &&
      cue &&
      this.pausedAudioCueId === cue.id
    ) {
      this.runToken += 1;
      const token = this.runToken;
      this.pausedAudioCueId = null;
      this.attachAudioHandlers(this.audioEl, token);
      this.syncAudioElementProperties(this.audioEl);
      this.emitState();

      try {
        const playPromise = this.audioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (token !== this.runToken || !this.playing) return;
            this.speakOrSchedule(token);
          });
        }
        return;
      } catch {
        // Fall through to full cue playback
      }
    }

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

    if (this.audioMode === 'neural-mp3' && this.audioEl) {
      this.audioEl.muted = muted;
      this.emitState();
      return;
    }

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

    if (this.active && this.audioMode === 'neural-mp3' && this.audioEl) {
      this.audioEl.playbackRate = this.rate;
      this.emitState();
      return this.rate;
    }

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
    this.pausedAudioCueId = null;
    this.clearTimers();
    this.stopActiveAudioElement(true);
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
      audioMode: this.audioMode,
    };
  }

  private getCurrentCue(): AudioTourCue | null {
    if (!this.tour) return null;
    return this.tour.cues[this.cueIndex] ?? null;
  }

  private getClipUrl(cue: AudioTourCue): string {
    return cue.audioUrl ?? `./audio/tours/${cue.id}.mp3`;
  }

  private ensureAudioElement(): HTMLAudioElement | null {
    if (!this.isNeuralAudioSupported()) return null;
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.preload = 'auto';
    }
    return this.audioEl;
  }

  private attachAudioHandlers(el: HTMLAudioElement, token: number): void {
    el.onended = () => {
      if (token !== this.runToken || !this.playing) return;
      this.pausedAudioCueId = null;
      this.advanceAfterCue();
    };
    el.onerror = () => {
      if (token !== this.runToken || !this.playing) return;
      this.pausedAudioCueId = null;
      this.speakOrSchedule(token);
    };
  }

  private syncAudioElementProperties(el: HTMLAudioElement): void {
    el.muted = this.muted;
    el.playbackRate = this.rate;
    (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }

  private stopActiveAudioElement(resetTime: boolean): void {
    if (!this.audioEl) return;
    this.audioEl.onended = null;
    this.audioEl.onerror = null;
    this.audioEl.pause();
    if (resetTime) {
      try {
        this.audioEl.currentTime = 0;
      } catch {
        // Ignore if no media loaded yet
      }
    }
  }

  private preloadNextCue(): void {
    if (!this.isNeuralAudioSupported() || !this.tour) return;
    const nextCue = this.tour.cues[this.cueIndex + 1];
    if (!nextCue) return;
    if (!this.preloadEl) {
      this.preloadEl = new Audio();
      this.preloadEl.preload = 'auto';
    }
    const nextUrl = this.getClipUrl(nextCue);
    const tail = nextUrl.replace(/^\.\//, '/');
    if (!this.preloadEl.src.endsWith(tail)) {
      this.preloadEl.src = nextUrl;
      this.preloadEl.load();
    }
  }

  private runCurrentCue(triggerCueCallback: boolean): void {
    if (!this.tour) return;
    const cue = this.getCurrentCue();
    if (!cue) return;

    this.runToken += 1;
    const token = this.runToken;
    this.pausedAudioCueId = null;
    this.clearTimers();
    this.stopActiveAudioElement(true);
    this.cancelSpeech();

    if (this.isNeuralAudioSupported()) {
      this.audioMode = 'neural-mp3';
    } else if (!this.muted && this.isSpeechSupported()) {
      this.audioMode = 'speech';
    } else {
      this.audioMode = 'captions';
    }

    if (triggerCueCallback) {
      this.callbacks.onCueStart?.(
        this.tour.topicId,
        cue,
        this.cueIndex,
        this.tour.cues.length,
      );
    }

    this.emitState();

    if (this.playing) {
      this.playCurrentCueAudio(token);
    }
  }

  private playCurrentCueAudio(token: number): void {
    const cue = this.getCurrentCue();
    if (!cue || token !== this.runToken || !this.playing) return;

    const el = this.ensureAudioElement();
    if (el) {
      this.audioMode = 'neural-mp3';
      this.attachAudioHandlers(el, token);
      this.syncAudioElementProperties(el);
      el.src = this.getClipUrl(cue);
      el.currentTime = 0;
      this.preloadNextCue();

      try {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (token !== this.runToken || !this.playing) return;
            this.pausedAudioCueId = null;
            this.speakOrSchedule(token);
          });
        }
        return;
      } catch {
        // Fall through to speechSynthesis / captions
      }
    }

    this.speakOrSchedule(token);
  }

  private speakOrSchedule(token: number): void {
    const cue = this.getCurrentCue();
    if (!cue || token !== this.runToken || !this.playing) return;

    if (!this.muted && this.isSpeechSupported()) {
      try {
        this.audioMode = 'speech';
        this.emitState();

        const utterance = new SpeechSynthesisUtterance(cue.narration);
        utterance.lang = 'en-US';
        utterance.rate = this.rate;

        const voices = window.speechSynthesis.getVoices?.() ?? [];
        const bestVoice = pickBestSpeechVoice(voices);
        if (bestVoice) {
          utterance.voice = bestVoice as SpeechSynthesisVoice;
        }

        utterance.onend = () => {
          if (token !== this.runToken || !this.playing) return;
          this.advanceAfterCue();
        };

        utterance.onerror = () => {
          if (token !== this.runToken || !this.playing) return;
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
    if (this.audioMode !== 'captions') {
      this.audioMode = 'captions';
      this.emitState();
    }
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
      this.pausedAudioCueId = null;
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

    const voiceSource =
      snapshot.audioMode === 'neural-mp3' ? 'Studio Neural Voice' : 'Browser Voice';
    this.muteBtn.textContent = snapshot.muted ? '🔇' : '🔊';
    this.muteBtn.title = snapshot.muted
      ? `Unmute ${voiceSource}`
      : `Mute ${voiceSource} (Keep Timed Captions)`;

    this.rateBtn.textContent = `${snapshot.rate}×`;
  }
}
