const CSS_W = 296;
const CSS_H = 122;
const HISTORY_LEN = 300;

export class Oscilloscope {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private readonly ch1Buf = new Float32Array(HISTORY_LEN);
  private readonly ch2Buf = new Float32Array(HISTORY_LEN);
  private readonly ch3Buf = new Float32Array(HISTORY_LEN);
  private head = 0;
  private count = 0;
  private sampleAccum = 0;

  private labels: [string, string, string] = ['V', 'I', 'U'];
  private units: [string, string, string] = ['V', 'A', 'eV'];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for oscilloscope');
    this.ctx = ctx;
    this.setupHiDPI();
  }

  private setupHiDPI(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CSS_W * dpr;
    this.canvas.height = CSS_H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public setChannels(
    labels: [string, string, string],
    units: [string, string, string] = ['', '', ''],
  ): void {
    this.labels = labels;
    this.units = units;
  }

  public clear(): void {
    this.ch1Buf.fill(0);
    this.ch2Buf.fill(0);
    this.ch3Buf.fill(0);
    this.head = 0;
    this.count = 0;
    this.sampleAccum = 0;
  }

  public pushSample(dt: number, c1: number, c2: number, c3: number): void {
    this.sampleAccum += dt;
    if (this.sampleAccum < 1 / 45) return;
    this.sampleAccum = 0;

    this.ch1Buf[this.head] = c1;
    this.ch2Buf[this.head] = c2;
    this.ch3Buf[this.head] = c3;
    this.head = (this.head + 1) % HISTORY_LEN;
    if (this.count < HISTORY_LEN) this.count++;
  }

  public render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CSS_W, CSS_H);

    // Subtle graticule grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CSS_W; x += 37) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CSS_H);
      ctx.stroke();
    }
    for (let y = 15; y < CSS_H; y += 23) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CSS_W, y);
      ctx.stroke();
    }

    // Center zero line
    const midY = CSS_H * 0.5;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(CSS_W, midY);
    ctx.stroke();
    ctx.restore();

    if (this.count < 2) return;

    let max1 = 1;
    let max2 = 0.5;
    let max3 = 1;
    for (let k = 0; k < this.count; k++) {
      const idx = (this.head - this.count + k + HISTORY_LEN) % HISTORY_LEN;
      max1 = Math.max(max1, Math.abs(this.ch1Buf[idx]) * 1.15);
      max2 = Math.max(max2, Math.abs(this.ch2Buf[idx]) * 1.15);
      max3 = Math.max(max3, Math.abs(this.ch3Buf[idx]) * 1.15);
    }

    const ampH = CSS_H * 0.42;
    this.drawTrace(this.ch1Buf, max1, ampH, '#f59e0b');
    this.drawTrace(this.ch2Buf, max2, ampH, '#00f0ff');
    this.drawTrace(this.ch3Buf, max3, ampH, '#ec4899');

    // Live right-edge numeric readout tags
    const latestIdx = (this.head - 1 + HISTORY_LEN) % HISTORY_LEN;
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`${this.labels[0]} ${this.ch1Buf[latestIdx].toFixed(1)}${this.units[0]}`, CSS_W - 6, 13);
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`${this.labels[1]} ${this.ch2Buf[latestIdx].toFixed(2)}${this.units[1]}`, CSS_W - 6, 25);
    ctx.fillStyle = '#ec4899';
    ctx.fillText(`${this.labels[2]} ${this.ch3Buf[latestIdx].toFixed(1)}${this.units[2]}`, CSS_W - 6, CSS_H - 6);
  }

  private drawTrace(
    buf: Float32Array,
    maxScale: number,
    ampH: number,
    color: string,
  ): void {
    const ctx = this.ctx;
    const midY = CSS_H * 0.5;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.75;
    ctx.beginPath();

    for (let k = 0; k < this.count; k++) {
      const idx = (this.head - this.count + k + HISTORY_LEN) % HISTORY_LEN;
      const x = (k / (HISTORY_LEN - 1)) * CSS_W;
      const y = midY - (buf[idx] / maxScale) * ampH;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
