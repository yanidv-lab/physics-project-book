import { BOOK_VOLUMES, type BookVolume } from '../data/bookCatalog';
import type { TopicId } from '../types/simulation';
import { NotebookStore } from './annotationsManager';

export interface BookCoverCallbacks {
  onSelectVolume: (topicId: TopicId, chapterId?: string) => void;
  onOpenPhoneModal: () => void;
}

export class BookCoverModal {
  private readonly store: NotebookStore;
  private readonly callbacks: BookCoverCallbacks;

  private readonly modal = document.getElementById('book-cover-modal') as HTMLElement;
  private readonly grid = document.getElementById('book-cover-grid') as HTMLElement;
  private readonly totalProgress = document.getElementById('book-cover-total') as HTMLElement;
  private readonly closeBtn = document.getElementById('book-cover-close') as HTMLButtonElement;
  private readonly phoneBtn = document.getElementById('book-cover-phone') as HTMLButtonElement;

  constructor(store: NotebookStore, callbacks: BookCoverCallbacks) {
    this.store = store;
    this.callbacks = callbacks;

    this.closeBtn.addEventListener('click', () => this.hide());
    this.phoneBtn.addEventListener('click', () => {
      this.callbacks.onOpenPhoneModal();
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    this.render();
  }

  public show(): void {
    this.render();
    this.modal.classList.remove('hidden');
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  public render(): void {
    const totalChapters = BOOK_VOLUMES.reduce((acc, v) => acc + v.chapters.length, 0);
    const explored = this.store.getCompletedCount();
    this.totalProgress.textContent = `${explored} / ${totalChapters} Experiments Explored`;

    this.grid.innerHTML = '';
    for (const vol of BOOK_VOLUMES) {
      this.grid.appendChild(this.createVolumeCard(vol));
    }
  }

  private createVolumeCard(vol: BookVolume): HTMLElement {
    const done = this.store.getCompletedCountForIds(vol.chapters.map((c) => c.id));
    const card = document.createElement('div');
    card.className = 'volume-card';
    card.style.setProperty('--vol-accent', vol.accent);

    const pillChapters =
      vol.chapters.length <= 5
        ? vol.chapters
        : [...vol.chapters.slice(0, 4), vol.chapters[vol.chapters.length - 1]];

    const pills = pillChapters
      .map((ch) => {
        const badge = ch.isNew ? ' <span class="new-badge">NEW</span>' : '';
        return `<button class="vol-ch-pill" data-ch="${ch.id}">${ch.number}. ${ch.title}${badge}</button>`;
      })
      .join('');

    card.innerHTML = `
      <div class="vol-top">
        <div class="vol-icon">${vol.icon}</div>
        <div class="vol-titles">
          <div class="vol-roman">${vol.roman} &middot; ${done}/${vol.chapters.length} Done</div>
          <h3>${vol.title}</h3>
          <div class="vol-sub">${vol.subtitle}</div>
        </div>
      </div>
      <p class="vol-desc">${vol.description}</p>
      <div class="vol-pills">${pills}</div>
      <div class="vol-footer">
        <button class="vol-open-btn">Open ${vol.roman} Lab →</button>
      </div>
    `;

    (card.querySelector('.vol-open-btn') as HTMLButtonElement).addEventListener('click', () => {
      this.hide();
      this.callbacks.onSelectVolume(vol.id, vol.chapters[0]?.id);
    });

    for (const pill of Array.from(card.querySelectorAll<HTMLButtonElement>('.vol-ch-pill'))) {
      pill.addEventListener('click', () => {
        this.hide();
        this.callbacks.onSelectVolume(vol.id, pill.dataset.ch);
      });
    }

    return card;
  }
}
