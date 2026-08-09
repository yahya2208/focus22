import { describe, it, expect, vi } from 'vitest';
import {
  buildWhatsAppUrl,
  buildContactOwnerMessage,
  getPhoneActionContext,
  sendContactOwnerWhatsApp,
  WHATSAPP_PHONE,
} from '../../services/whatsapp-service';
import type { InventoryRecord } from '../../services/inventory-service';

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

describe('BATCH 3 — contact-owner WhatsApp template (mediator only)', () => {
  it('context auto-fills name/code/price/city/link from the record', () => {
    const ctx = getPhoneActionContext(makeDevice());
    expect(ctx.name).toBe('Apple iPhone 13 (128GB)');
    expect(ctx.code).toBe('rec_abcd');
    expect(ctx.price).toBe('98,000');
    expect(ctx.city).toBe('الجزائر');
    expect(ctx.url).toContain('#/phone-details?device=rec_abcdef12');
  });

  it('uses record.code when set instead of the short id', () => {
    const ctx = getPhoneActionContext(makeDevice({ code: 'IP13-1' }));
    expect(ctx.code).toBe('IP13-1');
  });

  it('is a neutral user request — FOCUS is NOT the seller', () => {
    const message = buildContactOwnerMessage(makeDevice());
    expect(message).toContain('مرحبًا، أرغب في التواصل بخصوص الهاتف المعروض في FOCUS.');
    expect(message).not.toContain('أود شراء');
    expect(message).not.toContain('أود استبدال');
    expect(message).not.toContain('أود الاستفسار عن إمكانية التقسيط');
    expect(message).not.toContain('بيع');
  });

  it('uses ONLY real available data — no invented installment/financing terms', () => {
    const message = buildContactOwnerMessage(makeDevice());
    expect(message).toContain('اسم الهاتف: Apple iPhone 13 (128GB)');
    expect(message).toContain('السعر: 98,000 دج');
    expect(message).toContain('المدينة: الجزائر');
    expect(message).toContain('رابط الإعلان:');
    expect(message).not.toContain('تقسيط');
    expect(message).not.toContain('دفعة أولى');
    expect(message).not.toContain('فائدة');
    expect(message).not.toContain('ضمان');
    expect(message).not.toContain('%');
  });

  it('omits price/city lines when the record lacks them', () => {
    const message = buildContactOwnerMessage(makeDevice({ sellPrice: undefined, city: undefined }));
    expect(message).toContain('اسم الهاتف: Apple iPhone 13 (128GB)');
    expect(message).not.toContain('السعر:');
    expect(message).not.toContain('المدينة:');
  });

  it('builds the exact BATCH 3 contact message (neutral opener + only real fields)', () => {
    const message = buildContactOwnerMessage(makeDevice());
    const lines = message.split('\n');
    expect(lines[0]).toBe('السلام عليكم،');
    expect(lines[1]).toBe('مرحبًا، أرغب في التواصل بخصوص الهاتف المعروض في FOCUS.');
    expect(lines[2]).toBe('اسم الهاتف: Apple iPhone 13 (128GB)');
    expect(lines[3]).toBe('الكود: rec_abcd');
    expect(lines[4]).toBe('السعر: 98,000 دج');
    expect(lines[5]).toBe('المدينة: الجزائر');
    expect(lines[6]).toContain('رابط الإعلان:');
    expect(lines[6]).toContain('rec_abcdef12');
    expect(lines[7]).toBe('شكراً.');
  });

  it('wa.me URL round-trips the exact message via encodeURIComponent', () => {
    const message = buildContactOwnerMessage(makeDevice());
    const url = buildWhatsAppUrl(WHATSAPP_PHONE, message);
    expect(url.startsWith('https://wa.me/213556254007?text=')).toBe(true);
    const decoded = decodeURIComponent(url.split('?text=')[1]!);
    expect(decoded).toBe(message);
  });
});

describe('BATCH 3 — sendContactOwnerWhatsApp funnel (§9.2)', () => {
  it('returns the message and opens nothing (pure pipeline entry, no telemetry)', () => {
    const openSpy = vi.spyOn(window, 'open');
    const message = sendContactOwnerWhatsApp(makeDevice());
    expect(openSpy).not.toHaveBeenCalled();
    expect(message).toContain('FOCUS');
    openSpy.mockRestore();
  });
});
