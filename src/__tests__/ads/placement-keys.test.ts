import { describe, it, expect } from 'vitest';
import { AD_PLACEMENTS } from '../../services/ads-service';
import { SHOWROOM_AD_PLACEMENT } from '../../screens/showroom/ShowroomScreen';
import { PRODUCT_DETAILS_AD_PLACEMENT } from '../../screens/showroom/ProductDetailsScreen';

describe('F-102 — unique ad placement keys per surface', () => {
  it('showroom/listing surface uses the "showroom" placement key', () => {
    expect(SHOWROOM_AD_PLACEMENT).toBe('showroom');
    expect(AD_PLACEMENTS).toContain(SHOWROOM_AD_PLACEMENT);
  });

  it('product-details surface uses the "phone-details" placement key', () => {
    expect(PRODUCT_DETAILS_AD_PLACEMENT).toBe('phone-details');
    expect(AD_PLACEMENTS).toContain(PRODUCT_DETAILS_AD_PLACEMENT);
  });

  it('the two surfaces have distinct placement keys', () => {
    expect(SHOWROOM_AD_PLACEMENT).not.toBe(PRODUCT_DETAILS_AD_PLACEMENT);
    expect(new Set(AD_PLACEMENTS).size).toBe(AD_PLACEMENTS.length);
  });

  it('every pre-existing placement is unchanged', () => {
    const existing = ['home', 'phones', 'repair', 'results', 'exchange', 'phone-details'];
    for (const p of existing) {
      expect(AD_PLACEMENTS).toContain(p);
    }
    // exactly one additive key (showroom) on top of the pre-existing six
    expect(AD_PLACEMENTS).toHaveLength(existing.length + 1);
  });
});
