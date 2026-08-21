import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * View Counter Display Audit — verifies the frontend reads and renders
 * the server's total_views instead of the session-local count.
 *
 * These are structural / source-level tests confirming the wiring is correct.
 * They do NOT test runtime behavior (that is covered by integration tests).
 */

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

describe('View Counter Display — source-level wiring', () => {
  const details = read('screens/showroom/ProductDetailsScreen.tsx');
  const hook = read('hooks/usePhoneViewCounts.ts');
  const service = read('services/view-counter-service.ts');

  it('ProductDetailsScreen imports usePhoneViewCounts', () => {
    expect(details).toContain('usePhoneViewCounts');
  });

  it('ProductDetailsScreen calls usePhoneViewCounts with deviceId', () => {
    expect(details).toMatch(/usePhoneViewCounts\(\s*deviceId\s*\?\s*\[deviceId\]/);
  });

  it('ProductDetailsScreen extracts total_views from the server response', () => {
    expect(details).toContain('total_views');
  });

  it('ProductDetailsScreen renders the server count (serverViews) in the badge', () => {
    expect(details).toContain('serverViews');
    expect(details).toMatch(/serverViews\s*>\s*0.*serverViews.*phoneDetails\.views/);
  });

  it('ProductDetailsScreen does NOT render the session-local count as the badge', () => {
    // The session-local `views` variable from useServerViewCounter should NOT appear in the badge
    const badgeLine = details.split('\n').find((l) => l.includes('phoneDetails.views'));
    expect(badgeLine).toBeTruthy();
    expect(badgeLine).toContain('serverViews');
    expect(badgeLine).not.toMatch(/\{views\}/);
  });

  it('ProductDetailsScreen re-fetches after the view event fires (2.5s timer)', () => {
    expect(details).toContain('refetchViews');
    expect(details).toContain('2500');
  });

  it('ProductDetailsScreen still calls useServerViewCounter for recording', () => {
    expect(details).toContain('useServerViewCounter');
    expect(details).toContain('detail_view');
  });

  it('usePhoneViewCounts returns { counts, refetch } (not just counts)', () => {
    expect(hook).toContain('refetch');
    expect(hook).toMatch(/return\s*\{\s*counts\s*,\s*refetch\s*\}/);
  });

  it('view-counter-service exposes total_views in ViewCountResult', () => {
    expect(service).toContain('total_views');
    expect(service).toContain('unique_views');
  });

  it('get_phone_view_counts RPC returns total_views', () => {
    const migration = read('../supabase/migrations/00029_phone_view_counters.sql');
    expect(migration).toContain("'total_views',  total_views");
    expect(migration).toContain("'unique_views', unique_views");
  });
});
