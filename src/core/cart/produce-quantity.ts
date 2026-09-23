/**
 * Produce (vegetables) quantity UX — scoped rules for produce cart lines ONLY.
 *
 * Spec (locked):
 *   first add = 1 kg · step = 0.5 kg · minimum = 0.5 kg ·
 *   minus at 0.5 kg removes the line instead of clamping.
 *
 * This module intentionally does NOT touch `quantity.ts` (`KG_MIN`, `KG_STEP`,
 * `quantityStep()`, `clampQuantity()`): those stay the shared cross-domain
 * contract, and 0.5 already matches. The only produce-specific decision here
 * is "minus at minimum removes", which the generic clamp deliberately never
 * does (it floors instead). Phone/car/property lines never consult this module.
 */

export const PRODUCE_QTY_FIRST = 1;
export const PRODUCE_QTY_STEP = 0.5;
export const PRODUCE_QTY_MIN = 0.5;

export interface ProduceLineLike {
  readonly domain?: string;
  readonly quantity: number;
  readonly catalogRef: string;
}

/** True only for vegetable/produce cart lines — phones never match. */
export function isProduceLine(line: Pick<ProduceLineLike, 'domain'>): boolean {
  return line.domain === 'produce';
}

export type ProduceStepDown = { action: 'remove' } | { action: 'set'; quantity: number };

/**
 * Minus-button decision for a produce line at `quantity`:
 * at/below 0.5 kg the line is removed, otherwise step down exactly 0.5 kg.
 * (All 0.5-multiples are exact in binary floating point, so no drift.)
 */
export function produceStepDown(quantity: number): ProduceStepDown {
  if (quantity <= PRODUCE_QTY_MIN) return { action: 'remove' };
  return { action: 'set', quantity: quantity - PRODUCE_QTY_STEP };
}
