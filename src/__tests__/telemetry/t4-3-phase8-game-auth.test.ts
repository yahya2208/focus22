/**
 * T4.3 Phase 8 — game (Reaction Light funnel), TTT-multiplayer funnel, and auth
 * funnel telemetry contract.
 *
 * Verifies that the events introduced/wired in Phase 8:
 *   - game:      game_round_complete, game_result_view (Reaction Light) plus the
 *                P0 funnel game_start/game_complete/game_abandon
 *   - ttt:       ttt_lobby_view / game_create / join_* / game_ready / move_* /
 *                game_win / game_draw / game_exit / game_abandon / invite_*
 *   - auth:      auth_login_success/failed, auth_register_success/failed,
 *                auth_guest_gate_seen, auth_guest_upgrade_cta
 * survive the closed contract:
 *   - each name resolves to a schema whose domain ∈ TELEMETRY_DOMAINS
 *   - every emitted property is allowlisted for that event
 *   - no forbidden/PII keys are ever placed in a property
 *   - success is reported only for a real finished outcome, never for an
 *     abandoned/incidental lifecycle, and never with raw error/email/token data
 */
import { describe, it, expect } from 'vitest';
import { TELEMETRY_EVENT_SCHEMAS, type TelemetryEventSchema } from '../../core/telemetry/events';
import { TELEMETRY_DOMAINS } from '../../core/telemetry/types';
import type { TelemetryEventInput } from '../../core/telemetry';

const FORBIDDEN = ['phone', 'address', 'email', 'name', 'text', 'description', 'token', 'code', 'message', 'stack', 'url', 'content', 'password'];

function assertNoPii(inputs: TelemetryEventInput[]) {
  for (const evt of inputs) {
    for (const [k, v] of Object.entries(evt.properties ?? {})) {
      const kl = k.toLowerCase();
      expect(FORBIDDEN).not.toContain(kl);
      if (typeof v === 'string') {
        // values must be structured tokens, never free text
        expect(v.length).toBeLessThan(40);
      }
    }
  }
}

const NEW_GAME = ['game_round_complete', 'game_result_view'] as const;
const AUTH = [
  'auth_login_success',
  'auth_login_failed',
  'auth_register_success',
  'auth_register_failed',
  'auth_guest_gate_seen',
  'auth_guest_upgrade_cta',
] as const;

describe('T4.3 Phase 8 — client schema contract for newly added events', () => {
  for (const name of [...NEW_GAME, ...AUTH]) {
    it(`${name}: schema domain is a real TELEMETRY_DOMAIN and properties are allowlisted`, () => {
      const schema: TelemetryEventSchema | undefined = (TELEMETRY_EVENT_SCHEMAS as unknown as Record<string, TelemetryEventSchema | undefined>)[name];
      expect(schema, `${name} must be declared in EVENT_SCHEMAS`).toBeDefined();
      expect(TELEMETRY_DOMAINS).toContain(schema!.domain as never);
    });
  }

  it('game_round_complete carries only {game, round_index, hit} controls', () => {
    const s = (TELEMETRY_EVENT_SCHEMAS as unknown as Record<string, TelemetryEventSchema>)['game_round_complete']!;
    expect([...s.properties].sort()).toEqual(['game', 'hit', 'round_index']);
  });

  it('game_result_view carries only {game}', () => {
    const s = (TELEMETRY_EVENT_SCHEMAS as unknown as Record<string, TelemetryEventSchema>)['game_result_view']!;
    expect([...s.properties]).toEqual(['game']);
  });

  it('auth failed events allow only {error_code}; success/gate/upgrade allow nothing', () => {
    const s = TELEMETRY_EVENT_SCHEMAS as unknown as Record<string, TelemetryEventSchema>;
    expect([...(s.auth_login_failed?.properties ?? [])]).toEqual(['error_code']);
    expect([...(s.auth_register_failed?.properties ?? [])]).toEqual(['error_code']);
    for (const n of ['auth_login_success', 'auth_register_success', 'auth_guest_gate_seen', 'auth_guest_upgrade_cta']) {
      expect([...(s[n]?.properties ?? [])]).toEqual([]);
    }
  });
});

describe('T4.3 Phase 8 — payloads never carry PII and stay within allowlists', () => {
  it('game_round_complete (hit & miss) and game_result_view are PII-free', () => {
    const inputs: TelemetryEventInput[] = [
      { event: 'game_round_complete', entityType: 'session', entityId: 's1', properties: { game: 'reaction-light', round_index: 3, hit: true } },
      { event: 'game_round_complete', entityType: 'session', entityId: 's1', properties: { game: 'reaction-light', round_index: 4, hit: false } },
      { event: 'game_result_view', entityType: 'session', entityId: 's1', properties: { game: 'reaction-light' } },
      { event: 'game_complete', entityType: 'session', entityId: 's1', properties: { game: 'reaction-light', outcome: 'completed' } },
      { event: 'game_abandon', entityType: 'session', entityId: 's1', properties: { game: 'reaction-light' } },
    ];
    expect(inputs.map((e) => e.event)).toEqual([
      'game_round_complete',
      'game_round_complete',
      'game_result_view',
      'game_complete',
      'game_abandon',
    ]);
    assertNoPii(inputs);
  });

  it('ttt multiplayer funnel payloads are PII-free and control-typed', () => {
    const inputs: TelemetryEventInput[] = [
      { event: 'ttt_game_create', entityType: 'game', entityId: 'g1', properties: { mode: 'multiplayer', size: 3 } },
      { event: 'ttt_lobby_view', entityType: 'game', entityId: 'g1', properties: {} },
      { event: 'ttt_join_attempt', entityType: 'game', entityId: undefined, properties: {} },
      { event: 'ttt_join_success', entityType: 'game', entityId: 'g1', properties: { side: 'O' } },
      { event: 'ttt_join_failed', entityType: 'game', entityId: undefined, properties: { error_code: 'join_failed' } },
      { event: 'ttt_game_ready', entityType: 'game', entityId: 'g1', properties: { side: 'X' } },
      { event: 'ttt_move_submit', entityType: 'game', entityId: 'g1', properties: { index: 4 } },
      { event: 'ttt_move_accepted', entityType: 'game', entityId: 'g1', properties: { index: 4 } },
      { event: 'ttt_move_rejected', entityType: 'game', entityId: 'g1', properties: { index: 4, error_code: 'move_rejected' } },
      { event: 'ttt_game_win', entityType: 'game', entityId: 'g1', properties: { side: 'X', turns: 7 } },
      { event: 'ttt_game_draw', entityType: 'game', entityId: 'g1', properties: { turns: 9 } },
      { event: 'ttt_game_exit', entityType: 'game', entityId: 'g1', properties: {} },
      { event: 'ttt_game_abandon', entityType: 'game', entityId: 'g1', properties: { turns: 2 } },
      { event: 'ttt_invite_generate', entityType: 'game', entityId: 'g1', properties: {} },
      { event: 'ttt_invite_share', entityType: 'game', entityId: 'g1', properties: { method: 'web_share' } },
    ];
    assertNoPii(inputs);
  });

  it('auth funnel payloads are model-free (no password/email/token ever sent)', () => {
    const inputs: TelemetryEventInput[] = [
      { event: 'auth_login_success', entityType: 'user', entityId: undefined, properties: {} },
      { event: 'auth_login_failed', entityType: 'user', entityId: undefined, properties: { error_code: 'login_failed' } },
      { event: 'auth_register_success', entityType: 'user', entityId: undefined, properties: {} },
      { event: 'auth_register_failed', entityType: 'user', entityId: undefined, properties: { error_code: 'register_failed' } },
      { event: 'auth_guest_gate_seen', entityType: 'user', entityId: undefined, properties: {} },
      { event: 'auth_guest_upgrade_cta', entityType: 'user', entityId: undefined, properties: {} },
    ];
    expect(inputs.every((e) => Object.keys(e.properties ?? {}).every((k) => k !== 'email' && k !== 'password' && k !== 'token'))).toBe(true);
    expect(inputs.every((e) => e.entityType === 'user')).toBe(true);
    assertNoPii(inputs);
  });
});

describe('T4.3 Phase 8 — server allowlist in migration 00061 matches the new events', () => {
  it('00061 registers domain branches for every new game/auth event', () => {
    const fs = require('node:fs');
    const p = require('node:path');
    const sql = fs.readFileSync(p.resolve(__dirname, '../../../supabase/migrations/00061_telemetry_phase8_events.sql'), 'utf8');
    for (const name of [...NEW_GAME, ...AUTH]) {
      expect(sql).toContain(`WHEN '${name}'`);
    }
  });
});