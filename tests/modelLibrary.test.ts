import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'public', 'models');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('Blender model library integrity', () => {
  it('every attachModel() reference has a built .glb file and manifest entry', () => {
    const manifestPath = path.join(MODELS_DIR, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<
      string,
      { tris: number; bytes: number; group: string }
    >;

    const referenced = new Set<string>();
    const re = /attachModel\([^,]+,\s*['"]([a-z0-9_]+)['"]/g;
    for (const file of collectTsFiles(path.join(ROOT, 'src'))) {
      const text = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        referenced.add(m[1]);
      }
    }

    expect(referenced.size).toBeGreaterThanOrEqual(35);
    for (const name of referenced) {
      expect(manifest[name], `missing manifest entry for "${name}"`).toBeDefined();
      expect(manifest[name].tris).toBeGreaterThan(0);
      expect(manifest[name].bytes).toBeLessThan(200_000); // mobile-friendly budget
      const glbPath = path.join(MODELS_DIR, `${name}.glb`);
      expect(fs.existsSync(glbPath), `missing GLB file "${glbPath}"`).toBe(true);
      const header = fs.readFileSync(glbPath).subarray(0, 4).toString('ascii');
      expect(header).toBe('glTF');
    }
  });
});
