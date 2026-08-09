import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '../../research-console/pages/campaigns');
const FILES = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
  .map((f) => ({ name: f, content: fs.readFileSync(path.join(DIR, f), 'utf-8') }));

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('campaign admin surface — forbidden tables/imports (§0 / P5 gates)', () => {
  it('1: campaign admin code never reads/writes qr_codes', () => {
    for (const f of FILES) {
      expect(stripComments(f.content), f.name).not.toMatch(/\.from\(\s*['"]qr_codes['"]\s*\)/);
    }
  });

  it('2: campaign admin code never reads/writes placements', () => {
    for (const f of FILES) {
      expect(stripComments(f.content), f.name).not.toMatch(/\.from\(\s*['"]placements['"]\s*\)/);
    }
  });

  it('3: campaign admin code never reads/writes placement_history', () => {
    for (const f of FILES) {
      expect(stripComments(f.content), f.name).not.toMatch(/\.from\(\s*['"]placement_history['"]\s*\)/);
    }
  });

  it('4: campaign admin code never reads/writes analytics_events', () => {
    for (const f of FILES) {
      expect(stripComments(f.content), f.name).not.toMatch(/\.from\(\s*['"]analytics_events['"]\s*\)/);
    }
  });

  it('5: campaign admin code never reads/writes sessions for campaign analytics', () => {
    for (const f of FILES) {
      expect(stripComments(f.content), f.name).not.toMatch(/\.from\(\s*['"]sessions['"]\s*\)/);
    }
  });

  it('6: campaign admin code never touches the old data-service layer', () => {
    for (const f of FILES) {
      expect(f.content, f.name).not.toMatch(/data-service/);
      expect(f.content, f.name).not.toMatch(/core\/qr\//);
    }
  });

  it('7: campaign admin code builds only plain /c/ URLs (no attribution params)', () => {
    const service = FILES.find((f) => f.name === 'campaign-service.ts')!;
    expect(stripComments(service.content)).toMatch(/buildCampaignQrUrl/);
    expect(stripComments(service.content)).not.toMatch(/[?&](campaign|source|ref|placement)=/);
  });

  it('8: campaign service only ever touches the campaigns table', () => {
    const service = FILES.find((f) => f.name === 'campaign-service.ts')!;
    const tables = [...service.content.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    expect(new Set(tables)).toEqual(new Set(['campaigns']));
  });

  it('9: no placement/analytics components resurrected on disk', () => {
    expect(FILES.some((f) => f.name === 'PlacementsTab.tsx')).toBe(false);
    expect(FILES.some((f) => f.name === 'CampaignAnalytics.tsx')).toBe(false);
  });
});
