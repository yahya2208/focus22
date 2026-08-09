import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recordIntent, setIntentSenderEnabled } from '../services/intent-tracking';

/**
 * M1 contract (§11): recordIntent is fire-and-forget — it never throws, is never
 * awaited, and returns void so a tracking failure can never block WhatsApp.
 */

describe('M1 — recordIntent fire-and-forget contract', () => {
  beforeEach(() => {
    setIntentSenderEnabled(false);
  });
  afterEach(() => {
    setIntentSenderEnabled(false);
  });

  it('returns void synchronously when tracking is disabled', () => {
    const result = recordIntent({ kind: 'ad_click', ctaType: 'ad_click', placement: 'home', deviceId: 'rec_1' });
    expect(result).toBeUndefined();
  });

  it('returns void synchronously even with the (future) sender enabled', () => {
    setIntentSenderEnabled(true);
    const result = recordIntent({ kind: 'whatsapp_intent', ctaType: 'buy', placement: 'phone-details', deviceId: 'rec_1' });
    expect(result).toBeUndefined();
  });

  it('never throws regardless of the event shape', () => {
    setIntentSenderEnabled(true);
    expect(() => recordIntent({ kind: 'ad_click', ctaType: 'ad_click' })).not.toThrow();
    expect(() => recordIntent({ kind: 'whatsapp_intent', ctaType: 'inquiry' })).not.toThrow();
  });
});
