import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { permissionGuard } from '../../core/research/permissions';

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('campaigns dashboard — registration inside ResearchConsole', () => {
  const consoleSrc = stripComments(read('research-console/ResearchConsole.tsx'));

  it('1: mapped to the campaigns resource in DASHBOARD_RESOURCE_MAP', () => {
    expect(consoleSrc).toMatch(/['"]?campaigns['"]?\s*:\s*['"]campaigns['"]/);
  });

  it('2: listed in DASHBOARD_IDS', () => {
    const idsBlock = consoleSrc.slice(consoleSrc.indexOf('DASHBOARD_IDS'), consoleSrc.indexOf('];'));
    expect(idsBlock).toContain("'campaigns'");
  });

  it('3: rendered via CampaignsDashboard component', () => {
    expect(consoleSrc).toMatch(/campaigns:\s*CampaignsDashboard/);
    expect(consoleSrc).toMatch(/import\s+\{\s*CampaignsDashboard\s*\}\s+from\s+'\.\/pages\/campaigns\/CampaignsDashboard'/);
  });
});

describe('campaigns dashboard — navigation entry in ResearchLayout', () => {
  const layoutSrc = stripComments(read('research-console/layout/ResearchLayout.tsx'));

  it('4: DashboardId union includes campaigns', () => {
    expect(layoutSrc).toMatch(/\|?\s*'campaigns'/);
  });

  it('5: DASHBOARDS entry uses the research.nav.campaigns label', () => {
    expect(layoutSrc).toMatch(/id:\s*'campaigns',\s*labelKey:\s*'research\.nav\.campaigns'/);
  });
});

describe('campaigns resource — role gating (admin/super_admin only)', () => {
  it('6: research_admin can read and write campaigns', () => {
    expect(permissionGuard.can('research_admin', 'campaigns', 'read')).toBe(true);
    expect(permissionGuard.can('research_admin', 'campaigns', 'write')).toBe(true);
  });

  it('7: super_admin can read and write campaigns', () => {
    expect(permissionGuard.can('super_admin', 'campaigns', 'read')).toBe(true);
    expect(permissionGuard.can('super_admin', 'campaigns', 'write')).toBe(true);
  });

  it('8: analyst / viewer / none cannot access campaigns', () => {
    expect(permissionGuard.can('analyst', 'campaigns', 'read')).toBe(false);
    expect(permissionGuard.can('viewer', 'campaigns', 'read')).toBe(false);
    expect(permissionGuard.can('none', 'campaigns', 'read')).toBe(false);
  });

  it('9: research_admin cannot delete/export campaigns (no grant)', () => {
    expect(permissionGuard.can('research_admin', 'campaigns', 'delete')).toBe(false);
    expect(permissionGuard.can('research_admin', 'campaigns', 'export')).toBe(false);
  });

  it('10: campaigns resolves through the ResearchConsole read filter (registration completeness)', () => {
    const consoleSrcRaw = read('research-console/ResearchConsole.tsx');
    const idsStart = consoleSrcRaw.indexOf('DASHBOARD_IDS');
    const idsBlock = consoleSrcRaw.slice(idsStart, consoleSrcRaw.indexOf('];', idsStart));
    expect(idsBlock).toContain("'campaigns'");
    expect(consoleSrcRaw).toMatch(/['"]?campaigns['"]?\s*:\s*['"]campaigns['"]/);
    expect(permissionGuard.can('research_admin', 'campaigns', 'read')).toBe(true);
  });
});
