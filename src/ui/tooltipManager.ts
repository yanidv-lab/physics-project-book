import { UI_STUDY_NOTES } from '../data/projectBook';

export class TooltipManager {
  private readonly tooltip = document.getElementById('ui-tooltip') as HTMLElement;
  private activeKey: string | null = null;

  constructor() {
    document.addEventListener('mouseover', (e) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-note], [data-dyn-title]',
      );
      if (!target) {
        if (this.activeKey) this.hide();
        return;
      }

      if (target.dataset.dynTitle) {
        const key = `dyn:${target.dataset.dynTitle}`;
        if (this.activeKey !== key) {
          this.activeKey = key;
          this.tooltip.innerHTML = `<strong>${target.dataset.dynTitle}</strong><p>${target.dataset.dynText ?? ''}</p>`;
          this.tooltip.classList.remove('hidden');
        }
        this.position(e.clientX, e.clientY);
        return;
      }

      const key = target.dataset.note ?? '';
      const entry = UI_STUDY_NOTES[key];
      if (!entry) return;
      if (this.activeKey !== key) {
        this.activeKey = key;
        this.tooltip.innerHTML = `<strong>${entry.title}</strong><p>${entry.text}</p>`;
        this.tooltip.classList.remove('hidden');
      }
      this.position(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.activeKey) return;
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-note], [data-dyn-title]',
      );
      if (!target) {
        this.hide();
        return;
      }
      this.position(e.clientX, e.clientY);
    });

    document.addEventListener('mouseleave', () => this.hide());
  }

  private position(clientX: number, clientY: number): void {
    const pad = 12;
    const w = 264;
    const h = this.tooltip.offsetHeight || 86;
    let left = clientX + 14;
    let top = clientY + 14;
    if (left + w > window.innerWidth - pad) {
      left = clientX - w - 14;
    }
    if (top + h > window.innerHeight - pad) {
      top = clientY - h - 14;
    }
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    top = Math.max(66, Math.min(window.innerHeight - h - pad, top));
    this.tooltip.style.left = `${Math.round(left)}px`;
    this.tooltip.style.top = `${Math.round(top)}px`;
  }

  public hide(): void {
    this.activeKey = null;
    this.tooltip.classList.add('hidden');
  }
}
