import { describe, it, expect } from 'vitest';
import { shouldShowSwapCallout } from '../../components/layout/AppShell';

describe('AppShell — phone-promo callout visibility', () => {
  it('hides the callout on the vegetables family store only', () => {
    expect(shouldShowSwapCallout('pilot-storefront', { category: 'produce' }, false)).toBe(false);
  });

  it('keeps the callout on the general storefront and all other screens', () => {
    expect(shouldShowSwapCallout('pilot-storefront', {}, false)).toBe(true);
    expect(shouldShowSwapCallout('pilot-storefront', { category: 'phone' }, false)).toBe(true);
    expect(shouldShowSwapCallout('home', {}, false)).toBe(true);
    expect(shouldShowSwapCallout('pilot-checkout', {}, false)).toBe(true);
  });

  it('keeps the existing showroom and fullscreen suppressions', () => {
    expect(shouldShowSwapCallout('showroom', {}, false)).toBe(false);
    expect(shouldShowSwapCallout('home', {}, true)).toBe(false);
    expect(shouldShowSwapCallout('pilot-storefront', { category: 'produce' }, true)).toBe(false);
  });
});
