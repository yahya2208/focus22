import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const i18nDir = path.resolve(__dirname, '../../i18n/translations');

/** Parse translation file and extract keys starting with a prefix */
function parseKeys(filePath: string, prefix: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const keys: string[] = [];
  const re = /^\s*['"]([^'"]+)['"]:\s/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    if (match[1]!.startsWith(prefix)) keys.push(match[1]!);
  }
  return keys;
}

/** Extract all t('repair.XXX') calls from source files */
function extractUsedRepairKeys(): string[] {
  const srcDir = path.resolve(__dirname, '../..');
  const keys = new Set<string>();
  const repairKeyRe = /t\(['"](repair\.[a-zA-Z]+)['"]\)/g;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('__tests__') && !entry.name.startsWith('node_modules') && entry.name !== '__pycache__') {
        walk(p);
      } else if (entry.isFile() && /\.(tsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(p, 'utf-8');
        let match;
        while ((match = repairKeyRe.exec(content)) !== null) {
          keys.add(match[1]!);
        }
      }
    }
  }

  walk(srcDir);
  return [...keys].sort();
}

describe('Translation keys — repair namespace', () => {
  const usedKeys = extractUsedRepairKeys();
  const enKeys = parseKeys(path.join(i18nDir, 'en.ts'), 'repair.');
  const arKeys = parseKeys(path.join(i18nDir, 'ar.ts'), 'repair.');
  const trKeys = parseKeys(path.join(i18nDir, 'tr.ts'), 'repair.');

  it('should have all used repair keys in en.ts', () => {
    const missing = usedKeys.filter(k => !enKeys.includes(k));
    expect(missing, `Missing from en.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('should have all used repair keys in ar.ts', () => {
    const missing = usedKeys.filter(k => !arKeys.includes(k));
    expect(missing, `Missing from ar.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('should have all used repair keys in tr.ts', () => {
    const missing = usedKeys.filter(k => !trKeys.includes(k));
    expect(missing, `Missing from tr.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('should have no unused keys in en.ts (cleanup detection)', () => {
    const extra = enKeys.filter(k => !usedKeys.includes(k));
    // These may be legitimately unused and awaiting cleanup — warn but don't fail
    if (extra.length > 0) {
      console.warn(`Unused keys in en.ts (may need cleanup): ${extra.join(', ')}`);
    }
  });
});
