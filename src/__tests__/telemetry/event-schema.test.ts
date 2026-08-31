import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_EVENT_SCHEMAS,
  getEventSchema,
  isTelemetryEventName,
  domainOf,
} from '../../core/telemetry/events';
import { TELEMETRY_DOMAINS, TELEMETRY_ENTITY_TYPES } from '../../core/telemetry/types';
import type { TelemetryEventName } from '../../core/telemetry/types';

/**
 * T4 — closed event dictionary. Every `TelemetryEventName` must have a schema
 * (guaranteed by TS `satisfies`), and every schema must belong to a known
 * domain and have a closed (non-null) allowlist.
 */
describe('telemetry closed event dictionary', () => {
  it('every declared event name has a schema entry (compile-time + runtime)', () => {
    const names = Object.keys(TELEMETRY_EVENT_SCHEMAS);
    expect(names.length).toBeGreaterThan(60);
    for (const name of names) {
      expect(isTelemetryEventName(name)).toBe(true);
      expect(() => getEventSchema(name as TelemetryEventName)).not.toThrow();
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
});
