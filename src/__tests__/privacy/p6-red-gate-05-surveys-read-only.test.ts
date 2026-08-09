import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 05 — Surveys application surface removal
 * (owner decision: R-12 DELETE APP SURFACE).
 *
 * Approved direction (2026-08-08):
 *  - Delete the dormant surveys read surface: getSurveyAnalytics, the
 *    SurveysDashboard, its nav entry, i18n keys, permissions resources, and
 *    the tests tied to it. Verified: no app-side writer, no user-facing flow.
 *  - NO DROP of the surveys table (P9). No SQL in P6.
 *  - Non-survey tables are untouched.
 *
 * INTENTIONALLY RED until P6 execution removes the read surface.
 */

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}

function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('P6-13a: surveys table read removed from production API', () => {
  it('api-supabase has no surveys table read and no getSurveyAnalytics', () => {
    const api = codeOnly(read('core/research/api-supabase.ts'));
    expect(api).not.toContain("from('surveys')");
    expect(api).not.toContain('getSurveyAnalytics');
  });
});

describe('P6-13b: surveys dashboard removed from the research console', () => {
  it('SurveysDashboard page does not exist', () => {
    expect(exists('research-console/pages/surveys/SurveysDashboard.tsx')).toBe(false);
  });

  it('ResearchConsole has no SurveysDashboard import and no surveys tab', () => {
    const consoleFile = codeOnly(read('research-console/ResearchConsole.tsx'));
    expect(consoleFile).not.toContain('SurveysDashboard');
    expect(consoleFile).not.toContain("'surveys'");
  });

  it('ResearchLayout has no surveys nav item', () => {
    const researchLayout = codeOnly(read('research-console/layout/ResearchLayout.tsx'));
    expect(researchLayout).not.toContain("'surveys'");
  });
});

describe('P6-13c: permissions, i18n and tests aligned', () => {
  it('permissions.ts has no surveys resource', () => {
    const perms = codeOnly(read('core/research/permissions.ts'));
    expect(perms).not.toMatch(/resource: 'surveys'/);
  });

  it('no surveys i18n keys remain in en/ar/fr/tr', () => {
    for (const lang of ['en', 'ar', 'fr', 'tr']) {
      const t = codeOnly(read(`i18n/translations/${lang}.ts`));
      expect(t, `${lang}.ts still has surveys keys`).not.toContain("'research.surveys'");
      expect(t, `${lang}.ts still has nav surveys key`).not.toContain("'research.nav.surveys'");
    }
  });

  it('no surveys references remain in tests', () => {
    const apiTest = codeOnly(read('__tests__/research/api.test.ts'));
    expect(apiTest).not.toContain('getSurveyAnalytics');
    const sidebar = codeOnly(read('__tests__/research-console/sidebar-navigation.test.tsx'));
    expect(sidebar).not.toContain("'surveys'");
    const noKey = codeOnly(read('__tests__/research-console/no-key-warnings.test.tsx'));
    expect(noKey).not.toContain('SurveysDashboard');
  });
});
