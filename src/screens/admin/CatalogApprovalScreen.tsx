import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppDispatch } from '../../store/navigation';
import { getSupabaseClient } from '../../core/supabase/client';
import { CatalogSearchBar, EMPTY_FILTERS, PAGE_SIZE, type CatalogFilters } from './CatalogSearchBar';
import { CatalogModelCard, type CatalogModelRow } from './CatalogModelCard';
import { CatalogModelForm } from './CatalogModelForm';
import { CatalogVariantForm } from './CatalogVariantForm';
import type { VariantRow } from './CatalogVariantPanel';

export type { CatalogModelRow };

// ─── Main Component ──────────────────────────────────────────────────────────

export function CatalogApprovalScreen() {
  const colors = useThemeColors();
  const navDispatch = useAppDispatch();
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
    setFilters((prev) => {
      const next = { ...prev, ...partial };
      if (
        next.search === prev.search &&
        next.brand === prev.brand &&
        next.approval === prev.approval &&
        next.has_variants === prev.has_variants &&
        next.page === prev.page
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // ─── Model Actions ───────────────────────────────────────────────────────

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

  // ─── Form State ──────────────────────────────────────────────────────────

  const [modelForm, setModelForm] = useState<{
    mode: 'create' | 'edit';
    initial?: CatalogModelRow;
  } | null>(null);

  const [variantForm, setVariantForm] = useState<{
    mode: 'create' | 'edit';
    modelCanonicalId: string;
    modelId: string;
    initial?: VariantRow;
  } | null>(null);

  const handleCreateModel = useCallback(() => {
    setModelForm({ mode: 'create' });
  }, []);

  const handleEditModel = useCallback((model: CatalogModelRow) => {
    setModelForm({ mode: 'edit', initial: model });
  }, []);

  const handleAddVariant = useCallback((model: CatalogModelRow) => {
    setVariantForm({
      mode: 'create',
      modelCanonicalId: model.canonical_id,
      modelId: model.id,
    });
  }, []);

  const handleEditVariant = useCallback((model: CatalogModelRow, variant: VariantRow) => {
    setVariantForm({
      mode: 'edit',
      modelCanonicalId: model.canonical_id,
      modelId: model.id,
      initial: variant,
    });
  }, []);

  const handleModelFormSuccess = useCallback(async () => {
    setModelForm(null);
    setSuccess(modelForm?.mode === 'create' ? 'Model created.' : 'Model updated.');
    await loadModels(filters);
  }, [modelForm, loadModels, filters]);

  const handleVariantFormSuccess = useCallback(async () => {
    setVariantForm(null);
    setSuccess(variantForm?.mode === 'create' ? 'Variant added.' : 'Variant updated.');
    await loadModels(filters);
  }, [variantForm, loadModels, filters]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'settings' })}
            aria-label="Back to Settings"
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              background: colors.bgCard,
              color: colors.textSecondary,
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontFamily: 'inherit',
            }}
          >
            {'\u2190'} Back
          </button>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, margin: 0 }}>
            Catalog Approval
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={handleCreateModel}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              border: `1px solid ${colors.accent}`,
              background: `${colors.accent}22`,
              color: colors.accent,
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            + Create Model
          </button>
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
              onEditModel={handleEditModel}
              onAddVariant={handleAddVariant}
              onEditVariant={handleEditVariant}
            />
          ))}
        </div>
      )}

      {/* Footer info */}
      <div style={{ fontSize: '0.7rem', color: colors.textFaint, textAlign: 'center', paddingTop: '0.5rem' }}>
        Only draft models can be approved. Rejected models must be reopened to draft first.
      </div>

      {/* Model Form Modal */}
      {modelForm && (
        <CatalogModelForm
          mode={modelForm.mode}
          initial={modelForm.mode === 'edit' ? modelForm.initial : undefined}
          onSuccess={handleModelFormSuccess}
          onClose={() => setModelForm(null)}
        />
      )}

      {/* Variant Form Modal */}
      {variantForm && (
        <CatalogVariantForm
          mode={variantForm.mode}
          modelCanonicalId={variantForm.modelCanonicalId}
          modelId={variantForm.modelId}
          initial={variantForm.mode === 'edit' ? variantForm.initial : undefined}
          onSuccess={handleVariantFormSuccess}
          onClose={() => setVariantForm(null)}
        />
      )}
    </nav>
  );
}
