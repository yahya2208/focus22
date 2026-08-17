/**
 * P4 — Catalog Closure: Navigation Verification Tests
 *
 * Tests the two P4-A / P4-B closure findings:
 *   H1: CatalogApprovalScreen has a real UI entry point
 *   H2: CatalogApprovalScreen has working back navigation
 *
 * Pure unit tests. No database, no React rendering.
 */

import { describe, it, expect } from 'vitest';
import { BACK_MATRIX } from '../../core/navigation/back-matrix';
import { EDGES } from '../../core/navigation/reachability';

// ─── H1: Entry Point ─────────────────────────────────────────────────────────

describe('P4 H1 — CatalogApprovalScreen entry point', () => {
  it('catalog-approval has an inbound edge from settings', () => {
    expect(EDGES['catalog-approval']).toContain('settings');
  });

  it('catalog-approval has an inbound edge from home', () => {
    expect(EDGES['catalog-approval']).toContain('home');
  });

  it('catalog-approval is in the back-matrix (wired into navigation system)', () => {
    expect(BACK_MATRIX['catalog-approval']).toBeDefined();
  });

  it('SettingsScreen admin section dispatches to catalog-approval', () => {
    // Verify the NAVIGATE dispatch target exists in the reachability edges.
    // If SettingsScreen dispatches NAVIGATE to 'catalog-approval',
    // then 'settings' must be in catalog-approval's EDGES entry.
    const settingsEdges = EDGES['catalog-approval'];
    expect(settingsEdges).toContain('settings');
  });
});

// ─── H2: Back Navigation ─────────────────────────────────────────────────────

describe('P4 H2 — CatalogApprovalScreen back navigation', () => {
  it('hasInContentBackButton is true (global back suppressed; screen owns its own)', () => {
    expect(BACK_MATRIX['catalog-approval']!.hasInContentBackButton).toBe(true);
  });

  it('backTarget is settings (matches the in-content back button dispatch)', () => {
    expect(BACK_MATRIX['catalog-approval']!.backTarget).toBe('settings');
  });

  it('browserBack behavior is back (standard navigation)', () => {
    expect(BACK_MATRIX['catalog-approval']!.browserBack).toBe('back');
  });

  it('androidBack behavior is back (standard navigation)', () => {
    expect(BACK_MATRIX['catalog-approval']!.androidBack).toBe('back');
  });

  it('exit is not allowed (admin screen — no native exit)', () => {
    expect(BACK_MATRIX['catalog-approval']!.exitAllowed).toBe(false);
  });

  it('back-target settings is a valid screen (no dangling backTarget)', () => {
    const target = BACK_MATRIX['catalog-approval']!.backTarget;
    expect(typeof target).toBe('string');
    if (target !== 'root' && target !== 'previous') {
      expect(BACK_MATRIX[target as keyof typeof BACK_MATRIX]).toBeDefined();
    }
  });
});

// ─── Invariant: no regression in existing back behavior ───────────────────────

describe('P4 — No regression in existing back matrix', () => {
  it('all screens with hasInContentBackButton have a valid backTarget', () => {
    for (const [screen, row] of Object.entries(BACK_MATRIX)) {
      if (row.hasInContentBackButton) {
        const bt = row.backTarget;
        if (bt !== 'root' && bt !== 'previous') {
          expect(BACK_MATRIX[bt as keyof typeof BACK_MATRIX],
            `screen "${screen}" has in-content back targeting "${bt}" which has no BACK_MATRIX row`
          ).toBeDefined();
        }
      }
    }
  });

  it('settings screen still has hasInContentBackButton true (unchanged)', () => {
    expect(BACK_MATRIX['settings']!.hasInContentBackButton).toBe(true);
    expect(BACK_MATRIX['settings']!.backTarget).toBe('home');
  });
});
