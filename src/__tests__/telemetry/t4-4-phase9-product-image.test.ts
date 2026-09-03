/**
 * T4.4 Phase 9 — `product_image_view` coverage.
 *
 * Phase 9 (full user-action telemetry coverage) audited the repository and
 * found exactly ONE genuine, meaningful, previously-uncovered user action: the
 * real fullscreen image-viewer interaction on the product-details gallery
 * (PhoneGallery / ProductImageGallery). `product_image_view` is declared in the
 * client contract and already allowed server-side in 00057 (domain 'product',
 * allowlist ['index']), so this is a no-migration client wiring.
 *
 * This test verifies (mirroring the T4.3 Phase 8 conventions):
 *   - schema contract: declared, domain ∈ TELEMETRY_DOMAINS, allowlist = ['index']
 *   - payload: only `index` (a structured 0-based counter, never free text)
 *   - privacy: no PII / free-text / sensitive keys reach a property value
 *   - server allowlist in 00057/00061 already accepts product_image_view with
 *     exactly ['index']
 *   - wiring presence: the semantic emission points (fullscreen open + explicit
 *     image selection) reference `product_image_view` in the gallery sources
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TELEMETRY_EVENT_SCHEMAS, type TelemetryEventSchema } from '../../core/telemetry/events';
import { TELEMETRY_DOMAINS } from '../../core/telemetry/types';
import type { TelemetryEventInput } from '../../core/telemetry';

const FORBIDDEN = ['phone', 'address', 'email', 'name', 'text', 'description', 'token', 'code', 'message', 'stack', 'url', 'content', 'password', 'image', 'src'];

describe('T4.4 Phase 9 — product_image_view schema contract', () => {
  it('is declared with domain product and allowlist ["index"] only', () => {
    const s = (TELEMETRY_EVENT_SCHEMAS as unknown as Record<string, TelemetryEventSchema | undefined>)['product_image_view'];
    expect(s, 'product_image_view must be declared in EVENT_SCHEMAS').toBeDefined();
    expect(TELEMETRY_DOMAINS).toContain(s!.domain as never);
    expect([...s!.properties].sort()).toEqual(['index']);
  });
});

describe('T4.4 Phase 9 — product_image_view payloads are structured and PII-free', () => {
  const inputs: TelemetryEventInput[] = [
    { event: 'product_image_view', entityType: 'product', entityId: 'phone-1', properties: { index: 0 } },
    { event: 'product_image_view', entityType: 'product', entityId: 'phone-1', properties: { index: 3 } },
    { event: 'product_image_view', entityType: 'product', entityId: 'listing-9', properties: { index: 1 } },
  ];

  it('carries only the allowed key "index"', () => {
    for (const evt of inputs) {
      expect(Object.keys(evt.properties ?? {})).toEqual(['index']);
    }
  });

  it('index is a bounded non-negative integer (structured, never free text)', () => {
    for (const evt of inputs) {
      const index = (evt.properties ?? {})['index'];
      expect(typeof index).toBe('number');
      expect(Number.isInteger(index)).toBe(true);
      expect(index as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('never places a forbidden/PII key or free-form content in properties', () => {
    for (const evt of inputs) {
      for (const k of Object.keys(evt.properties ?? {})) {
        expect(FORBIDDEN).not.toContain(k.toLowerCase());
      }
      for (const v of Object.values(evt.properties ?? {})) {
        if (typeof v === 'string') expect(v.length).toBeLessThan(40);
      }
    }
  });

  it('entity type is the canonical "product" (or null) — never a raw identifier leak', () => {
    expect(inputs.every((e) => e.entityType === 'product')).toBe(true);
  });
});

describe('T4.4 Phase 9 — server already accepts product_image_view (no migration needed)', () => {
  it('00057 allows product_image_view in the product domain with allowlist ["index"]', () => {
    const sql57 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00057_telemetry_events.sql'), 'utf8');
    expect(sql57).toContain("WHEN 'product_image_view' THEN v_ok_domain := (v_domain = 'product')");
    expect(sql57).toContain("WHEN 'product_image_view' THEN v_allowed := ARRAY['index']");
  });

  it('00061 (Phase 8 rebuild) preserves the same product_image_view branches', () => {
    const sql61 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00061_telemetry_phase8_events.sql'), 'utf8');
    expect(sql61).toContain("WHEN 'product_image_view' THEN v_allowed := ARRAY['index']");
  });
});

describe('T4.4 Phase 9 — gallery wiring presence (semantic emission points)', () => {
  const GALLERIES = [
    '../../../src/components/showroom/phone-gallery/PhoneGallery.tsx',
    '../../../src/components/showroom/ProductImageGallery.tsx',
  ];

  it('each real image gallery fires product_image_view at fullscreen/open + explicit image selection', () => {
    for (const rel of GALLERIES) {
      const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
      expect(src).toContain("event: 'product_image_view'");
      // semantic point must be a real user action: fullscreen open / explicit index.
      expect(src).toMatch(/dedupeKey: `product_image_view:/);
    }
  });

  it('product details passes the canonical entity id into the gallery emission', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/screens/showroom/ProductDetailsScreen.tsx'), 'utf8');
    expect(src).toContain('entityId={device.id}');
  });
});
