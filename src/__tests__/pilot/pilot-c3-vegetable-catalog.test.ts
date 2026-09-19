/**
 * GATE C3 — VEGETABLE CATALOG & FIRST FAMILY PURCHASE (unit regressions).
 *
 * Pins the client contracts the real purchase path depends on:
 *   1. category mapping — produce items reach the cart with a NON-phone domain;
 *   2. DZD currency — the pilot money label is DZD/دج, SAR is gone (presenter
 *      produce formatting is DZD-only);
 *   3. decimal (kg) quantity — 0.5/1.25/2.375 survive the cart clamp with no
 *      Math.floor in the kg path, while whole units stay integer;
 *   4. whole-unit compatibility — 1.5 (piece/phone) must be rejected by the
 *      server contract (00104) and the client clamps it server-mirror;
 *   5. server price authority — the client half never derives the catalog
 *      price; and the settlement contract (00102) posts a single PURCHASE
 *      debit so balance_after = prior − total (ledger, never a column).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { pilotDomain } from '../../screens/pilot/PilotStorefrontScreen';
import {
  allowsDecimalQuantity,
  clampQuantity,
  formatQuantity,
  normalizeQuantityUnit,
  quantityStep,
  minQuantity,
} from '../../core/cart/quantity';
import {
  produceUnitLabel,
  formatProduceAmount,
  formatProduceUnitSuffix,
} from '../../domains/listings';
import { classifySubmissionError } from '../../services/order-service';
import en from '../../i18n/translations/en';
import ar from '../../i18n/translations/ar';

const M104 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00104_numeric_quantity_architecture.sql'),
  'utf-8',
);
const M102 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00102_family_order_settlement.sql'),
  'utf-8',
);

function rpcBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in the migration`).toBeGreaterThan(-1);
  const tail = sql.slice(start);
  const end = tail.search(/\nGRANT |\nREVOKE |\nCREATE OR REPLACE FUNCTION public\.|\nDO \$\$/);
  return end === -1 ? tail : tail.slice(0, end);
}

describe('GATE C3 — vegetable catalog & first family purchase', () => {
  describe('category mapping — produce cart domain (no phone category)', () => {
    it('maps produce listings to the produce cart domain', () => {
      expect(pilotDomain('produce')).toBe('produce');
    });
    it('keeps phone/car/property mapping for the other domains', () => {
      expect(pilotDomain('phone')).toBe('phone');
      expect(pilotDomain('car')).toBe('car');
      expect(pilotDomain('property')).toBe('property');
    });
    it('falls back to phone for unknown categories (safe default)', () => {
      expect(pilotDomain('gadget')).toBe('phone');
    });
  });

  describe('DZD currency — no SAR for Algerian products', () => {
    it('pilot currency label is DZD (en) and دج (ar)', () => {
      expect(en['pilot.currency']).toBe('DZD');
      expect(ar['pilot.currency']).toBe('دج');
    });
    it('produce presenter formats amounts in DZD with a per-unit suffix', () => {
      expect(formatProduceAmount(100)).toBe('100 د.ج');
      expect(formatProduceUnitSuffix('kg')).toBe('د.ج/كغ');
      expect(formatProduceUnitSuffix('piece')).toBe('د.ج/قطعة');
    });
    it('produces a clear price text for the storefront (price + unit label)', () => {
      expect(`${formatProduceAmount(100)} / ${produceUnitLabel('kg')}`).toContain('د.ج / كغ');
    });
  });

  describe('decimal kg quantity (cart quantity.ts mirror)', () => {
    it('allows decimals only for kg', () => {
      expect(allowsDecimalQuantity('kg')).toBe(true);
      expect(allowsDecimalQuantity('piece')).toBe(false);
      expect(allowsDecimalQuantity(null)).toBe(false);
    });
    it('normalizes unknown/absent units to whole-unit-safe undefined', () => {
      expect(normalizeQuantityUnit('kg')).toBe('kg');
      expect(normalizeQuantityUnit('piece')).toBe('piece');
      expect(normalizeQuantityUnit('bushel')).toBeUndefined();
      expect(normalizeQuantityUnit(null)).toBeUndefined();
    });
    it('clamps fractional kg to 3 decimals without flooring (0.5 / 1.25 / 2.375)', () => {
      expect(clampQuantity(0.5, 10, 'kg')).toBe(0.5);
      expect(clampQuantity(1.25, 10, 'kg')).toBe(1.25);
      expect(clampQuantity(2.375, 10, 'kg')).toBe(2.375);
      expect(clampQuantity(1.2347, 10, 'kg')).toBe(1.235);
      expect(clampQuantity(0.1, 10, 'kg')).toBe(0.5); // below kg minimum
    });
    it('caps kg quantity at stock', () => {
      expect(clampQuantity(999, 10, 'kg')).toBe(10);
    });
    it('keeps whole units integer (1.5 → 1) for phones/pieces', () => {
      expect(clampQuantity(1.5, 10, 'piece')).toBe(1);
      expect(clampQuantity(2.9, 10, 'unit')).toBe(2);
      expect(clampQuantity(999, 3, null)).toBe(3);
    });
    it('uses kg step 0.5 and min 0.5; whole step/min 1', () => {
      expect(quantityStep('kg')).toBe(0.5);
      expect(minQuantity('kg')).toBe(0.5);
      expect(quantityStep('piece')).toBe(1);
      expect(minQuantity(null)).toBe(1);
    });
    it('formats kg without flooring and whole units truncated', () => {
      expect(formatQuantity(1.235, 'kg')).toBe('1.235');
      expect(formatQuantity(2.0, 'piece')).toBe('2');
    });
  });

  describe('server contracts (migration content regressions)', () => {
    it('00104 delivery_create_order enforces kg-vs-whole unit server-side', () => {
      const body = rpcBody(M104, 'delivery_create_order');
      expect(body).toContain("v_row_unit = 'kg'");
      expect(body).toContain('v_item_qty <> round(v_item_qty, 3)');
      expect(body).toContain('v_item_qty <> trunc(v_item_qty)');
      expect(body).toContain("RAISE EXCEPTION 'QUANTITY_INVALID'");
      expect(body).toContain('LEAST(v_item_qty, v_row_qty)'); // stock clamp
      expect(body).toContain('v_public_listings'); // authoritative catalog
    });
    it('00104 catalog price is authoritative (client price is never summed)', () => {
      const body = rpcBody(M104, 'delivery_create_order');
      expect(body).toContain('v_item_unit := COALESCE(v_row_price, 0)');
      expect(body).toContain('v_subtotal := v_subtotal + v_item_unit * v_item_qty');
    });
    it('00102 settlement posts ONE PURCHASE debit so balance_after = prior − total', () => {
      const body = rpcBody(M102, 'pilot_family_settle_and_deliver');
      expect(body).toContain("'PURCHASE'");
      expect(body).toContain('-v_final_total');
      expect(body).toContain('v_after := v_prior - v_final_total');
      expect(body).toContain('SUM(l.amount)'); // balance is SUM(ledger), never a column
      expect(body).toContain('ORDER_ALREADY_SETTLED'); // one settlement per order
      expect(body).toContain('v_final_total := v_final_sub + v_delivery_fee'); // + delivery fee
    });
  });

  describe('client submission — quantity passes through, price stays display-only', () => {
    beforeEach(() => vi.resetModules());

    it('classifies the whole-unit fraction rejection as INVALID_ARGUMENTS', () => {
      expect(classifySubmissionError(new Error('QUANTITY_INVALID'))).toBe('INVALID_ARGUMENTS');
    });
  });
});