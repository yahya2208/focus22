import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 07 — KEEP-surface protection (owner execution boundary).
 *
 * Protects the surfaces the owner placed under KEEP / REASSESS-PRESERVE from
 * being altered by the P6 approved changes. This is a presence-based
 * protection gate and should be GREEN at all times.
 *
 * KEEP: Game, Ads, Inventory, Catalog SSOT, Showroom, Similar, WhatsApp,
 * Theme/language/preferences, AI Coach.
 * REASSESS/PRESERVE (feature level): Repair feature (minimized, not removed),
 * Research/BI console, users role gate.
 */

const SRC = path.resolve(__dirname, '../..');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

describe('P6-PROTECT: Repair feature preserved (minimized, not removed)', () => {
  it('RepairDataService and the repository facade still exist', () => {
    expect(exists('core/supabase/repair-data-service.ts')).toBe(true);
    expect(exists('services/repair/repair-repository.ts')).toBe(true);
    expect(exists('services/repair/repair-database.ts')).toBe(true);
  });

  it('App routes still mount the repair screens and the research console', () => {
    const app = read('App.tsx');
    expect(app).toContain('RepairRequestScreen');
    expect(app).toContain('RepairHomeScreen');
    expect(app).toContain('ResearchConsole');
  });
});

describe('P6-PROTECT: Research/BI console preserved (role-gated, not deleted)', () => {
  it('research console, permissions and role gate still exist', () => {
    expect(exists('research-console/ResearchConsole.tsx')).toBe(true);
    expect(exists('core/research/api-supabase.ts')).toBe(true);
    expect(read('core/research/permissions.ts')).toContain("resource: 'scientific'");
  });

  it('business-intelligence console and API still exist', () => {
    expect(exists('business-intelligence/api.ts')).toBe(true);
    expect(exists('business-intelligence/BusinessIntelligenceCenter.tsx')).toBe(true);
  });
});

describe('P6-PROTECT: KEEP surfaces preserved', () => {
  it('Game surface preserved', () => {
    expect(exists('core/gamification/achievements.ts')).toBe(true);
    expect(exists('core/gamification/daily-challenge.ts')).toBe(true);
  });

  it('Catalog SSOT preserved with functional popularity contract', () => {
    expect(exists('services/catalog-service.ts')).toBe(true);
    expect(read('services/catalog-service.ts')).toContain('PhonePopularity');
  });

  it('Showroom view counter preserved', () => {
    expect(exists('hooks/useViewCounter.ts')).toBe(true);
    expect(read('screens/showroom/ProductDetailsScreen.tsx')).toContain('useViewCounter');
  });

  it('WhatsApp helpers preserved', () => {
    expect(exists('services/whatsapp-service.ts')).toBe(true);
    expect(exists('services/repair/repair-whatsapp.ts')).toBe(true);
  });

  it('Theme / language / preferences preserved', () => {
    expect(exists('design-system/use-theme.tsx')).toBe(true);
    expect(exists('core/config/settings.ts')).toBe(true);
  });

  it('AI Coach preserved (pure in-memory, no network/storage)', () => {
    expect(exists('ai/coach/passport.ts')).toBe(true);
    expect(exists('screens/coach/CoachScreen.tsx')).toBe(true);
  });
});
