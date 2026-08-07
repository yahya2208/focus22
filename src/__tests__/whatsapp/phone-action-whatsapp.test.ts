import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildWhatsAppUrl,
  buildPhoneActionMessage,
  getPhoneActionContext,
  sendPhoneActionWhatsApp,
  WHATSAPP_PHONE,
  type PhoneActionId,
} from '../../services/whatsapp-service';
import type { InventoryRecord } from '../../services/inventory-service';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../core/telemetry', () => ({
  getGlobalTelemetry: () => ({ track, setCampaignId: vi.fn(), setPlacementId: vi.fn(), flush: vi.fn() }),
}));

function makeDevice(overrides?: Partial<InventoryRecord>): InventoryRecord {
  return {
    id: 'rec_abcdef12',
    modelId: 'apple-iphone-13',
    brand: 'Apple',
    model: 'iPhone 13',
    variant: '128GB',
    ram: '4GB',
    storage: '128GB',
    condition: 'New',
    quantity: 1,
    sellPrice: 98000,
    city: 'الجزائر',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalPurchased: 1,
    totalSold: 0,
    ...overrides,
  };
}

describe('Phase 3B §9.1 — phone action WhatsApp templates', () => {
  beforeEach(() => track.mockClear());

  it('context auto-fills name/code/price/city/link from the record', () => {
    const ctx = getPhoneActionContext(makeDevice());
    expect(ctx.name).toBe('Apple iPhone 13 (128GB)');
    expect(ctx.code).toBe('rec_abcd'); // short form of record.id
    expect(ctx.price).toBe('98,000');
    expect(ctx.city).toBe('الجزائر');
    expect(ctx.url).toContain('#/phone-details?device=rec_abcdef12');
  });

  it('uses record.code when set instead of the short id', () => {
    const ctx = getPhoneActionContext(makeDevice({ code: 'IP13-1' }));
    expect(ctx.code).toBe('IP13-1');
  });

  it('formats the price with fixed en-US grouping (locale-independent message)', () => {
    const ctx = getPhoneActionContext(makeDevice({ sellPrice: 105000 }));
    expect(ctx.price).toBe('105,000');
    const message = buildPhoneActionMessage('buy', makeDevice({ sellPrice: 105000 }));
    expect(message).toContain('السعر: 105,000 دج');
    expect(message).not.toContain('105.000');
  });

  it('omits price/city lines when the record lacks them', () => {
    const message = buildPhoneActionMessage('buy', makeDevice({ sellPrice: undefined, city: undefined }));
    expect(message).toContain('اسم الهاتف: Apple iPhone 13 (128GB)');
    expect(message).not.toContain('السعر:');
    expect(message).not.toContain('المدينة:');
  });

  it('builds the exact §9.1 buy message (6 uniform fields + greeting + thanks)', () => {
    const message = buildPhoneActionMessage('buy', makeDevice());
    const lines = message.split('\n');
    expect(lines[0]).toBe('السلام عليكم،');
    expect(lines[1]).toBe('أود شراء الهاتف التالي:');
    expect(lines[2]).toBe('اسم الهاتف: Apple iPhone 13 (128GB)');
    expect(lines[3]).toBe('الكود: rec_abcd');
    expect(lines[4]).toBe('السعر: 98,000 دج');
    expect(lines[5]).toBe('المدينة: الجزائر');
    expect(lines[6]).toContain('رابط الإعلان: /#/phone-details?device=rec_abcdef12');
    expect(lines[7]).toBe('شكراً.');
  });

  it('builds distinct openers for all 4 actions', () => {
    const openers: Record<PhoneActionId, string> = {
      buy: 'أود شراء الهاتف التالي:',
      exchange: 'أود استبدال هاتفي بهذا الجهاز:',
      installment: 'أود الاستفسار عن إمكانية التقسيط لهذا الهاتف:',
      inquiry: 'أود الاستفسار عن هذا الهاتف:',
    };
    for (const action of Object.keys(openers) as PhoneActionId[]) {
      expect(buildPhoneActionMessage(action, makeDevice())).toContain(openers[action]);
    }
  });

  it('sell is NOT part of the details action bar (no بيع template)', () => {
    const all = buildPhoneActionMessage('buy', makeDevice());
    expect(all).not.toContain('بيع');
  });

  it('wa.me URL round-trips the exact message via encodeURIComponent', () => {
    const message = buildPhoneActionMessage('inquiry', makeDevice());
    const url = buildWhatsAppUrl(WHATSAPP_PHONE, message);
    expect(url.startsWith(`https://wa.me/213556254007?text=`)).toBe(true);
    const decoded = decodeURIComponent(url.split('?text=')[1]!);
    expect(decoded).toBe(message);
  });
});

describe('Phase 3B §9.2 — sendPhoneActionWhatsApp funnel', () => {
  beforeEach(() => track.mockClear());

  it('tracks template_selected + whatsapp_clicked with action/device_id, returns the message, opens nothing', () => {
    const openSpy = vi.spyOn(window, 'open');
    const message = sendPhoneActionWhatsApp('installment', makeDevice());
    expect(openSpy).not.toHaveBeenCalled();
    expect(message).toContain('تقسيط');
    expect(track).toHaveBeenCalledTimes(2);
    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toEqual(['whatsapp_template_selected', 'whatsapp_clicked']);
    expect(track).toHaveBeenCalledWith('whatsapp_template_selected', { action: 'installment', device_id: 'rec_abcdef12' });
    expect(track).toHaveBeenCalledWith('whatsapp_clicked', { action: 'installment', device_id: 'rec_abcdef12' });
    openSpy.mockRestore();
  });

  it('does not duplicate exit events (leave those to useSmartWhatsApp)', () => {
    sendPhoneActionWhatsApp('buy', makeDevice());
    const events = track.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === 'exit_attempt' || e === 'exit_confirmed')).toEqual([]);
  });
});
