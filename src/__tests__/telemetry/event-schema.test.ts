import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_EVENT_SCHEMAS,
  getEventSchema,
  isTelemetryEventName,
  domainOf,
  isEventEmitted,
  EMITTED_TELEMETRY_EVENT_NAMES,
  UNEMITTED_TELEMETRY_EVENT_NAMES,
} from '../../core/telemetry/events';
import { TELEMETRY_DOMAINS, TELEMETRY_ENTITY_TYPES } from '../../core/telemetry/types';
import type { TelemetryEventName } from '../../core/telemetry/types';

/**
 * T4 — closed event dictionary. Every `TelemetryEventName` must have a schema
 * (guaranteed by TS `satisfies`), and every schema must belong to a known
 * domain and have a closed (non-null) allowlist.
 */
describe('telemetry closed event dictionary', () => {
  it('registry is exactly 97 canonical events across exactly 14 domains', () => {
    const names = Object.keys(TELEMETRY_EVENT_SCHEMAS);
    const domains = new Set(Object.values(TELEMETRY_EVENT_SCHEMAS).map((s) => s.domain));
    expect(names.length).toBe(97);
    expect(domains.size).toBe(14);
  });

  it('every declared event name has a schema entry (compile-time + runtime)', () => {
    const names = Object.keys(TELEMETRY_EVENT_SCHEMAS);
    expect(names.length).toBeGreaterThan(60);
    for (const name of names) {
      expect(isTelemetryEventName(name)).toBe(true);
      expect(() => getEventSchema(name as TelemetryEventName)).not.toThrow();
    }
  });

  it('event names are unique and well-formed snake_case (noun_action)', () => {
    const names = Object.keys(TELEMETRY_EVENT_SCHEMAS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('every schema domain is part of the closed domain taxonomy', () => {
    for (const schema of Object.values(TELEMETRY_EVENT_SCHEMAS)) {
      expect(TELEMETRY_DOMAINS).toContain(schema.domain);
    }
  });

  it('schema versions are positive integers (default 1)', () => {
    for (const schema of Object.values(TELEMETRY_EVENT_SCHEMAS)) {
      expect(schema.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('entity types are closed and include catalog slugs + uuids (entity_id is TEXT)', () => {
    expect(TELEMETRY_ENTITY_TYPES).toContain('catalog_product');
    expect(TELEMETRY_ENTITY_TYPES).toContain('product');
    expect(TELEMETRY_ENTITY_TYPES).toContain('listing');
    expect(new Set(TELEMETRY_ENTITY_TYPES).size).toBe(TELEMETRY_ENTITY_TYPES.length);
  });

  it('domainOf concurs with each schema domain', () => {
    for (const name of Object.keys(TELEMETRY_EVENT_SCHEMAS)) {
      expect(domainOf(name as TelemetryEventName)).toBe(
        TELEMETRY_EVENT_SCHEMAS[name as TelemetryEventName].domain,
      );
    }
  });

  it('the whatsapp canonical event exists (whatsapp_open), legacy whatsapp_handoff_started stays outside telemetry', () => {
    expect(isTelemetryEventName('whatsapp_open')).toBe(true);
    expect(isTelemetryEventName('whatsapp_handoff_started')).toBe(false);
  });

  it('emitted/un-emitted split: 88 emitted + 9 defined-but-unemitted (no drift)', () => {
    expect(EMITTED_TELEMETRY_EVENT_NAMES.length).toBe(88);
    expect(UNEMITTED_TELEMETRY_EVENT_NAMES.length).toBe(9);
    const unemitted = [...UNEMITTED_TELEMETRY_EVENT_NAMES].sort();
    expect(unemitted).toEqual([
      'app_error',
      'app_update_detected',
      'game_pause',
      'game_resume',
      'listing_share',
      'navigation_exit',
      'product_details_expand',
      'product_favorite',
      'product_variant_select',
    ]);
    for (const ev of unemitted) expect(isEventEmitted(ev)).toBe(false);
    for (const ev of EMITTED_TELEMETRY_EVENT_NAMES) expect(isEventEmitted(ev)).toBe(true);
  });

  it('family_id is a closed-contract property ONLY for the family-context events', () => {
    expect(isTelemetryEventName('family_view')).toBe(true);
    expect(getEventSchema('family_view').properties).toContain('family_id');
    expect(getEventSchema('checkout_submit').properties).toContain('family_id');
    expect(getEventSchema('order_created').properties).toContain('family_id');
    const withFamily = Object.values(TELEMETRY_EVENT_SCHEMAS).filter((s) =>
      (s as { properties: readonly string[] }).properties.includes('family_id'),
    );
    expect(withFamily.length).toBe(3);
  });
});
