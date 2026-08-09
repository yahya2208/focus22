import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openWhatsApp,
  openBuyRequest,
  openSellRequest,
  openExchangeRequest,
  openModelNotFoundRequest,
  buildBuyRequestMessage,
  buildSellRequestMessage,
  buildExchangeRequestMessage,
  buildModelNotFoundMessage,
  buildWhatsAppForActionMessage,
  WHATSAPP_PHONE,
} from '../../services/whatsapp-service';
import { sendRepairRequestWhatsApp } from '../../services/repair/repair-whatsapp';
import { generateRepairCode, type RepairRequest } from '../../services/repair/repair-types';

function makeRepairRequest(): RepairRequest {
  return {
    id: 'test',
    repairCode: generateRepairCode(),
    customerName: 'أحمد العربي',
    customerPhone: '05551148943',
    brandName: 'Samsung',
    modelName: 'A52',
    condition: 'New',
    issue: 'Screen',
    description: 'الشاشة مكسورة',
    latitude: null,
    longitude: null,
    locationAccuracy: null,
    googleMapsLink: 'https://maps.google.com/?q=36.78,3.06',
    photoPaths: [],
    status: 'Pending',
    adminNotes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customerId: null,
    assignedCourierId: null,
    assignedTechnicianId: null,
  };
}

describe('WhatsApp unified send path (launch-blocker fix)', () => {
  const originalOpen = window.open;
  const opened: Array<{ url: string; target?: string; features?: string }> = [];
  const openSpy = vi.fn((url: string, target?: string, features?: string) => {
    opened.push({ url, target, features });
    return {} as Window;
  });

  beforeEach(() => {
    opened.length = 0;
    window.open = openSpy as unknown as typeof window.open;
  });

  afterEach(() => {
    window.open = originalOpen;
    vi.restoreAllMocks();
  });

  function messageFromUrl(url: string): string {
    return decodeURIComponent(url.split('?text=')[1]!);
  }

  it('opens wa.me with the business number in a new tab via window.open', () => {
    openWhatsApp(WHATSAPP_PHONE, 'مرحبا');
    expect(opened).toHaveLength(1);
    const call = opened[0]!;
    expect(call.url).toContain(`https://wa.me/213556254007?text=`);
    expect(call.target).toBe('_blank');
    expect(call.features).toBe('noopener');
  });

  it('falls back to window.location.href when the popup is blocked', () => {
    let capturedUrl = '';
    const origLoc = window.location;
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = {
      set href(v: string) { capturedUrl = v; },
      get href() { return ''; },
    };
    window.open = (() => null) as unknown as typeof window.open;
    try {
      openWhatsApp(WHATSAPP_PHONE, 'مرحبا');
      expect(capturedUrl).toContain(`https://wa.me/213556254007?text=`);
    } finally {
      (window as unknown as Record<string, unknown>).location = origLoc;
      window.open = originalOpen;
    }
  });

  it('sends a clean Arabic repair message with all request details via the unified path', () => {
    const request = makeRepairRequest();
    sendRepairRequestWhatsApp(request);
    expect(opened).toHaveLength(1);
    const url = opened[0]!.url;
    expect(url).toContain(`https://wa.me/213556254007?text=`);
    const message = messageFromUrl(url);
    expect(message).toContain('السلام عليكم.');
    expect(message).toContain('أرغب في إصلاح الهاتف التالي.');
    expect(message).toContain(`📱 الهاتف:\n${request.brandName} ${request.modelName}`);
    expect(message).toContain(`الحالة: ${request.condition}`);
    expect(message).toContain(`🔧 العطل: ${request.issue}`);
    expect(message).toContain(`الوصف: ${request.description}`);
    expect(message).toContain(`🆔 رقم الطلب: ${request.repairCode}`);
    expect(message).toContain(`📞 رقم العميل: ${request.customerPhone}`);
    expect(message).not.toContain('\uFFFD');
    expect(message).not.toContain('Ø');
  });

  it('routes repair, buy, sell, and exchange through the same openWhatsApp path with the same business number', () => {
    openBuyRequest({ brand: 'Samsung', model: 'A52', condition: 'New' });
    openSellRequest({ brand: 'Samsung', model: 'A52', condition: 'New' });
    openExchangeRequest({
      myBrand: 'Samsung',
      myModel: 'A52',
      wantBrand: 'Apple',
      wantModel: 'iPhone 13',
    });
    sendRepairRequestWhatsApp(makeRepairRequest());
    expect(opened).toHaveLength(4);
    const messages = opened.map((call) => {
      expect(call.url).toContain(`https://wa.me/213556254007?text=`);
      return messageFromUrl(call.url);
    });
    for (const message of messages) {
      expect(message).toContain('السلام عليكم.');
      expect(message).not.toContain('Ø');
    }
    expect(messages[0]).toContain('أرغب في شراء الهاتف التالي.');
    expect(messages[1]).toContain('أرغب في بيع الهاتف التالي.');
    expect(messages[2]).toContain('أرغب في استبدال هاتفي.');
    expect(messages[3]).toContain('أرغب في إصلاح الهاتف التالي.');
  });

  it('pure builders match the legacy openers byte-for-byte (message contract preserved)', () => {
    const buyParams = { brand: 'Samsung', model: 'A52', variant: '8/128', condition: 'New' };
    const sellParams = { brand: 'Samsung', model: 'A52', variant: '8/128', condition: 'Used' };
    const exchangeParams = { myBrand: 'Samsung', myModel: 'A52', myVariant: '8/128', wantBrand: 'Apple', wantModel: 'iPhone 13', wantVariant: '128GB' };

    openBuyRequest(buyParams);
    openSellRequest(sellParams);
    openExchangeRequest(exchangeParams);
    openModelNotFoundRequest('Samsung', 'A52');

    const messages = opened.map((call) => messageFromUrl(call.url));
    expect(messages[0]).toBe(buildBuyRequestMessage(buyParams));
    expect(messages[1]).toBe(buildSellRequestMessage(sellParams));
    expect(messages[2]).toBe(buildExchangeRequestMessage(exchangeParams));
    expect(messages[3]).toBe(buildModelNotFoundMessage('Samsung', 'A52'));
  });

  it('buildWhatsAppForActionMessage routes buy/sell/exchange to the same templates as the openers', () => {
    const buyParams = { brand: 'Samsung', model: 'A52', variant: '8/128', condition: 'New' };
    expect(buildWhatsAppForActionMessage('buy', buyParams)).toBe(buildBuyRequestMessage(buyParams));
    expect(buildWhatsAppForActionMessage('sell', buyParams)).toBe(buildSellRequestMessage(buyParams));
    expect(
      buildWhatsAppForActionMessage('exchange', {
        brand: 'Samsung',
        model: 'A52',
        variant: '8/128',
        targetDevice: { brand: 'Apple', model: 'iPhone 13', variant: '128GB' },
      }),
    ).toBe(
      buildExchangeRequestMessage({
        myBrand: 'Samsung',
        myModel: 'A52',
        myVariant: '8/128',
        wantBrand: 'Apple',
        wantModel: 'iPhone 13',
        wantVariant: '128GB',
      }),
    );
  });
});
