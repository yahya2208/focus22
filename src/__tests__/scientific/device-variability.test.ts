import { describe, it, expect } from 'vitest';
import { validateDeviceVariability } from '../../core/scientific/validation/device-variability';

describe('validateDeviceVariability', () => {
  it('should detect low variability across devices', () => {
    const devices = new Map([
      ['device-a', [200, 202, 198]],
      ['device-b', [201, 203, 199]],
      ['device-c', [200, 201, 202]],
    ]);
    const r = validateDeviceVariability(devices);
    expect(r.rating).toBe('low');
    expect(r.betweenDeviceCV).toBeLessThanOrEqual(0.05);
  });

  it('should detect high variability across devices', () => {
    const devices = new Map([
      ['device-a', [150, 155, 160]],
      ['device-b', [300, 310, 295]],
    ]);
    const r = validateDeviceVariability(devices);
    expect(r.rating).toBe('high');
  });

  it('should handle single device', () => {
    const devices = new Map([['device-a', [200, 210]]]);
    const r = validateDeviceVariability(devices);
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should handle empty map', () => {
    const r = validateDeviceVariability(new Map());
    expect(r.rating).toBe('low');
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should calculate effect size', () => {
    const devices = new Map([
      ['a', [200, 210]],
      ['b', [250, 260]],
    ]);
    const r = validateDeviceVariability(devices);
    expect(r.deviceEffectSize).toBeGreaterThanOrEqual(0);
  });

  it('should produce validation entries', () => {
    const devices = new Map([
      ['a', [200]],
      ['b', [210]],
    ]);
    const r = validateDeviceVariability(devices);
    expect(r.validations.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle moderate variability', () => {
    const devices = new Map([
      ['a', [200, 210]],
      ['b', [220, 230]],
    ]);
    const r = validateDeviceVariability(devices);
    expect(r.rating).toMatch(/low|moderate/);
  });
});
