/**
 * T4.6 — listing_edit_start wiring regression.
 *
 * The edit UI (EditListingModal) is opened by its parent via conditional mount
 * (`{editingListing && <EditListingModal …/>}` in CatalogInventoryScreen), so
 * *mounting the modal is the canonical "edit started" point*. This spec proves
 * behaviourally that opening the modal fires exactly ONE `listing_edit_start`
 * and that subsequent re-renders do not re-fire it (single-fire guarantee).
 *
 * No DB/RPC/registry/migrations are touched: the event is sent via the
 * existing telemetry `track` from the component and pairs with the already
 * emitted `listing_edit_success` in listing-service.updateListingCore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { ListingRecord, ListingPricePeriod } from '../../domains/listings/types';
import { EditListingModal } from '../../components/inventory/listings/EditListingModal';

const h = vi.hoisted(() => ({
  mockTrack: vi.fn(),
}));

vi.mock('../../core/telemetry', () => ({ track: h.mockTrack }));

vi.mock('../../services/listing-service', () => ({
  updateListingCore: vi.fn().mockResolvedValue(undefined),
  updateListingDetails: vi.fn().mockResolvedValue(undefined),
}));

function eventsOf(name: string) {
  return (h.mockTrack.mock.calls as Array<[{ event: string }]>).map((c) => c[0]).filter((e) => e.event === name);
}

const FORBIDDEN = ['phone', 'address', 'email', 'name', 'text', 'description', 'token', 'code', 'message', 'stack', 'url', 'content'];

function assertNoPii() {
  for (const call of h.mockTrack.mock.calls as Array<[{ event: string; properties?: Record<string, unknown> }]>) {
    const evt = call[0];
    const keys = Object.keys(evt.properties ?? {}).map((k) => k.toLowerCase());
    for (const k of keys) expect(FORBIDDEN).not.toContain(k);
  }
}

function mockColors(): ThemeColors {
  return {
    bg: '', bgCard: '', bgInput: '', bgHover: '', border: '', borderLight: '',
    text: '', textSecondary: '', textMuted: '', textFaint: '', accent: '', accentLight: '',
    accentGlow: '', success: '', successBg: '', successText: '', danger: '', dangerBg: '',
    dangerText: '', warning: '', warningBg: '', warningText: '', info: '', infoBg: '',
    infoText: '', progressBg: '', shadow: '', glass: '', glassBorder: '', gradient: '',
  } as ThemeColors;
}

function carRecord(): ListingRecord {
  return {
    id: 'L1',
    category: 'car',
    brand: 'Kia',
    model: 'Sportage',
    description: 'مستعملة نظيفة',
    color: 'White',
    city: 'Damascus',
    warranty: '',
    code: 'ABC123',
    price: { amount: 22000, period: 'sale' as ListingPricePeriod },
    conditionGroup: 'used',
    quantity: 1,
    status: 'in_stock',
    isPublished: true,
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    car: {
      trim: 'EX',
      year: 2022,
      mileageKm: 15000,
      fuel: 'diesel',
      transmission: 'manual',
      bodyType: 'suv',
      engineCc: 2000,
      conditionState: 'used',
    },
  };
}

afterEach(() => cleanup());

describe('EditListingModal — listing_edit_start on open', () => {
  beforeEach(() => {
    h.mockTrack.mockClear();
    vi.clearAllMocks();
  });

  function renderModal() {
    return render(
      <EditListingModal
        record={carRecord()}
        colors={mockColors()}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
  }

  it('fires exactly one listing_edit_start with entityType listing and no PII on open', () => {
    renderModal();
    const edits = eventsOf('listing_edit_start');
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ event: 'listing_edit_start', entityType: 'listing' });
    assertNoPii();
  });

  it('does not re-fire listing_edit_start across re-renders (single-fire guarantee)', () => {
    const { rerender } = renderModal();
    // Simulate the form state changing (typing) after mount — the effect must
    // NOT be re-run, so the count stays at exactly one.
    const r = carRecord();
    rerender(
      <EditListingModal
        record={{ ...r, description: 'تعديل' }}
        colors={mockColors()}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.change(document.querySelector('input')!, { target: { value: 'Kia' } });
    expect(eventsOf('listing_edit_start')).toHaveLength(1);
  });

  it('a fresh mount (new edit session) fires one more listing_edit_start', () => {
    renderModal();
    cleanup();
    renderModal();
    expect(eventsOf('listing_edit_start')).toHaveLength(2);
  });
});
