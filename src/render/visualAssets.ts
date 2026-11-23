import * as THREE from 'three';

const textureCache = new Map<string, THREE.Texture>();

function createFallbackTexture(): THREE.Texture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  return tex;
}

export function createRadialGlowTexture(innerHex: string, outerHex: string): THREE.Texture {
  const key = `glow:${innerHex}:${outerHex}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const fb = createFallbackTexture();
    textureCache.set(key, fb);
    return fb;
  }

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createFallbackTexture();

  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, innerHex);
  grad.addColorStop(0.35, outerHex);
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

export function createSymbolBadgeTexture(
  symbol: string,
  bgHex: string,
  borderHex: string,
  textHex: string,
): THREE.Texture {
  const key = `badge:${symbol}:${bgHex}:${borderHex}:${textHex}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const fb = createFallbackTexture();
    textureCache.set(key, fb);
    return fb;
  }

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return createFallbackTexture();

  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  ctx.shadowColor = borderHex;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(c, c, 40, 0, Math.PI * 2);
  ctx.fillStyle = bgHex;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = borderHex;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = '700 56px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textHex;
  ctx.fillText(symbol, c, c + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}
