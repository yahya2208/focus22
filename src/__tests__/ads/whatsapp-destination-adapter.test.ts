import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWhatsAppDestinationAdapter,
  isValidWhatsAppNumber,
  WHATSAPP_MESSAGE_MAX_LENGTH,
} from '../../services/ad-adapters/whatsapp';

const mockRecordIntent = vi.hoisted(() => vi.fn());

vi.mock('../../services/intent-tracking', () => ({
  recordIntent: mockRecordIntent,
}));

type AdapterDeps = Parameters<typeof createWhatsAppDestinationAdapter>[0];
type MockedDeps = AdapterDeps & {
  openChat: ReturnType<typeof vi.fn>;
};

function makeDeps(overrides: Partial<Omit<AdapterDeps, 'openChat'>> = {}): MockedDeps {
  const openChat = vi.fn();
  return {
    placement: 'home',
    number: '+213556254007',
    message: '',
    openChat,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WhatsAppDestinationAdapter (Phase 2 Step 5)', () => {
  it('exposes the four-operation destination contract with type whatsapp', () => {
    const adapter = createWhatsAppDestinationAdapter(makeDeps());
    expect(adapter.type).toBe('whatsapp');
    expect(typeof adapter.canOpenDetails).toBe('function');
    expect(typeof adapter.openDetails).toBe('function');
    expect(typeof adapter.canCallToAction).toBe('function');
    expect(typeof adapter.callToAction).toBe('function');
  });

  it('normalizes a valid number with a leading +', () => {
    const adapter = createWhatsAppDestinationAdapter(makeDeps({ number: '+213556254007' }));
    expect(adapter.isValid).toBe(true);
    expect(adapter.number).toBe('213556254007');
    expect(adapter.canOpenDetails()).toBe(true);
    expect(adapter.canCallToAction()).toBe(true);
  });

  it('normalizes a valid number with a leading 0 (Algerian national format)', () => {
    const adapter = createWhatsAppDestinationAdapter(makeDeps({ number: '0556254007' }));
    expect(adapter.isValid).toBe(true);
    expect(adapter.number).toBe('213556254007');
  });

  it('accepts a raw international number without prefix', () => {
    const adapter = createWhatsAppDestinationAdapter(makeDeps({ number: '213556254007' }));
    expect(adapter.isValid).toBe(true);
    expect(adapter.number).toBe('213556254007');
  });

  it('accepts an 8-digit minimum and a 15-digit E.164 maximum', () => {
    expect(isValidWhatsAppNumber('12345678')).toBe(true);
    expect(isValidWhatsAppNumber('123456789012345')).toBe(true);
  });

  it('rejects empty, whitespace, non-numeric and out-of-range numbers', () => {
    expect(isValidWhatsAppNumber('')).toBe(false);
    expect(isValidWhatsAppNumber('   ')).toBe(false);
    expect(isValidWhatsAppNumber('abc')).toBe(false);
    expect(isValidWhatsAppNumber('+')).toBe(false);
    expect(isValidWhatsAppNumber('123')).toBe(false);
    expect(isValidWhatsAppNumber('1234567')).toBe(false);
    expect(isValidWhatsAppNumber('1234567890123456')).toBe(false);
  });

  it('invalid number → NON-INTERACTIVE with number="" (never-dead-target)', () => {
    const deps = makeDeps({ number: 'not-a-number' });
    const adapter = createWhatsAppDestinationAdapter(deps);
    expect(adapter.isValid).toBe(false);
    expect(adapter.number).toBe('');
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
    adapter.openDetails();
    adapter.callToAction();
    expect(deps.openChat).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('keeps the optional message trimmed', () => {
    const adapter = createWhatsAppDestinationAdapter(makeDeps({ message: '  السلام عليكم  ' }));
    expect(adapter.isValid).toBe(true);
    expect(adapter.message).toBe('السلام عليكم');
  });

  it('caps an over-long message to bound the wa.me URL', () => {
    const long = 'x'.repeat(WHATSAPP_MESSAGE_MAX_LENGTH + 500);
    const adapter = createWhatsAppDestinationAdapter(makeDeps({ message: long }));
    expect(adapter.message.length).toBe(WHATSAPP_MESSAGE_MAX_LENGTH);
  });

  it('callToAction records ad_click then whatsapp_handoff_started (placement-only) and opens the chat once', () => {
    const deps = makeDeps({ number: '0556254007', message: 'استفسار' });
    const adapter = createWhatsAppDestinationAdapter(deps);
    adapter.callToAction();
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home' });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home' });
    expect(mockRecordIntent).toHaveBeenCalledTimes(2);
    expect(deps.openChat).toHaveBeenCalledTimes(1);
    expect(deps.openChat).toHaveBeenCalledWith('213556254007', 'استفسار');
  });

  it('openDetails is the same chat surface (symmetric target), opened once', () => {
    const deps = makeDeps({ number: '+213556254007' });
    const adapter = createWhatsAppDestinationAdapter(deps);
    adapter.openDetails();
    expect(deps.openChat).toHaveBeenCalledTimes(1);
    expect(deps.openChat).toHaveBeenCalledWith('213556254007', '');
    expect(mockRecordIntent).toHaveBeenCalledTimes(2);
  });

  it('tracking failure never blocks the chat (fire-and-forget)', () => {
    mockRecordIntent.mockImplementation(() => {
      throw new Error('tracking down');
    });
    const deps = makeDeps();
    const adapter = createWhatsAppDestinationAdapter(deps);
    expect(() => adapter.callToAction()).not.toThrow();
    expect(deps.openChat).toHaveBeenCalledTimes(1);
  });

  it('never exposes phone surfaces (no deviceId, no isContact leak)', () => {
    const adapter = createWhatsAppDestinationAdapter(makeDeps());
    expect(adapter).not.toHaveProperty('deviceId');
    expect(adapter).not.toHaveProperty('isContact');
    expect(adapter).not.toHaveProperty('hasSlideDevices');
  });

  it('creates no side effects at creation time (render-safe resolve)', () => {
    const deps = makeDeps();
    createWhatsAppDestinationAdapter(deps);
    expect(deps.openChat).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });
});
