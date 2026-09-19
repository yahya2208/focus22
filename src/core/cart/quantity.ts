/**
 * Cart quantity rules (Gate C1) — a single pure source of truth for how many
 * units of a line a shopper may request.
 *
 * The server (`delivery_create_order`, migration 00104) is authoritative; this
 * module only mirrors its contract so the UI cannot offer a value the server
 * will reject:
 *
 *   kg            -> decimal allowed, rounded to 3 places (e.g. 1.5 / 2.25 kg)
 *   everything else (piece/g/liter/dozen/bag/unknown) -> whole numbers only
 *
 * No money math lives here — `displayUnitPrice × quantity` stays UX-only.
 */

export type QuantityUnit = 'piece' | 'kg' | 'g' | 'liter' | 'dozen' | 'bag';

/** Unit that accepts fractional quantities. Must match migration 00104. */
export const KG_UNIT = 'kg';

/** Maximum decimal places persisted by the server (numeric(12,3)). */
export const QUANTITY_SCALE = 3;

/** Stepper increment for the decimal (kg) unit. */
export const KG_STEP = 0.5;

/** Smallest orderable quantity for decimals and whole units respectively. */
export const KG_MIN = 0.5;
export const WHOLE_MIN = 1;

/** True when a unit permits fractional quantities (kg only). */
export function allowsDecimalQuantity(unit: string | null | undefined): boolean {
  return unit === KG_UNIT;
}

const KNOWN_UNITS: readonly QuantityUnit[] = ['piece', 'kg', 'g', 'liter', 'dozen', 'bag'];

/**
 * Narrow an arbitrary server string to a known cart unit. Unknown/absent values
 * fall back to `undefined` (treated as whole-unit by every helper above), which
 * is the safe default and matches the server's "kg only" decimal rule.
 */
export function normalizeQuantityUnit(unit: string | null | undefined): QuantityUnit | undefined {
  return unit != null && (KNOWN_UNITS as readonly string[]).includes(unit)
    ? (unit as QuantityUnit)
    : undefined;
}

/** Round a finite number to `scale` decimal places; NaN falls back to min. */
export function roundToScale(value: number, scale: number = QUANTITY_SCALE): number {
  if (!Number.isFinite(value)) return WHOLE_MIN;
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

/** Inclusive lower bound for a line of `unit`. */
export function minQuantity(unit: string | null | undefined): number {
  return allowsDecimalQuantity(unit) ? KG_MIN : WHOLE_MIN;
}

/** Stepper increment for a line of `unit`. */
export function quantityStep(unit: string | null | undefined): number {
  return allowsDecimalQuantity(unit) ? KG_STEP : 1;
}

/**
 * Clamp `requested` into the representable range for `unit`, given `stock`.
 *
 * - kg: decimals rounded to 3 places, within [KG_MIN, stock]
 * - whole units: floored to an integer within [1, stock]
 *
 * Stock is floored to the unit minimum so a zero/unknown stock still yields a
 * valid cart line (matching the pre-Gate-C1 behaviour).
 */
export function clampQuantity(
  requested: number,
  stock: number,
  unit: string | null | undefined,
): number {
  const min = minQuantity(unit);
  const safeStock = Number.isFinite(stock) ? stock : min;
  const max = Math.max(min, safeStock);

  if (allowsDecimalQuantity(unit)) {
    const rounded = roundToScale(requested, QUANTITY_SCALE);
    return Math.min(Math.max(rounded, min), max);
  }

  const floored = Math.floor(Number.isFinite(requested) ? requested : min);
  return Math.min(Math.max(floored, min), Math.floor(max));
}

/** Display/input text for a quantity (no trailing fraction on whole units). */
export function formatQuantity(value: number, unit: string | null | undefined): string {
  return allowsDecimalQuantity(unit) ? String(roundToScale(value)) : String(Math.trunc(value));
}
