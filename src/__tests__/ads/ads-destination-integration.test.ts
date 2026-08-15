import { describe, it, expect, vi, beforeEach } from 'vitest';

// PHASE 3 STEP 4 — integration test (Option B, no live DB).
// Simulates the `ads` table with the destination-aware `ads_enabled_requires_link`
// constraint that 00023 actually installed (supabase/ads-destination-enabled/
// 01-ads-destination-enabled-apply.sql):
//
//   CHECK (enabled = FALSE OR (destination_type = 'phone' AND btrim(link) <> '')
//          OR destination_type IN ('external', 'internal', 'whatsapp'))
//
// The fake upsert ENFORCES that CHECK (plus the row shape the service writes),
// so this exercises the same contract the real Postgres enforces — without a
// live connection. The test drives the real ads-service + real resolver +
// real destination adapters: saveAd → ensureAdsLoaded → getAd →
// resolveDestination → adapter.isValid.

interface AdsRow {
  placement: string;
  enabled: boolean;
  destination_type: string;
  link: string;
  device_id: string;
  alt: string;
  destination: Record<string, unknown>;
  title: string;
  image_url: string;
  image_path: string;
}

const { makeFakeSupabase, getRows, resetTable } = vi.hoisted(() => {
  const rows = new Map<string, AdsRow>();

  function resetTable(): void {
    rows.clear();
  }

  function upsertRow(row: AdsRow): { error: { message: string } | null } {
    const enabled = Boolean(row.enabled);
    const type = row.destination_type ?? 'phone';
    const link = (row.link ?? '').trim();
    // Destination-aware CHECK (00023).
    if (enabled && type === 'phone' && !link) {
      return { error: { message: 'check_violation: ads_enabled_requires_link' } };
    }
    if (!['phone', 'external', 'internal', 'whatsapp'].includes(type)) {
      return { error: { message: 'check_violation: unknown destination_type' } };
    }
    rows.set(row.placement, row);
    return { error: null };
  }

  function selectAll(): { data: AdsRow[]; error: null } {
    return { data: [...rows.values()], error: null };
  }

  function getRows(): Map<string, AdsRow> {
    return rows;
  }

  const mockChannel = {
    on: vi.fn(() => mockChannel),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeFakeSupabase(): any {
    return {
      from: vi.fn((table: string) => {
        if (table === 'ads') {
          return {
            upsert: vi.fn(async (row: Record<string, unknown>) => upsertRow(row as unknown as AdsRow)),
            select: vi.fn(async () => selectAll()),
          };
        }
        // ad_images — empty gallery (legacy mirror only).
        return {
          select: vi.fn(async () => ({ data: [], error: null })),
        };
      }),
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/ads-images/${path}` },
          }),
          upload: vi.fn(async () => ({ error: null })),
          remove: vi.fn(async () => ({ error: null })),
        })),
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
      channel: vi.fn((_name = '') => mockChannel),
    };
  }

  return { makeFakeSupabase, getRows, resetTable };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => makeFakeSupabase(),
}));

import {
  ensureAdsLoaded, getAd, saveAd, resetAdsService, buildAdPhoneLink,
} from '../../services/ads-service';
import { resolveDestination, type DestinationResolverDeps } from '../../services/ad-destination-resolver';
import type { AdPlacement } from '../../services/ads-service';

function makeDeps(): DestinationResolverDeps {
  return {
    placement: 'home' as AdPlacement,
    navigateToDetails: vi.fn(),
    whatsappSend: vi.fn(),
    openInNewTab: vi.fn(),
    openChat: vi.fn(),
    navigateTo: vi.fn(),
  };
}

beforeEach(() => {
  resetTable();
  resetAdsService();
});

describe('Step 4 — AdsManager-style integration: enabled non-phone ads round-trip (post-00023)', () => {
  it('external: save enabled → read back → resolveDestination.isValid true', async () => {
    await saveAd({
      placement: 'home', enabled: true,
      destinationType: 'external',
      destination: { external: { url: 'https://go.example.com/offer' } },
      alt: 'عرض',
    });

    await ensureAdsLoaded();
    const ad = getAd('home');
    expect(ad).not.toBeNull();
    expect(ad?.enabled).toBe(true);
    expect(ad?.destinationType).toBe('external');
    expect(ad?.destination).toEqual({ external: { url: 'https://go.example.com/offer' } });
    expect(ad?.link).toBe('');

    const resolved = resolveDestination(ad!, makeDeps());
    expect(resolved.type).toBe('external');
    if (resolved.type !== 'phone') {
      expect(resolved.isValid).toBe(true);
    }
  });

  it('whatsapp: save enabled → read back → resolveDestination.isValid true', async () => {
    await saveAd({
      placement: 'phones', enabled: true,
      destinationType: 'whatsapp',
      destination: { whatsapp: { number: '+213555001122', message: 'مرحبا' } },
    });

    await ensureAdsLoaded();
    const ad = getAd('phones');
    expect(ad?.enabled).toBe(true);
    expect(ad?.destinationType).toBe('whatsapp');
    expect(ad?.destination).toEqual({ whatsapp: { number: '+213555001122', message: 'مرحبا' } });
    expect(ad?.link).toBe('');

    const resolved = resolveDestination(ad!, makeDeps());
    expect(resolved.type).toBe('whatsapp');
    if (resolved.type !== 'phone') {
      expect(resolved.isValid).toBe(true);
    }
  });

  it('internal: save enabled → read back → resolveDestination.isValid true', async () => {
    await saveAd({
      placement: 'repair', enabled: true,
      destinationType: 'internal',
      destination: { internal: { screen: 'showroom', params: {} } },
    });

    await ensureAdsLoaded();
    const ad = getAd('repair');
    expect(ad?.enabled).toBe(true);
    expect(ad?.destinationType).toBe('internal');
    expect(ad?.destination).toEqual({ internal: { screen: 'showroom', params: {} } });
    expect(ad?.link).toBe('');

    const resolved = resolveDestination(ad!, makeDeps());
    expect(resolved.type).toBe('internal');
    if (resolved.type !== 'phone') {
      expect(resolved.isValid).toBe(true);
    }
  });

  it('phone regression: enabled phone still derives the link and resolves valid', async () => {
    await saveAd({
      placement: 'home', enabled: true,
      deviceId: '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51',
      alt: 'الهاتف الأحدث',
    });

    await ensureAdsLoaded();
    const ad = getAd('home');
    expect(ad?.enabled).toBe(true);
    expect(ad?.destinationType).toBe('phone');
    expect(ad?.link).toBe(buildAdPhoneLink('36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51'));
    expect(ad?.deviceId).toBe('36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51');

    const resolved = resolveDestination(ad!, makeDeps());
    expect(resolved.type).toBe('phone');
  });

  it('phone regression: enabled phone WITHOUT a link is still rejected (00023 keeps the phone rule)', async () => {
    await expect(
      saveAd({ placement: 'home', enabled: true, deviceId: '', alt: '' }),
    ).rejects.toThrow('الإعلان المفعّل يجب أن يحتوي على رابط وجهة (هاتف أو رابط خارجي)');
    // Nothing was written to the fake table.
    expect(getRows().size).toBe(0);
  });

  it('the exact row written for an enabled non-phone ad carries the strict-separation shape', async () => {
    await saveAd({
      placement: 'home', enabled: true,
      destinationType: 'external',
      destination: { external: { url: 'https://go.example.com' } },
    });

    const written = [...getRows().values()][0];
    expect(written).toEqual(expect.objectContaining({
      placement: 'home',
      enabled: true,
      destination_type: 'external',
      destination: { external: { url: 'https://go.example.com' } },
      link: '',
      device_id: '',
    }));
  });
});
