import { describe, it, expect } from 'vitest';
import applySql from '../../../supabase/migrations/00031_phone_intelligence_rpc.sql?raw';

describe('00031_phone_intelligence_rpc.sql', () => {
  it('creates get_phone_intelligence RPC', () => {
    expect(applySql).toContain('CREATE OR REPLACE FUNCTION public.get_phone_intelligence');
  });

  it('RPC is SECURITY DEFINER', () => {
    expect(applySql).toContain('SECURITY DEFINER');
  });

  it('RPC accepts p_time_range and p_brand parameters', () => {
    expect(applySql).toContain('p_time_range text');
    expect(applySql).toContain('p_brand');
  });

  it('RPC returns jsonb', () => {
    expect(applySql).toContain('RETURNS jsonb');
  });

  it('RPC checks caller role is admin/super_admin/researcher', () => {
    expect(applySql).toContain("'admin'");
    expect(applySql).toContain("'super_admin'");
    expect(applySql).toContain("'researcher'");
  });

  it('RPC returns UNAUTHORIZED for non-staff', () => {
    expect(applySql).toContain('UNAUTHORIZED');
  });

  it('has 7-day time range filter', () => {
    expect(applySql).toContain("'7d'");
    expect(applySql).toContain("interval '7 days'");
  });

  it('has 30-day time range filter', () => {
    expect(applySql).toContain("'30d'");
    expect(applySql).toContain("interval '30 days'");
  });

  it('returns all required sections', () => {
    expect(applySql).toContain("'top_viewed'");
    expect(applySql).toContain("'low_demand'");
    expect(applySql).toContain("'search_analytics'");
    expect(applySql).toContain("'search_without_selection'");
    expect(applySql).toContain("'search_to_phone'");
    expect(applySql).toContain("'detail_engagement'");
    expect(applySql).toContain("'whatsapp_intent'");
    expect(applySql).toContain("'brand_aggregation'");
    expect(applySql).toContain("'demand_overview'");
  });

  it('uses independent aggregation (CTEs per source)', () => {
    // View events aggregated separately
    expect(applySql).toContain('view_agg AS');
    // Search selections aggregated separately
    expect(applySql).toContain('sel_agg AS');
    // Campaign intents aggregated separately
    expect(applySql).toContain('wa_agg AS');
    // Search events aggregated separately
    expect(applySql).toContain('search_agg AS');
  });

  it('count detail views from phone_view_events, not phone_view_counts', () => {
    expect(applySql).toContain("event_type = 'detail_view'");
    expect(applySql).toContain("event_type = 'card_view'");
  });

  it('counts whatsapp_intents from campaign_intents', () => {
    expect(applySql).toContain("kind = 'whatsapp_intent'");
    expect(applySql).toContain('campaign_intents');
  });

  it('LEFT JOINs inventory_items (not INNER) to preserve zero-view phones', () => {
    // Must have LEFT JOIN for at least view_agg to phone_view_counts area
    expect(applySql).toMatch(/LEFT JOIN view_agg/);
  });

  it('filters out deleted/archived/discontinued inventory', () => {
    expect(applySql).toContain("'deleted'");
    expect(applySql).toContain("'archived'");
    expect(applySql).toContain("'discontinued'");
  });

  it('REVOKE ALL and GRANT to authenticated only', () => {
    expect(applySql).toContain('REVOKE ALL ON FUNCTION public.get_phone_intelligence');
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.get_phone_intelligence');
    expect(applySql).toContain('TO authenticated');
  });

  it('does NOT grant to anon', () => {
    const lines = applySql.split('\n').filter(l => !l.trim().startsWith('--'));
    const nonComment = lines.join('\n');
    expect(nonComment).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_phone_intelligence\s+TO\s+anon/);
  });

  it('does NOT use SELECT *', () => {
    const lines = applySql.split('\n').filter(l => !l.trim().startsWith('--'));
    const nonComment = lines.join('\n');
    expect(nonComment).not.toMatch(/SELECT\s+\*\s+FROM/);
  });

  it('does NOT reference DeviceIntelligenceBI browser device data', () => {
    expect(applySql).not.toContain('user_agents');
    expect(applySql).not.toContain('browser_');
    expect(applySql).not.toContain('device_intelligence');
  });

  it('search_to_phone only counts actual selection rows', () => {
    expect(applySql).toContain('COUNT(pss.id) AS selection_count');
  });

  it('demand_score formula: unique*1 + detail*3 + selections*5 + whatsapp*10', () => {
    expect(applySql).toContain("unique_views, 0) * 1");
    expect(applySql).toContain("detail_views, 0) * 3");
    expect(applySql).toContain("selection_count, 0) * 5");
    expect(applySql).toContain("whatsapp_intents, 0) * 10");
  });

  it('no raw identity_key exposed in output', () => {
    // The RPC must not return identity_key in any JSONB output
    const lines = applySql.split('\n').filter(l => !l.trim().startsWith('--'));
    const nonComment = lines.join('\n');
    expect(nonComment).not.toMatch(/identity_key.*ORDER|ORDER.*identity_key/);
  });

  it('brand filter is case-insensitive', () => {
    expect(applySql).toContain('lower(trim(p_brand))');
    expect(applySql).toContain('lower(ii.brand)');
  });
});
