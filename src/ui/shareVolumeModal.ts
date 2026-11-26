import { getVolumeById } from '../data/bookCatalog';
import type { TopicId } from '../types/simulation';

export interface ShareVolumeCallbacks {
  getActiveTopicId: () => TopicId;
  getActiveChapterId: () => string;
  getCanvas: () => HTMLCanvasElement;
  getAudioElement: () => HTMLAudioElement | null;
  onStartTourForRecording: (topicId: TopicId) => void;
  onStopTourAfterRecording: () => void;
  onEnterSoloMode: (topicId: TopicId) => void;
}

/**
 * Builds a clean standalone single-volume Screen-in-Screen share URL that
 * opens ONLY the selected volume with zero clutter for messaging app recipients.
 */
export function buildSoloVolumeShareUrl(topicId: TopicId, chapterId?: string, baseUrl?: string): string {
  const origin =
    baseUrl ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://yanidv-lab.github.io/physics-project-book/');
  const url = new URL(origin);
  url.searchParams.set('volume', topicId);
  if (chapterId) url.searchParams.set('chapter', chapterId);
  url.searchParams.set('solo', '1');
  return url.toString();
}

export class ShareVolumeModal {
  private readonly modal: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly linkInput: HTMLInputElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly nativeShareBtn: HTMLButtonElement;
  private readonly previewSoloBtn: HTMLButtonElement;
  private readonly recordBtn: HTMLButtonElement;
  private readonly shareVideoOnlyBtn: HTMLButtonElement;
  private readonly downloadVideoBtn: HTMLButtonElement;
  private readonly recordStatusEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly recPill: HTMLElement | null;
  private readonly recPillLabel: HTMLElement | null;
  private readonly recPillStopBtn: HTMLButtonElement | null;

  private readonly callbacks: ShareVolumeCallbacks;
  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private lastRecordedFile: File | null = null;
  private lastRecordedUrl: string | null = null;
  private recordTimer: number | null = null;
  private recordSeconds = 0;

  // Reuse one AudioContext + MediaElementAudioSourceNode per HTMLAudioElement
  private audioCtx: AudioContext | null = null;
  private audioSourceNode: MediaElementAudioSourceNode | null = null;
  private audioStreamDest: MediaStreamAudioDestinationNode | null = null;

  constructor(callbacks: ShareVolumeCallbacks) {
    this.callbacks = callbacks;
    this.modal = document.getElementById('share-volume-modal')!;
    this.titleEl = document.getElementById('share-vol-title')!;
    this.descEl = document.getElementById('share-vol-desc')!;
    this.linkInput = document.getElementById('share-solo-link-input') as HTMLInputElement;
    this.copyBtn = document.getElementById('share-copy-link-btn') as HTMLButtonElement;
    this.nativeShareBtn = document.getElementById('share-native-btn') as HTMLButtonElement;
    this.previewSoloBtn = document.getElementById('share-preview-solo-btn') as HTMLButtonElement;
    this.recordBtn = document.getElementById('share-record-vid-btn') as HTMLButtonElement;
    this.shareVideoOnlyBtn = document.getElementById('share-video-only-btn') as HTMLButtonElement;
    this.downloadVideoBtn = document.getElementById('share-download-vid-btn') as HTMLButtonElement;
    this.recordStatusEl = document.getElementById('share-record-status')!;
    this.closeBtn = document.getElementById('share-modal-close') as HTMLButtonElement;
    this.recPill = document.getElementById('recording-floating-pill');
    this.recPillLabel = document.getElementById('rec-pill-label');
    this.recPillStopBtn = document.getElementById('rec-pill-stop-btn') as HTMLButtonElement | null;

    this.closeBtn.addEventListener('click', () => this.hide());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    this.copyBtn.addEventListener('click', () => void this.copyLink());
    this.nativeShareBtn.addEventListener('click', () => void this.nativeShareLink());
    this.previewSoloBtn.addEventListener('click', () => {
      const topic = this.callbacks.getActiveTopicId();
      this.hide();
      this.callbacks.onEnterSoloMode(topic);
    });
    this.recordBtn.addEventListener('click', () => this.toggleRecording());
    this.recPillStopBtn?.addEventListener('click', () => this.stopRecording());
    this.shareVideoOnlyBtn.addEventListener('click', () => void this.shareRecordedVideoOnly());
    this.downloadVideoBtn.addEventListener('click', () => this.downloadRecordedVideo());
  }

  public show(): void {
    const topicId = this.callbacks.getActiveTopicId();
    const chapterId = this.callbacks.getActiveChapterId();
    const vol = getVolumeById(topicId);
    const shareUrl = buildSoloVolumeShareUrl(topicId, chapterId);

    this.titleEl.textContent = `Share ${vol.roman} · ${vol.title}`;
    this.descEl.textContent =
      'Send a clean single-volume Screen-in-Screen link, or record the full Audio + 3D Simulation video clip and share ONLY the recording.';
    this.linkInput.value = shareUrl;
    this.copyBtn.textContent = '📋 Copy Link';
    this.nativeShareBtn.classList.toggle('hidden', typeof navigator === 'undefined' || !('share' in navigator));
    this.modal.classList.remove('hidden');
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  public isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  /** Called automatically when the audio tour finishes so full-length audio recordings stop cleanly. */
  public onAudioTourFinished(): void {
    if (this.isRecording()) {
      this.stopRecording();
    }
  }

  private async copyLink(): Promise<void> {
    const url = this.linkInput.value;
    try {
      await navigator.clipboard.writeText(url);
      this.copyBtn.textContent = '✓ Copied!';
    } catch {
      this.linkInput.select();
      document.execCommand('copy');
      this.copyBtn.textContent = '✓ Copied!';
    }
    window.setTimeout(() => {
      this.copyBtn.textContent = '📋 Copy Link';
    }, 2000);
  }

  private async nativeShareLink(): Promise<void> {
    const vol = getVolumeById(this.callbacks.getActiveTopicId());
    try {
      await navigator.share({
        title: `${vol.roman}: ${vol.title} — 3D Physics`,
        text: `Explore ${vol.title} in interactive 3D with audio narration:`,
        url: this.linkInput.value,
      });
    } catch {
      // User dismissed share sheet
    }
  }

  public toggleRecording(): void {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private captureAudioTrack(): MediaStreamTrack | null {
    const audioEl = this.callbacks.getAudioElement();
    if (!audioEl) return null;
    try {
      const AudioCtxCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxCtor) return null;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxCtor();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      if (!this.audioSourceNode) {
        this.audioSourceNode = this.audioCtx.createMediaElementSource(audioEl);
        this.audioStreamDest = this.audioCtx.createMediaStreamDestination();
        // Send neural voice to BOTH speakers AND the video recorder stream!
        this.audioSourceNode.connect(this.audioCtx.destination);
        this.audioSourceNode.connect(this.audioStreamDest);
      }
      return this.audioStreamDest?.stream.getAudioTracks()[0] ?? null;
    } catch {
      return null;
    }
  }

  private formatSec(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  private startRecording(): void {
    const canvas = this.callbacks.getCanvas();
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      this.recordStatusEl.textContent = 'Video recording is not supported in this browser.';
      return;
    }

    const topicId = this.callbacks.getActiveTopicId();
    const videoStream = canvas.captureStream(30);
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
    const audioTrack = this.captureAudioTrack();
    if (audioTrack) tracks.push(audioTrack);

    const mimeCandidates = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

    const combined = new MediaStream(tracks);
    this.recordedChunks = [];
    this.shareVideoOnlyBtn.classList.add('hidden');
    this.downloadVideoBtn.classList.add('hidden');
    if (this.lastRecordedUrl) {
      URL.revokeObjectURL(this.lastRecordedUrl);
      this.lastRecordedUrl = null;
    }

    try {
      this.recorder = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 3_500_000 })
        : new MediaRecorder(combined);
    } catch {
      this.recordStatusEl.textContent = 'Could not initialize video recorder on this device.';
      return;
    }

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.recordedChunks.push(ev.data);
    };

    this.recorder.onstop = () => {
      const actualType = mimeType || 'video/webm';
      const ext = actualType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(this.recordedChunks, { type: actualType });
      const fileName = `physics-${topicId}-audio-sim.${ext}`;
      this.lastRecordedFile = new File([blob], fileName, { type: actualType });
      this.lastRecordedUrl = URL.createObjectURL(blob);

      this.recPill?.classList.add('hidden');
      this.recordBtn.textContent = '🎬 Record Full Audio-Sim Video';
      this.recordBtn.classList.remove('active');
      this.shareVideoOnlyBtn.classList.remove('hidden');
      this.downloadVideoBtn.classList.remove('hidden');
      this.recordStatusEl.textContent = `Ready (${this.formatSec(this.recordSeconds)} · ${(blob.size / 1024 / 1024).toFixed(1)} MB) — tap Share Video Only or Save!`;

      if (this.recordTimer !== null) {
        window.clearInterval(this.recordTimer);
        this.recordTimer = null;
      }
      this.recorder = null;
      this.callbacks.onStopTourAfterRecording();
      // Re-open share sheet so user can immediately tap "Share Video Only"
      this.show();
    };

    // Record the full length of the audio tour (auto-stops when tour ends, or on user tap!)
    this.recorder.start(500);
    this.recordSeconds = 0;
    this.recordBtn.textContent = '⏹ Stop Recording';
    this.recordBtn.classList.add('active');
    this.recPill?.classList.remove('hidden');
    if (this.recPillLabel) this.recPillLabel.textContent = '● REC 0:00 (Full Audio)';
    this.recordStatusEl.textContent = 'Recording full audio + 3D simulation…';

    this.hide();
    this.callbacks.onStartTourForRecording(topicId);

    this.recordTimer = window.setInterval(() => {
      this.recordSeconds += 1;
      const tStr = this.formatSec(this.recordSeconds);
      if (this.recPillLabel) this.recPillLabel.textContent = `● REC ${tStr} (Full Audio)`;
      this.recordStatusEl.textContent = `Recording full audio + 3D simulation… ${tStr}`;
    }, 1000);
  }

  public stopRecording(): void {
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
    }
  }

  private async shareRecordedVideoOnly(): Promise<void> {
    if (!this.lastRecordedFile) return;
    const vol = getVolumeById(this.callbacks.getActiveTopicId());
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [this.lastRecordedFile] })
    ) {
      try {
        await navigator.share({
          files: [this.lastRecordedFile],
          title: `${vol.roman}: ${vol.title}`,
        });
        return;
      } catch {
        // User canceled share sheet
        return;
      }
    }
    // Fallback if browser doesn't support file sharing: download the file directly
    this.downloadRecordedVideo();
  }

  private downloadRecordedVideo(): void {
    if (!this.lastRecordedUrl || !this.lastRecordedFile) return;
    const a = document.createElement('a');
    a.href = this.lastRecordedUrl;
    a.download = this.lastRecordedFile.name;
    a.click();
  }
}
