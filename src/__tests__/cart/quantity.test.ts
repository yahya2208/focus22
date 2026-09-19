/**
 * GATE C1 — cart quantity rules (pure, offline).
 *
 * The server (migration 00104) is authoritative; this locks the client mirror:
 *   kg            -> decimals up to 3 places
 *   everything else -> whole numbers only
 * so the UI can never offer what `delivery_create_order` will reject.
 */
import { describe, it, expect } from 'vitest';
import {
  allowsDecimalQuantity,
  clampQuantity,
  formatQuantity,
  minQuantity,
  normalizeQuantityUnit,
  quantityStep,
  roundToScale,
} from '../../core/cart/quantity';

describe('GATE C1 — quantity rules (unit-aware)', () => {
  it('only kg is a decimal unit', () => {
    expect(allowsDecimalQuantity('kg')).toBe(true);
    for (const u of ['piece', 'g', 'liter', 'dozen', 'bag', null, undefined, '', 'bunch', 'phone']) {
      expect(allowsDecimalQuantity(u)).toBe(false);
    }
  });

  it('kg accepts 1 / 1.5 / 2.25 / 5.333 within stock', () => {
    for (const q of [1, 1.5, 2.25, 5.333]) {
      expect(clampQuantity(q, 100, 'kg')).toBe(q);
    }
  });

  it('kg rounds extra precision to 3 places (never more)', () => {
    expect(roundToScale(5.3337, 3)).toBe(5.334);
    expect(clampQuantity(5.3337, 100, 'kg')).toBe(5.334);
    expect(roundToScale(0.12349, 3)).toBe(0.123);
  });

  it('kg clamps to [0.5, stock]', () => {
    expect(clampQuantity(0, 10, 'kg')).toBe(0.5);
    expect(clampQuantity(-3, 10, 'kg')).toBe(0.5);
    expect(clampQuantity(999, 4.2, 'kg')).toBe(4.2);
  });

  it('whole units accept 1 / 12 and floor everything else', () => {
    expect(clampQuantity(1, 100, 'piece')).toBe(1);
    expect(clampQuantity(12, 100, 'piece')).toBe(12);
    // 1.5 pieces is not a thing — it floors to 1 (server would reject 1.5).
    expect(clampQuantity(1.5, 100, 'piece')).toBe(1);
    expect(clampQuantity(2.99, 100, 'bag')).toBe(2);
  });

  it('whole units clamp to [1, stock]; phones behave identically', () => {
    expect(clampQuantity(0, 5, undefined)).toBe(1);
    expect(clampQuantity(-4, 5, null)).toBe(1);
    expect(clampQuantity(99, 5, undefined)).toBe(5);
  });

  it('a zero/unknown stock still yields a valid line', () => {
    expect(clampQuantity(5, 0, undefined)).toBe(1);
    expect(clampQuantity(5, 0, 'kg')).toBe(0.5);
    expect(clampQuantity(NaN, 5, 'kg')).toBe(1);
  });

  it('min/step reflect the unit', () => {
    expect(minQuantity('kg')).toBe(0.5);
    expect(minQuantity('piece')).toBe(1);
    expect(quantityStep('kg')).toBe(0.5);
    expect(quantityStep('piece')).toBe(1);
  });

  it('formats whole units without a fraction and kg exactly', () => {
    expect(formatQuantity(2, 'piece')).toBe('2');
    expect(formatQuantity(1.5, 'kg')).toBe('1.5');
    expect(formatQuantity(2.25, 'kg')).toBe('2.25');
  });

  it('normalizes arbitrary server strings, unknown -> whole-unit default', () => {
    expect(normalizeQuantityUnit('kg')).toBe('kg');
    expect(normalizeQuantityUnit('piece')).toBe('piece');
    expect(normalizeQuantityUnit('bunch')).toBeUndefined();
    expect(normalizeQuantityUnit(null)).toBeUndefined();
    expect(normalizeQuantityUnit('')).toBeUndefined();
  });
});
