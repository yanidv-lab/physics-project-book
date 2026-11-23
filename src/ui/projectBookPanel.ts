import {
  BOOK_VOLUMES,
  getVolumeById,
  type BookChapterSummary,
  type BookQuickAction,
} from '../data/bookCatalog';
import type { TopicId } from '../types/simulation';
import { NotebookStore } from './annotationsManager';

export interface ProjectBookCallbacks {
  onSelectVolume: (topicId: TopicId) => void;
  onLaunchChapter: (chapter: BookChapterSummary) => void;
  onQuickAction: (chapter: BookChapterSummary, action: BookQuickAction) => void;
  onOpenCover: () => void;
}

export class ProjectBookPanel {
  private readonly store: NotebookStore;
  private readonly callbacks: ProjectBookCallbacks;
  private readonly container = document.getElementById('book-chapters-list') as HTMLElement;
  private readonly volStrip = document.getElementById('book-volume-strip') as HTMLElement;
  private readonly progressText = document.getElementById('book-progress-text') as HTMLElement;
  private readonly progressFill = document.getElementById('book-progress-fill') as HTMLElement;
  private readonly coverOpenBtn = document.getElementById('book-open-cover-btn') as HTMLButtonElement;

  private activeTopic: TopicId = 'circuits';
  private activeChapterId: string | null = 'ch2-bottleneck-heat';

  constructor(store: NotebookStore, callbacks: ProjectBookCallbacks) {
    this.store = store;
    this.callbacks = callbacks;
    this.coverOpenBtn.addEventListener('click', () => this.callbacks.onOpenCover());
    this.render();
  }

  public setState(topicId: TopicId, chapterId: string | null): void {
    this.activeTopic = topicId;
    this.activeChapterId = chapterId;
    this.render();
  }

  public render(): void {
    const vol = getVolumeById(this.activeTopic);
    const doneCount = this.store.getCompletedCountForIds(vol.chapters.map((c) => c.id));
    const total = vol.chapters.length;
    this.progressText.textContent = `${doneCount} / ${total} in ${vol.roman}`;
    this.progressFill.style.width = `${Math.round((doneCount / Math.max(1, total)) * 100)}%`;

    this.volStrip.innerHTML = '';
    for (const v of BOOK_VOLUMES) {
      const btn = document.createElement('button');
      btn.className = `vol-chip ${v.id === this.activeTopic ? 'active' : ''}`;
      btn.style.setProperty('--vol-accent', v.accent);
      btn.textContent = `${v.icon} ${v.roman}`;
      btn.title = v.title;
      btn.addEventListener('click', () => {
        if (v.id !== this.activeTopic) {
          this.callbacks.onSelectVolume(v.id);
        }
      });
      this.volStrip.appendChild(btn);
    }

    this.container.innerHTML = '';
    for (const ch of vol.chapters) {
      const isActive = ch.id === this.activeChapterId;
      const isDone = this.store.isChapterCompleted(ch.id);
      const isStarred = this.store.isChapterStarred(ch.id);

      const card = document.createElement('div');
      card.className = `chapter-card ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`;
      card.style.setProperty('--ch-accent', ch.accent);

      const watchHtml = ch.watchFor.map((w) => `<li>${w}</li>`).join('');
      const quickHtml =
        ch.quickActions && isActive
          ? `<div class="chapter-quick-row">${ch.quickActions
              .map((qa, idx) => `<button class="chip-btn quick-action-btn" data-qa="${idx}">${qa.label}</button>`)
              .join('')}</div>`
          : '';

      card.innerHTML = `
        <div class="chapter-head">
          <div class="chapter-num">CH ${ch.number}</div>
          <div class="chapter-titles">
            <div class="chapter-title">${ch.title}</div>
            <div class="chapter-sub">${ch.subtitle}</div>
          </div>
          <span class="diff-badge diff-${ch.difficulty.toLowerCase()}">${ch.difficulty}</span>
        </div>
        <p class="chapter-summary">${ch.simpleSummary}</p>
        ${
          isActive
            ? `<div class="chapter-watch">
                <div class="watch-label">What to Watch For</div>
                <ul>${watchHtml}</ul>
              </div>${quickHtml}`
            : ''
        }
        <div class="chapter-footer">
          <button class="launch-btn">${isActive ? 'Relaunch Scene' : 'Launch Experiment'}</button>
          <div class="chapter-marks">
            <button class="mark-pill done-btn ${isDone ? 'on' : ''}" title="Mark as explored">
              ${isDone ? '✓ Done' : '○ Done'}
            </button>
            <button class="mark-pill star-btn ${isStarred ? 'on' : ''}" title="Bookmark chapter">
              ${isStarred ? '★' : '☆'}
            </button>
          </div>
        </div>
      `;

      const launchBtn = card.querySelector('.launch-btn') as HTMLButtonElement;
      launchBtn.addEventListener('click', () => {
        this.activeChapterId = ch.id;
        this.store.markChapterCompleted(ch.id);
        this.callbacks.onLaunchChapter(ch);
        this.render();
      });

      const doneBtn = card.querySelector('.done-btn') as HTMLButtonElement;
      doneBtn.addEventListener('click', () => {
        this.store.toggleChapterCompleted(ch.id);
        this.render();
      });

      const starBtn = card.querySelector('.star-btn') as HTMLButtonElement;
      starBtn.addEventListener('click', () => {
        this.store.toggleChapterStarred(ch.id);
        this.render();
      });

      if (ch.quickActions && isActive) {
        for (const btn of Array.from(card.querySelectorAll<HTMLButtonElement>('.quick-action-btn'))) {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.qa ?? '0');
            const action = ch.quickActions?.[idx];
            if (action) this.callbacks.onQuickAction(ch, action);
          });
        }
      }

      this.container.appendChild(card);
    }
  }
}
