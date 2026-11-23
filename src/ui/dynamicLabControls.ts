import type { LabControlSchema, LabModule } from '../labs/labModule';

export class DynamicLabControls {
  private readonly container = document.getElementById('dynamic-lab-controls') as HTMLElement;
  private lab: LabModule | null = null;
  private onChanged: () => void;

  constructor(onChanged: () => void) {
    this.onChanged = onChanged;
  }

  public setLab(lab: LabModule | null): void {
    this.lab = lab;
    this.render();
  }

  public render(): void {
    if (!this.lab) {
      this.container.innerHTML = '';
      this.container.classList.add('hidden');
      return;
    }

    this.container.classList.remove('hidden');
    const schema: LabControlSchema = this.lab.getControlSchema();
    this.container.innerHTML = '';

    if (schema.sliders.length > 0) {
      const sec = document.createElement('section');
      sec.className = 'panel-section';
      sec.innerHTML = '<div class="section-header">Experiment Parameters</div>';

      for (const s of schema.sliders) {
        const row = document.createElement('div');
        row.className = 'slider-row';
        row.dataset.dynTitle = s.noteTitle;
        row.dataset.dynText = s.noteText;
        row.innerHTML = `
          <div class="slider-head">
            <span>${s.label}</span>
            <span class="mono-val">${s.value.toFixed(s.step < 1 ? 2 : 0)} ${s.unit}</span>
          </div>
          <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}" />
        `;
        const input = row.querySelector('input') as HTMLInputElement;
        const valSpan = row.querySelector('.mono-val') as HTMLElement;
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          valSpan.textContent = `${v.toFixed(s.step < 1 ? 2 : 0)} ${s.unit}`;
          this.lab?.setParam(s.key, v);
          this.onChanged();
        });
        sec.appendChild(row);
      }
      this.container.appendChild(sec);
    }

    if (schema.toggles.length > 0) {
      const sec = document.createElement('section');
      sec.className = 'panel-section';
      sec.innerHTML = '<div class="section-header">Visual Layers</div>';

      for (const t of schema.toggles) {
        const lbl = document.createElement('label');
        lbl.className = 'layer-toggle';
        lbl.innerHTML = `
          <input type="checkbox" ${t.checked ? 'checked' : ''} />
          <span class="swatch" style="background:${t.swatchColor}"></span>
          <span>${t.label}</span>
        `;
        const chk = lbl.querySelector('input') as HTMLInputElement;
        chk.addEventListener('change', () => {
          this.lab?.setParam(t.key, chk.checked);
          this.onChanged();
        });
        sec.appendChild(lbl);
      }
      this.container.appendChild(sec);
    }

    if (schema.actions.length > 0) {
      const sec = document.createElement('section');
      sec.className = 'panel-section';
      sec.innerHTML = '<div class="section-header">Quick Experiments</div>';
      const row = document.createElement('div');
      row.className = 'chip-row';
      for (const act of schema.actions) {
        const btn = document.createElement('button');
        btn.className = 'chip-btn';
        btn.textContent = act.label;
        btn.addEventListener('click', () => {
          this.lab?.runAction(act.id);
          this.onChanged();
        });
        row.appendChild(btn);
      }
      sec.appendChild(row);
      this.container.appendChild(sec);
    }
  }
}
