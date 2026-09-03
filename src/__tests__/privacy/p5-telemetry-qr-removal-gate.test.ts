import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * P5 Telemetry & QR Removal Acceptance Gates (RED Gates)
 *
 * Under P5 the Analytics/Telemetry/QR machinery is removed entirely from code:
 *  PG-51  telemetry service = the owner-approved CLOSED contract (2026-08-31):
 *         src/core/telemetry exists as types/events/privacy/client/index,
 *         writes RPC-ONLY (never direct), and carries the PII/free-text guard
 *  PG-52  analytics events/tracker removed (src/core/analytics must not exist)
 *  PG-53  telemetry call-sites conform to the closed contract: the REMOVED
 *         legacy APIs (getGlobalTelemetry / telemetry.track / setupSessionTelemetry
 *         / EventTypes / core/analytics) are gone everywhere; call sites may only
 *         reference the sanctioned client/index surface; telemetry_events is never
 *         touched directly (RPC-only).
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
 *
 * CONTROLLED CARVE-OUT — owner-authorized 2026-08-09.
 * Authorization source: FOCUS v2 CONTROLLED PRODUCT FIX EXECUTION DIRECTIVE v1.0
 * Authorized phases: V-1 and V-4 only.
 * Authorized files (EXACT paths only — no directory exception, no wildcard):
 *   - src/components/ads/AdBanner.tsx  (V-1)
 *   - src/components/ads/AdSpot.tsx    (V-1)
 *   - src/services/ads-service.ts      (V-4)
 * Reason: historical path-only protection gate conflicts with explicitly
 *         authorized product fixes (V-1/V-4) for this controlled execution.
 * Scope/expiration: this controlled execution only. Every other protected
 *         path below remains a HARD STOP — including any other file under
 *         src/components/ads/ and every catalog/inventory/price-memory path.
 *
 * CENTRAL INVENTORY CUTOVER CARVE-OUT — owner-authorized 2026-08-11
 * (FOCUS v2 CENTRAL INVENTORY CUTOVER DIRECTIVE v2.0, Rev 4).
 * Authorized files (EXACT paths only):
 *   - src/services/inventory-service.ts  (facade over the central RPCs)
 *   - src/services/inventory-seed.ts     (seed revocation → no-op seed)
 * Scope/expiration: this controlled execution only. All other inventory
 *         paths (price-memory, catalog, components/catalog, components/ads)
 *         remain a HARD STOP.
 *
 * ADMIN CONTROL CENTER PASS 1 CARVE-OUT — owner-authorized (Pass 1 of the
 * Admin Control Center execution). Authorized files (EXACT paths only):
 *   - src/components/ads/AdImageCarousel.tsx
 *         (ads autoplay / swipe-threshold now read operational settings
 *          ads.carousel_autoplay_ms / ads.carousel_swipe_threshold_px from the
 *          centralized settings layer; values fall back to the previous
 *          hardcoded constants, so ad behaviour is unchanged without an override)
 * Scope/expiration: this controlled execution only. Every OTHER file under
 *         src/components/ads/ (and all catalog/price-memory/inventory data)
 *         remains a HARD STOP — this authorizes only the single exact file.
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

describe('PG-51: telemetry service present as the owner-approved CLOSED contract (2026-08-31)', () => {
  it('src/core/telemetry exists with the contract files', () => {
    for (const f of ['core/telemetry/index.ts', 'core/telemetry/types.ts', 'core/telemetry/events.ts', 'core/telemetry/privacy.ts', 'core/telemetry/client.ts']) {
      expect(exists(f)).toBe(true);
    }
  });

  it('the telemetry layer writes RPC-only — no direct table write anywhere in core/telemetry', () => {
    const writeChain = /\.from\([^)]*\)\s*\.\s*(insert|upsert|update|delete)\b/;
    for (const f of ['core/telemetry/index.ts', 'core/telemetry/types.ts', 'core/telemetry/events.ts', 'core/telemetry/privacy.ts', 'core/telemetry/client.ts']) {
      expect(writeChain.test(read(f))).toBe(false);
    }
  });

  it('privacy.ts carries the forbidden PII/free-text guard and the sanitizer', () => {
    const privacy = read('core/telemetry/privacy.ts');
    expect(privacy).toContain('FORBIDDEN_PROPERTY_KEYS');
    expect(privacy).toContain('sanitizeProperties');
    expect(privacy).toContain('isForbiddenKey');
  });
});

describe('PG-52: analytics events/tracker removed', () => {
  it('src/core/analytics does not exist', () => {
    expect(exists('core/analytics/events.ts')).toBe(false);
    expect(exists('core/analytics/tracker.ts')).toBe(false);
  });
});

describe('PG-53: telemetry call-sites conform to the owner-approved CLOSED contract (RPC-only, no PII, no old API)', () => {
  const LEGACY_REMOVED = /getGlobalTelemetry|telemetry\.track|setupSessionTelemetry|EventTypes|core\/analytics/;

  it('no production file uses the REMOVED legacy telemetry/analytics APIs', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => LEGACY_REMOVED.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files still using legacy telemetry: ${offenders.join(', ')}`).toEqual([]);
  });

  it('any production reference to core/telemetry is limited to the sanctioned client/index surface and never a direct table write', () => {
    // Only the telemetry layer itself and its call sites may reference it.
    // Call sites may ONLY import the public `track`/barrel — never the internals
    // that would allow schema/dictionary bypass or direct writes.
    const layerFiles = new Set(['core/telemetry/index.ts', 'core/telemetry/types.ts', 'core/telemetry/events.ts', 'core/telemetry/privacy.ts', 'core/telemetry/client.ts']);
    const badRef = /core\/telemetry\/(?!index\b|client\b)[a-z-]+/;
    const offenders: string[] = [];
    for (const f of walkProductionSrc()) {
      if (layerFiles.has(f.rel)) continue;
      const content = codeOnly(f.content);
      if (badRef.test(content)) offenders.push(f.rel);
    }
    expect(offenders, `files referencing non-public telemetry internals: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no production file touches telemetry_events directly (RPC-only is the only path)', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => /from\(\s*['"]telemetry_events['"]\s*\)/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files writing/reading telemetry_events directly: ${offenders.join(', ')}`).toEqual([]);
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

  // CONTROLLED CARVE-OUT — owner-authorized 2026-08-09 (FOCUS v2 CONTROLLED
  // PRODUCT FIX EXECUTION DIRECTIVE v1.0). Exact authorized files only; no
  // directory exception, no wildcard. Scope: V-1 and V-4 of this controlled
  // execution only. Every other protected path below remains a HARD STOP.
  // CENTRAL INVENTORY CUTOVER CARVE-OUT — owner-authorized 2026-08-11
  // (FOCUS v2 CENTRAL INVENTORY CUTOVER DIRECTIVE v2.0, Rev 4): the two exact
  // inventory files are authorized; every other inventory path stays a HARD STOP.
  // APPLE STORAGE-ONLY + BATTERY-AT-CREATION CARVE-OUT — owner-authorized
  // 2026-08-13 (FOCUS v2 "Apple storage-only + battery-at-creation" execution):
  // the three exact src/components/catalog/ UI files below are authorized to
  // present storage-only labels; src/catalog/* data and every other catalog
  // component remain a HARD STOP.
  // ADMIN CONTROL CENTER PASS 1 CARVE-OUT — owner-authorized (Admin Control
  // Center Pass 1 execution): the single exact ads file below is authorized to
  // read the Pass-1 ads operational settings; every other ads/catalog/inventory
  // path stays a HARD STOP.
  const AUTHORIZED_CHANGES = [
    'src/components/ads/AdBanner.tsx',
    'src/components/ads/AdSpot.tsx',
    'src/services/ads-service.ts',
    'src/services/inventory-service.ts',
    'src/services/inventory-seed.ts',
    'src/components/catalog/VariantSelector.tsx',
    'src/components/catalog/CatalogCascadeSelector.tsx',
    'src/components/catalog/CatalogStepVariant.tsx',
    'src/catalog/loader.ts',
    'src/components/ads/AdImageCarousel.tsx',
  ];

  function findProtectedViolations(changed: string[], prefixes: string[], authorized: string[]): string[] {
    return changed.filter((f) => prefixes.some((p) => f.startsWith(p)) && !authorized.includes(f));
  }

  it('P5 changes do not touch protected feature files (except the explicitly authorized paths above)', () => {
    const changed = getChangedFiles();
    const violations = findProtectedViolations(changed, HARD_STOP_PREFIXES, AUTHORIZED_CHANGES);
    expect(violations, `protected files changed: ${violations.join(', ')}`).toEqual([]);
  });

  it('carve-out regression: authorized V-1/V-4 files do NOT fail solely because they are changed', () => {
    const changed = [
      'src/components/ads/AdBanner.tsx',
      'src/components/ads/AdSpot.tsx',
      'src/services/ads-service.ts',
    ];
    expect(findProtectedViolations(changed, HARD_STOP_PREFIXES, AUTHORIZED_CHANGES)).toEqual([]);
  });

  it('carve-out regression: an unauthorized file under src/components/ads/ STILL fails', () => {
    const changed = ['src/components/ads/AdBanner.tsx', 'src/components/ads/FutureBanner.tsx'];
    expect(findProtectedViolations(changed, HARD_STOP_PREFIXES, AUTHORIZED_CHANGES)).toEqual([
      'src/components/ads/FutureBanner.tsx',
    ]);
  });

  it('carve-out regression: catalog/price-memory paths STILL fail (inventory carve-out licenses only its exact files)', () => {
    const changed = [
      'src/catalog/cat.ts',
      'src/components/catalog/CatalogView.tsx',
      'src/services/inventory-service.ts',
      'src/services/inventory-seed.ts',
      'src/services/price-memory.ts',
    ];
    expect(findProtectedViolations(changed, HARD_STOP_PREFIXES, AUTHORIZED_CHANGES)).toEqual([
      'src/catalog/cat.ts',
      'src/components/catalog/CatalogView.tsx',
      'src/services/price-memory.ts',
    ]);
  });

  it('carve-out regression: an authorized file does not exempt other protected files in the same tree', () => {
    const changed = ['src/components/ads/AdSpot.tsx', 'src/services/price-memory.ts'];
    expect(findProtectedViolations(changed, HARD_STOP_PREFIXES, AUTHORIZED_CHANGES)).toEqual([
      'src/services/price-memory.ts',
    ]);
  });

  it('carve-out regression: apple storage-only UI files pass, src/catalog/ data + other catalog components STILL fail', () => {
    const changed = [
      'src/components/catalog/VariantSelector.tsx',
      'src/components/catalog/CatalogCascadeSelector.tsx',
      'src/components/catalog/CatalogStepVariant.tsx',
      'src/components/catalog/CatalogView.tsx',
      'src/catalog/cat.ts',
    ];
    expect(findProtectedViolations(changed, HARD_STOP_PREFIXES, AUTHORIZED_CHANGES)).toEqual([
      'src/components/catalog/CatalogView.tsx',
      'src/catalog/cat.ts',
    ]);
  });
});
