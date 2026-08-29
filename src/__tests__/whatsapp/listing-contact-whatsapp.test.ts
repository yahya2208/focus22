import { describe, it, expect } from 'vitest';
import {
  buildListingContactMessage,
  listingContactMessage,
  buildWhatsAppUrl,
  WHATSAPP_PHONE,
} from '../../services/whatsapp-service';
import type { ListingContactInfo } from '../../domains/listings';

function makeInfo(overrides?: Partial<ListingContactInfo>): ListingContactInfo {
  return {
    name: 'Toyota Corolla GLX',
    code: 'CAR-2020',
    priceText: '18,500 د.ج',
    city: 'Damascus',
    deepLink: '#/listing-details?id=car_123',
    ...overrides,
  };
}

describe('B1 — listing contact WhatsApp template (Marketplace mediator)', () => {
  it('neutral user request — FOCUS is NOT the seller, no invented intent', () => {
    const message = buildListingContactMessage(makeInfo());
    expect(message).toContain('السلام عليكم،');
    expect(message).toContain('أرغب في التواصل بخصوص الإعلان المعروض في FOCUS.');
    expect(message).not.toContain('أود شراء');
    expect(message).not.toContain('أود استبدال');
    expect(message).not.toContain('بيع');
    expect(message).not.toContain('تقسيط');
  });

  it('builds the exact B1 listing contact message (only real fields)', () => {
    const message = buildListingContactMessage(makeInfo());
    const lines = message.split('\n');
    expect(lines[0]).toBe('السلام عليكم،');
    expect(lines[1]).toBe('مرحبًا، أرغب في التواصل بخصوص الإعلان المعروض في FOCUS.');
    expect(lines[2]).toBe('اسم الإعلان: Toyota Corolla GLX');
    expect(lines[3]).toBe('الكود: CAR-2020');
    expect(lines[4]).toBe('السعر: 18,500 د.ج');
    expect(lines[5]).toBe('المدينة: Damascus');
    expect(lines[6]).toBe('رابط الإعلان: #/listing-details?id=car_123');
    expect(lines[7]).toBe('شكراً.');
  });

  it('omits price/city lines when the presenter provides none', () => {
    const message = buildListingContactMessage(
      makeInfo({ priceText: '', city: '  ' }),
    );
    expect(message).toContain('اسم الإعلان: Toyota Corolla GLX');
    expect(message).not.toContain('السعر:');
    expect(message).not.toContain('المدينة:');
  });

  it('listingContactMessage formats a numeric price and falls back to short id code', () => {
    const message = listingContactMessage({
      id: 'car_abcdef12',
      brand: 'Toyota',
      model: 'Corolla GLX',
      price: 18500,
      city: 'Damascus',
      code: '',
      deepLink: '#/listing-details?id=car_abcdef12',
    });
    expect(message).toContain('اسم الإعلان: Toyota Corolla GLX');
    expect(message).toContain('الكود: car_abcd');
    expect(message).toContain('السعر: 18,500 د.ج');
  });

  it('wa.me URL round-trips the exact message via encodeURIComponent', () => {
    const message = buildListingContactMessage(makeInfo());
    const url = buildWhatsAppUrl(WHATSAPP_PHONE, message);
    expect(url.startsWith('https://wa.me/213556254007?text=')).toBe(true);
    const decoded = decodeURIComponent(url.split('?text=')[1]!);
    expect(decoded).toBe(message);
  });
});
