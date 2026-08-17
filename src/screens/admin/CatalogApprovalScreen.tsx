import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';
import { CatalogSearchBar, EMPTY_FILTERS, PAGE_SIZE, type CatalogFilters } from './CatalogSearchBar';
import { CatalogModelCard, type CatalogModelRow } from './CatalogModelCard';

export type { CatalogModelRow };

// ─── Main Component ──────────────────────────────────────────────────────────

export function CatalogApprovalScreen() {
  const colors = useThemeColors();
  const [models, setModels] = useState<CatalogModelRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);

  const supabase = getSupabaseClient();

  const loadModels = useCallback(async (f: CatalogFilters) => {
    setLoading(true);
    setError(null);
    try {
      const offset = (f.page - 1) * PAGE_SIZE;
      const { data, error: rpcErr, count } = await supabase.rpc('catalog_admin_list_models', {
        p_search: f.search || null,
        p_brand: f.brand || null,
        p_approval: f.approval || null,
        p_has_variants: f.has_variants,
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_order_by: 'brand_id',
        p_order_asc: true,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setModels(data ?? []);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadModels(filters);
  }, [filters, loadModels]);

  const handleFilterChange = useCallback((partial: Partial<CatalogFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleApprove = useCallback(async (model: CatalogModelRow) => {
    setActingOn(model.id);
    setError(null);
    setSuccess(null);
    try {
      const { error: rpcErr } = await supabase.rpc('catalog_admin_approve_model', {
        p_canonical_id: model.canonical_id,
        p_approve: true,
        p_expected_updated_at: model.updated_at,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setSuccess(`Approved: ${model.name}`);
      await loadModels(filters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadModels, filters]);

  const handleReject = useCallback(async (model: CatalogModelRow) => {
    setActingOn(model.id);
    setError(null);
    setSuccess(null);
    try {
      const { error: rpcErr } = await supabase.rpc('catalog_admin_approve_model', {
        p_canonical_id: model.canonical_id,
        p_approve: false,
        p_expected_updated_at: model.updated_at,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setSuccess(`Rejected: ${model.name}`);
      await loadModels(filters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadModels, filters]);

  const handleReopen = useCallback(async (model: CatalogModelRow) => {
    setActingOn(model.id);
    setError(null);
    setSuccess(null);
    try {
      const { error: rpcErr } = await supabase.rpc('catalog_admin_reopen_model', {
        p_canonical_id: model.canonical_id,
        p_expected_updated_at: model.updated_at,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setSuccess(`Reopened: ${model.name}`);
      await loadModels(filters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadModels, filters]);

  return (
    <nav
      aria-label="Catalog Approval"
      style={{
        padding: '1.5rem 1.25rem',
        maxWidth: '800px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, margin: 0 }}>
          Catalog Approval
        </h1>
        <button
          onClick={() => loadModels(filters)}
          disabled={loading}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            background: colors.bgCard,
            color: colors.textSecondary,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '0.8rem',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Search + Filters + Pagination */}
      <CatalogSearchBar
        filters={filters}
        total={totalCount}
        loading={loading}
        onChange={handleFilterChange}
      />

      {/* Messages */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px',
          background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
          color: colors.dangerText, fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px',
          background: colors.successBg, border: `1px solid ${colors.success}33`,
          color: colors.successText, fontSize: '0.85rem',
        }}>
          {success}
        </div>
      )}

      {/* Model Cards */}
      {loading && models.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2rem' }}>
          Loading catalog models...
        </div>
      ) : models.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2rem' }}>
          No models match the current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {models.map(model => (
            <CatalogModelCard
              key={model.id}
              model={model}
              actingOn={actingOn}
              onApprove={handleApprove}
              onReject={handleReject}
              onReopen={handleReopen}
            />
          ))}
        </div>
      )}

      {/* Footer info */}
      <div style={{ fontSize: '0.7rem', color: colors.textFaint, textAlign: 'center', paddingTop: '0.5rem' }}>
        Only draft models can be approved. Rejected models must be reopened to draft first.
      </div>
    </nav>
  );
}
