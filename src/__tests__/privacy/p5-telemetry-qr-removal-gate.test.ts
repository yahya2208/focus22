import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * P5 Telemetry & QR Removal Acceptance Gates (RED Gates)
 *
 * Under P5 the Analytics/Telemetry/QR machinery is removed entirely from code:
 *  PG-51  telemetry service removed (src/core/telemetry must not exist)
 *  PG-52  analytics events/tracker removed (src/core/analytics must not exist)
 *  PG-53  no telemetry call-sites left anywhere in production src
 *         (getGlobalTelemetry / .track( / tracker imports / EventTypes)
 *  PG-54  no QR campaign attribution left in navigation/state
 *         (START_QR_FLOW, isQrFlow, campaignId, placementId)
 *  PG-55  QR campaign/referral/deeplink/consent modules removed (src/core/qr)
 *  PG-56  data-service REMOVED — no analytics_events / qr_codes / campaigns /
 *         placements / lookupScanContext readers or writers remain
 *  PG-57  ShareScreen no longer generates QR codes or tracks qr_generated
 *
 * KEEP gates (protected surfaces must survive P5):
 *  PG-58  RepairQR + qrcode dependency preserved (Repair feature)
 *  PG-59  WhatsApp direct handoff (buildWhatsAppUrl + window.location.href) preserved
 *  PG-60  game engine + in-memory session service preserved
 *  PG-61  catalog/inventory/ads files untouched by P5 changes
 *         (owner decision D3 explicitly authorized track-stripping in the
 *          showroom/whatsapp feature files; their functional KEEP behaviour is
 *          covered by PG-58/PG-59)
 */

const SRC = path.resolve(__dirname, '../..');
const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}

// Behavioural scan excludes comments so explanatory docs do not break gates.
function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walkProductionSrc(): Array<{ rel: string; content: string }> {
  const out: Array<{ rel: string; content: string }> = [];
  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(p, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ rel: prefix ? `${prefix}/${entry.name}` : entry.name, content: fs.readFileSync(p, 'utf-8') });
      }
    }
  }
  walk(SRC, '');
  return out;
}

function getChangedFiles(): string[] {
  try {
    const out = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf-8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

describe('PG-51: telemetry service removed', () => {
  it('src/core/telemetry does not exist', () => {
    expect(exists('core/telemetry/index.ts')).toBe(false);
  });
});

describe('PG-52: analytics events/tracker removed', () => {
  it('src/core/analytics does not exist', () => {
    expect(exists('core/analytics/events.ts')).toBe(false);
    expect(exists('core/analytics/tracker.ts')).toBe(false);
  });
});

describe('PG-53: no telemetry call-sites in production src', () => {
  it('no file imports or uses the telemetry service', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) =>
        /getGlobalTelemetry|core\/telemetry|\.track\s*\(|telemetry\.track|EventTypes|core\/analytics/.test(f.content),
      )
      .map((f) => f.rel);
    expect(offenders, `files still using telemetry: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('PG-54: no QR campaign attribution in navigation/state', () => {
  it('store/navigation.tsx has no START_QR_FLOW and no attribution state', () => {
    const nav = codeOnly(read('store/navigation.tsx'));
    expect(nav).not.toContain('START_QR_FLOW');
    expect(nav).not.toContain('isQrFlow');
    expect(nav).not.toContain('campaignId');
    expect(nav).not.toContain('placementId');
    expect(nav).not.toContain('emitNavigationAnalytics');
  });
});

describe('PG-55: QR campaign/referral/deeplink/consent modules removed', () => {
  it('src/core/qr contains no campaign/referral/deeplink/consent modules', () => {
    expect(exists('core/qr/campaign.ts')).toBe(false);
    expect(exists('core/qr/referral.ts')).toBe(false);
    expect(exists('core/qr/deeplink.ts')).toBe(false);
    expect(exists('core/qr/consent.ts')).toBe(false);
  });
});

describe('PG-56: data-service ABSENT — no analytics/qr/campaign readers or writers remain', () => {
  it('core/supabase/data-service.ts does not exist (removed 2026-08-08)', () => {
    expect(exists('core/supabase/data-service.ts')).toBe(false);
  });

  it('no production file calls the removed data-service API', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) =>
        /core\/supabase\/data-service|from\(['"]analytics_events['"]\)|from\(['"]qr_codes['"]\)|lookupScanContext/.test(f.content),
      )
      .map((f) => f.rel);
    expect(offenders, `files still referencing data-service/qr/analytics: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('PG-57: ShareScreen no QR generation / qr_generated tracking', () => {
  it('ShareScreen.tsx has no QR generation or qr_generated telemetry', () => {
    const share = codeOnly(read('screens/share/ShareScreen.tsx'));
    expect(share).not.toContain('generateQRDataUrl');
    expect(share).not.toContain('qr_generated');
    expect(share).not.toContain('share_clicked');
  });
});

describe('PG-58: KEEP — RepairQR + qrcode dependency preserved', () => {
  it('RepairQR.tsx still renders a QR for repair tracking', () => {
    const repairQr = codeOnly(read('components/repair/RepairQR.tsx'));
    expect(repairQr).toContain("from 'qrcode'");
    expect(repairQr).toContain('QRCode.toDataURL');
  });
});

describe('PG-59: KEEP — WhatsApp direct handoff preserved', () => {
  it('useSmartWhatsApp still navigates directly via wa.me (same-tab)', () => {
    const hook = codeOnly(read('hooks/useSmartWhatsApp.ts'));
    expect(hook).toContain('buildWhatsAppUrl');
    expect(hook).toContain('window.location.href');
  });
});

describe('PG-60: KEEP — game engine + in-memory session preserved', () => {
  it('game engine files exist', () => {
    for (const rel of ['core/engine/consistency.ts', 'core/engine/fatigue.ts', 'core/engine/reaction.ts', 'core/engine/scoring.ts']) {
      expect(exists(rel)).toBe(true);
    }
  });

  it('in-memory session service exists and carries no user identity', () => {
    const svc = codeOnly(read('core/session/service.ts'));
    expect(svc).not.toContain('user_id');
  });
});

describe('PG-61: KEEP — catalog/inventory/ads untouched by P5 (D3)', () => {
  const HARD_STOP_PREFIXES = [
    'src/catalog/',
    'src/components/catalog/',
    'src/components/ads/',
    'src/services/inventory-service.ts',
    'src/services/inventory-seed.ts',
    'src/services/price-memory.ts',
    'src/services/ads-service.ts',
  ];

  it('P5 changes do not touch protected feature files', () => {
    const changed = getChangedFiles();
    const violations = changed.filter((f) => HARD_STOP_PREFIXES.some((p) => f.startsWith(p)));
    expect(violations, `protected files changed: ${violations.join(', ')}`).toEqual([]);
  });
});
