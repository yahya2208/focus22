import { describe, it, expect } from 'vitest';
import {
  PRODUCE_QTY_FIRST,
  PRODUCE_QTY_STEP,
  PRODUCE_QTY_MIN,
  isProduceLine,
  produceStepDown,
} from '../../core/cart/produce-quantity';

describe('produce quantity UX (locked spec)', () => {
  it('pins the spec constants: first 1 kg, step 0.5 kg, minimum 0.5 kg', () => {
    expect(PRODUCE_QTY_FIRST).toBe(1);
    expect(PRODUCE_QTY_STEP).toBe(0.5);
    expect(PRODUCE_QTY_MIN).toBe(0.5);
  });

  it('matches only produce lines — phones never match', () => {
    expect(isProduceLine({ domain: 'produce' })).toBe(true);
    expect(isProduceLine({ domain: 'phone' })).toBe(false);
    expect(isProduceLine({ domain: 'car' })).toBe(false);
    expect(isProduceLine({})).toBe(false);
  });

  it('walks the locked ladder: 1 → 1.5 → 2 → 1.5 → 1 → 0.5 → removed', () => {
    // first add = 1 kg, then +0.5 steps (exact binary fractions, no drift)
    let qty = PRODUCE_QTY_FIRST;
    qty += PRODUCE_QTY_STEP;
    expect(qty).toBe(1.5);
    qty += PRODUCE_QTY_STEP;
    expect(qty).toBe(2);

    // minus steps back down through the same ladder
    expect(produceStepDown(2)).toEqual({ action: 'set', quantity: 1.5 });
    expect(produceStepDown(1.5)).toEqual({ action: 'set', quantity: 1 });
    // minus from 1 kg becomes 0.5 kg — NOT a removal
    expect(produceStepDown(1)).toEqual({ action: 'set', quantity: 0.5 });
  });

  it('removes only when minus is pressed at 0.5 kg', () => {
    expect(produceStepDown(0.5)).toEqual({ action: 'remove' });
    expect(produceStepDown(1)).not.toEqual({ action: 'remove' });
    expect(produceStepDown(1.5)).not.toEqual({ action: 'remove' });
  });
});
