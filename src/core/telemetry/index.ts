/**
 * FOCUS Telemetry — public barrel (Phase T1, contract approved 2026-08-31).
 *
 * Public surface is intentionally tiny: callers `track()` an event and may
 * toggle the enabled flag. Everything internal (event building, batching,
 * privacy, server wire shape) stays behind the `core/telemetry/*` modules.
 *
 * Re-exports are types-only for the API and the closed event registry so that
 * call sites are strongly typed without exposing internals.
 */
export { track, flushNow, setTelemetryEnabled, resetTelemetry, getTelemetrySessionId } from './client';
export { getEventSchema, isTelemetryEventName, domainOf } from './events';
export { sanitizeEvent, sanitizeProperties, isForbiddenKey, FORBIDDEN_KEYS } from './privacy';

export type { TelemetryEventInput, TelemetryEventName, TelemetryDomain } from './types';
export type { TelemetryEventSchema } from './events';
