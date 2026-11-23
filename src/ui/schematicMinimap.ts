import * as THREE from 'three';
import type { CircuitState, SimParams, UserPin } from '../types/simulation';
import { CircuitModel } from '../physics/circuitModel';
import { PathGeometry } from '../physics/pathGeometry';
import { PIN_COLOR_HEX } from './annotationsManager';

const CSS_W = 296;
const CSS_H = 148;

export class SchematicMinimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onTeleport: (s: number) => void;
  private pathRef: PathGeometry | null = null;
  private pulseClock = 0;

  constructor(canvas: HTMLCanvasElement, onTeleport: (s: number) => void) {
    this.canvas = canvas;
    this.onTeleport = onTeleport;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for minimap');
    this.ctx = ctx;
    this.setupHiDPI();

    this.canvas.addEventListener('click', (e) => {
      if (!this.pathRef) return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * CSS_W;
      const cy = ((e.clientY - rect.top) / rect.height) * CSS_H;
      const worldX = ((cx - 28) / (CSS_W - 56)) * 32 - 16;
      const worldZ = ((cy - 22) / (CSS_H - 44)) * 22 - 11;
      const sTarget = this.pathRef.findNearestS(new THREE.Vector3(worldX, 0, worldZ));
      this.onTeleport(sTarget);
    });
  }

  private setupHiDPI(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CSS_W * dpr;
    this.canvas.height = CSS_H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private worldToCanvas(x: number, z: number): [number, number] {
    const px = 28 + ((x + 16) / 32) * (CSS_W - 56);
    const py = 22 + ((z + 11) / 22) * (CSS_H - 44);
    return [px, py];
  }

  public render(
    dt: number,
    path: PathGeometry,
    circuit: CircuitModel,
    state: CircuitState,
    params: SimParams,
    heroS: number,
    pins: UserPin[] = [],
  ): void {
    this.pathRef = path;
    this.pulseClock += dt;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, CSS_W, CSS_H);

    // Draw closed loop path colored by local electrostatic potential V(s)
    const samples = path.getUniformSamples();
    const step = 6;
    const vMax = Math.max(1, Math.abs(state.sourceVoltage), Math.abs(state.capacitorVoltage));
    const a = path.anchors;

    ctx.save();
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.shadowBlur = Math.abs(state.current) > 1e-4 ? 6 : 0;
    for (let i = 0; i < samples.length; i += step) {
      const s0 = samples[i];
      const s1 = samples[(i + step) % samples.length];
      if (
        a.capGapStart !== null &&
        a.capGapEnd !== null &&
        s0.s > a.capGapStart &&
        s0.s < a.capGapEnd
      ) {
        continue;
      }
      const sampled = circuit.sampleAtS(s0.s);
      const normV = Math.max(0, Math.min(1, sampled.localV / vMax));
      const r = Math.round(59 + normV * (239 - 59));
      const g = Math.round(130 + normV * (68 - 130));
      const b = Math.round(246 + normV * (120 - 246));
      const stroke = `rgb(${r},${g},${b})`;
      ctx.strokeStyle = stroke;
      ctx.shadowColor = stroke;

      const [x0, y0] = this.worldToCanvas(s0.pos.x, s0.pos.z);
      const [x1, y1] = this.worldToCanvas(s1.pos.x, s1.pos.z);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();

    // Component IEEE symbols
    this.drawBatterySymbol(ctx);
    this.drawResistorSymbol(ctx, 0, -11, true, 'R₁');

    if (params.topology === 'divider') {
      this.drawResistorSymbol(ctx, 16, 0, false, 'R₂');
    } else if (params.topology === 'rc' || params.topology === 'rlc') {
      this.drawCapacitorSymbol(ctx, 16, 0);
    }

    if (params.topology === 'rlc') {
      this.drawInductorSymbol(ctx, -16, 0);
    }

    // Current direction label
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    const curDirLabel =
      Math.abs(state.current) < 1e-4
        ? 'I = 0.00 A'
        : `I = ${state.current.toFixed(2)} A ${state.current > 0 ? '↺' : '↻'}`;
    ctx.fillText(curDirLabel, CSS_W * 0.5, CSS_H * 0.5 + 3);

    // User study pins along loop
    for (const pin of pins) {
      const pf = path.sampleFrame(pin.s);
      const [px, py] = this.worldToCanvas(pf.pos.x, pf.pos.z);
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = PIN_COLOR_HEX[pin.color];
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#090d16';
      ctx.stroke();
    }

    // Hero electron glowing beacon
    const heroFrame = path.sampleFrame(heroS);
    const [hx, hy] = this.worldToCanvas(heroFrame.pos.x, heroFrame.pos.z);
    const pulseR = 6 + 3 * Math.sin(this.pulseClock * 6);
    ctx.save();
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(hx, hy, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
    ctx.lineWidth = 1.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hx, hy, 3.8, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.fill();
    ctx.restore();
  }

  private drawBatterySymbol(ctx: CanvasRenderingContext2D): void {
    const [cx, cy] = this.worldToCanvas(0, 11);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(cx - 14, cy - 10, 28, 20);

    // Long (+) plate on right (x=+4 side), short (-) plate on left (x=-4 side)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy - 9);
    ctx.lineTo(cx + 5, cy + 9);
    ctx.stroke();

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 5);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.stroke();

    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('+', cx + 12, cy - 4);
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('−', cx - 12, cy - 4);
  }

  private drawResistorSymbol(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wz: number,
    horizontal: boolean,
    label: string,
  ): void {
    const [cx, cy] = this.worldToCanvas(wx, wz);
    ctx.fillStyle = '#090d16';
    if (horizontal) {
      ctx.fillRect(cx - 20, cy - 8, 40, 16);
    } else {
      ctx.fillRect(cx - 8, cy - 20, 16, 40);
    }

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const peaks = 5;
    if (horizontal) {
      ctx.moveTo(cx - 18, cy);
      for (let i = 0; i < peaks; i++) {
        const px = cx - 15 + (i + 0.5) * (30 / peaks);
        const py = cy + (i % 2 === 0 ? -5 : 5);
        ctx.lineTo(px, py);
      }
      ctx.lineTo(cx + 18, cy);
    } else {
      ctx.moveTo(cx, cy - 18);
      for (let i = 0; i < peaks; i++) {
        const py = cy - 15 + (i + 0.5) * (30 / peaks);
        const px = cx + (i % 2 === 0 ? -5 : 5);
        ctx.lineTo(px, py);
      }
      ctx.lineTo(cx, cy + 18);
    }
    ctx.stroke();

    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText(label, horizontal ? cx : cx - 15, horizontal ? cy - 9 : cy + 3);
  }

  private drawCapacitorSymbol(ctx: CanvasRenderingContext2D, wx: number, wz: number): void {
    const [cx, cy] = this.worldToCanvas(wx, wz);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(cx - 11, cy - 7, 22, 14);

    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 4);
    ctx.lineTo(cx + 9, cy - 4);
    ctx.moveTo(cx - 9, cy + 4);
    ctx.lineTo(cx + 9, cy + 4);
    ctx.stroke();

    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#c084fc';
    ctx.textAlign = 'right';
    ctx.fillText('C', cx - 13, cy + 3);
  }

  private drawInductorSymbol(ctx: CanvasRenderingContext2D, wx: number, wz: number): void {
    const [cx, cy] = this.worldToCanvas(wx, wz);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(cx - 8, cy - 22, 16, 44);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const y0 = cy + 18 - i * 9;
      ctx.arc(cx, y0 - 4.5, 4.5, Math.PI * 0.5, -Math.PI * 0.5, true);
    }
    ctx.stroke();

    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('L', cx + 8, cy + 3);
  }
}
