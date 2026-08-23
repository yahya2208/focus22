import { describe, it, expect } from 'vitest';

/**
 * Phone Intelligence — behavioral tests.
 *
 * These are structural/SQL-level tests that validate the RPC design
 * without requiring a live database. They check the SQL content for
 * correctness guarantees.
 */
import rpcSql from '../../../supabase/migrations/00031_phone_intelligence_rpc.sql?raw';

describe('get_phone_intelligence RPC — data correctness', () => {
  const lines = rpcSql.split('\n').filter(l => !l.trim().startsWith('--'));
  const sql = lines.join('\n');

  it('7d time range uses exactly 7 days', () => {
    expect(sql).toContain("now() - interval '7 days'");
  });

  it('30d time range uses exactly 30 days', () => {
    expect(sql).toContain("now() - interval '30 days'");
  });

  it('all-time range sets v_since to NULL (no lower bound)', () => {
    expect(sql).toContain('ELSE NULL');
  });

  it('time filtering is applied to all event sources', () => {
    // View events
    expect(sql).toMatch(/phone_view_events.*v_since/s);
    // Search events
    expect(sql).toMatch(/phone_search_events.*v_since/s);
    // Search selections
    expect(sql).toMatch(/phone_search_selections.*v_since/s);
    // Campaign intents
    expect(sql).toMatch(/campaign_intents.*v_since/s);
  });

  it('card_views and detail_views are counted with FILTER clause', () => {
    expect(sql).toContain("COUNT(*) FILTER (WHERE pve.event_type = 'card_view')");
    expect(sql).toContain("COUNT(*) FILTER (WHERE pve.event_type = 'detail_view')");
  });

  it('search selections counted only from phone_search_selections', () => {
    expect(sql).toMatch(/phone_search_selections.*COUNT\(pss\.id\)/s);
  });

  it('whatsapp_intents counted only from campaign_intents with kind=whatsapp_intent', () => {
    expect(sql).toMatch(/campaign_intents.*whatsapp_intent.*COUNT/s);
  });

  it('uses LEFT JOIN for campaign_intents (no FK exists)', () => {
    expect(sql).toMatch(/LEFT JOIN wa_agg wa\s+ON wa\.device_id\s*=\s*ii\.id/);
  });

  it('inventory brand/model/variant are denormalized text, no catalog JOIN', () => {
    // The RPC must NOT join catalog tables directly
    expect(sql).not.toMatch(/JOIN\s+public\.catalog_brands/);
    expect(sql).not.toMatch(/JOIN\s+public\.catalog_models/);
    expect(sql).not.toMatch(/JOIN\s+public\.catalog_variants/);
  });

  it('unique_views counted with DISTINCT + is_unique filter', () => {
    expect(sql).toContain('DISTINCT pve.identity_key');
    expect(sql).toContain('pve.is_unique');
  });

  it('detail_card_ratio formula: detail_views / card_views * 100', () => {
    expect(sql).toContain("'detail_card_ratio'");
    expect(sql).toContain('detail_views');
    expect(sql).toContain('card_views');
  });

  it('search_to_selection_rate formula: selection_count / search_count * 100', () => {
    expect(sql).toContain("'search_to_selection_rate'");
  });

  it('zero-view phones appear via LEFT JOIN from inventory_items', () => {
    // Must use inventory_items as the base with LEFT JOIN to view_agg
    expect(sql).toMatch(/FROM public\.inventory_items ii\s+LEFT JOIN view_agg/);
  });

  it('no INSERT/UPDATE/DELETE in the RPC', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO/);
    expect(sql).not.toMatch(/UPDATE\s+public/);
    expect(sql).not.toMatch(/DELETE\s+FROM/);
  });

  it('popularity score is computed server-side only (not persisted)', () => {
    // The RPC returns demand_score in JSONB but does not persist it
    expect(sql).toContain("'demand_score'");
    expect(sql).not.toMatch(/INSERT.*demand_score|CREATE TABLE.*demand_score/);
  });
});

describe('get_phone_intelligence RPC — security', () => {
  const lines = rpcSql.split('\n').filter(l => !l.trim().startsWith('--'));
  const sql = lines.join('\n');

  it('UNAUTHORIZED returned for non-staff', () => {
    expect(sql).toContain("'UNAUTHORIZED'");
  });

  it('only authenticated can call (no anon)', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_phone_intelligence');
    expect(sql).toContain('TO authenticated');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_phone_intelligence\s+TO\s+anon/);
  });

  it('REVOKE ALL prevents public access', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_phone_intelligence');
    expect(sql).toContain('FROM PUBLIC');
  });

  it('does not expose raw visitor_hash or identity_key', () => {
    // The JSONB output must not include identity_key or visitor_hash
    const outputBlocks = sql.match(/jsonb_build_object\([^)]*\)/g) ?? [];
    for (const block of outputBlocks) {
      expect(block).not.toContain('identity_key');
      expect(block).not.toContain('visitor_hash');
    }
  });

  it('does not use browser device intelligence (DeviceIntelligenceBI data)', () => {
    expect(sql).not.toMatch(/user_agent|browser_|os_name|device_type|screen_resolution/);
  });
});
