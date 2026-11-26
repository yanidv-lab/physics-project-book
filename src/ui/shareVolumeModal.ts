import { getVolumeById } from '../data/bookCatalog';
import type { TopicId } from '../types/simulation';

export interface ShareVolumeCallbacks {
  getActiveTopicId: () => TopicId;
  getActiveChapterId: () => string;
  getCanvas: () => HTMLCanvasElement;
  onStartTourForRecording: (topicId: TopicId) => void;
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
  private readonly recordStatusEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;

  private readonly callbacks: ShareVolumeCallbacks;
  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordTimer: number | null = null;
  private recordSeconds = 0;

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
    this.recordStatusEl = document.getElementById('share-record-status')!;
    this.closeBtn = document.getElementById('share-modal-close') as HTMLButtonElement;

    this.closeBtn.addEventListener('click', () => this.hide());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    this.copyBtn.addEventListener('click', () => void this.copyLink());
    this.nativeShareBtn.addEventListener('click', () => void this.nativeShare());
    this.previewSoloBtn.addEventListener('click', () => {
      const topic = this.callbacks.getActiveTopicId();
      this.hide();
      this.callbacks.onEnterSoloMode(topic);
    });
    this.recordBtn.addEventListener('click', () => this.toggleRecording());
  }

  public show(): void {
    const topicId = this.callbacks.getActiveTopicId();
    const chapterId = this.callbacks.getActiveChapterId();
    const vol = getVolumeById(topicId);
    const shareUrl = buildSoloVolumeShareUrl(topicId, chapterId);

    this.titleEl.textContent = `Share ${vol.roman} · ${vol.title}`;
    this.descEl.textContent =
      'Send a clean single-volume Screen-in-Screen link (no clutter in messaging apps), or record a live 3D Video + Audio clip.';
    this.linkInput.value = shareUrl;
    this.copyBtn.textContent = '📋 Copy Solo Link';
    this.nativeShareBtn.classList.toggle('hidden', typeof navigator === 'undefined' || !('share' in navigator));
    this.modal.classList.remove('hidden');
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  public isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
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
      this.copyBtn.textContent = '📋 Copy Solo Link';
    }, 2000);
  }

  private async nativeShare(): Promise<void> {
    const vol = getVolumeById(this.callbacks.getActiveTopicId());
    try {
      await navigator.share({
        title: `${vol.roman}: ${vol.title} — 3D Physics Simulation`,
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

  private startRecording(): void {
    const canvas = this.callbacks.getCanvas();
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      this.recordStatusEl.textContent = 'Video recording is not supported in this browser.';
      return;
    }

    const topicId = this.callbacks.getActiveTopicId();
    const videoStream = canvas.captureStream(30);
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

    // Pick best supported mime type
    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

    const combined = new MediaStream(tracks);
    this.recordedChunks = [];
    try {
      this.recorder = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 3_500_000 })
        : new MediaRecorder(combined);
    } catch {
      this.recordStatusEl.textContent = 'Could not initialize video recorder.';
      return;
    }

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.recordedChunks.push(ev.data);
    };

    this.recorder.onstop = () => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(this.recordedChunks, { type: mimeType || 'video/webm' });
      const fileName = `physics-${topicId}-3d.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.recordStatusEl.textContent = `Saved ${fileName} (${(blob.size / 1024 / 1024).toFixed(1)} MB) — ready to send!`;
      this.recordBtn.textContent = '🎬 Record 3D Video Clip';
      this.recordBtn.classList.remove('active');
      if (this.recordTimer !== null) {
        window.clearInterval(this.recordTimer);
        this.recordTimer = null;
      }
      this.recorder = null;
    };

    // Start live audio-sim tour in background and hide modal so the 3D scene records cleanly
    this.recorder.start(500);
    this.recordSeconds = 0;
    this.recordBtn.textContent = '⏹ Stop & Save Video';
    this.recordBtn.classList.add('active');
    this.recordStatusEl.textContent = 'Recording live 3D simulation… 0s';
    this.callbacks.onStartTourForRecording(topicId);

    this.recordTimer = window.setInterval(() => {
      this.recordSeconds += 1;
      this.recordStatusEl.textContent = `Recording live 3D simulation… ${this.recordSeconds}s (click Stop to save)`;
      if (this.recordSeconds >= 30) {
        this.stopRecording();
      }
    }, 1000);
  }

  private stopRecording(): void {
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
    }
  }
}
