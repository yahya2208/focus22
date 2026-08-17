import { useState, useEffect, useMemo, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';

// ─── DB Row Type ─────────────────────────────────────────────────────────────

interface CatalogModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  status: string;
  approval_status: string;
  updated_at: string;
}

// ─── Approval Status Badge ───────────────────────────────────────────────────

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useThemeColors> }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '6px',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  };

  if (status === 'draft') {
    return <span style={{ ...style, background: colors.warningBg, color: colors.warningText }}>{status}</span>;
  }
  if (status === 'approved') {
    return <span style={{ ...style, background: colors.successBg, color: colors.successText }}>{status}</span>;
  }
  if (status === 'rejected') {
    return <span style={{ ...style, background: colors.dangerBg, color: colors.dangerText }}>{status}</span>;
  }
  return <span style={{ ...style, background: colors.bgInput, color: colors.textMuted }}>{status}</span>;
}

// ─── Filter Button ───────────────────────────────────────────────────────────

function FilterButton({ label, active, count, colors, onClick }: {
  label: string;
  active: boolean;
  count: number;
  colors: ReturnType<typeof useThemeColors>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.4rem 0.75rem',
        borderRadius: '8px',
        border: `1px solid ${active ? colors.accent : colors.border}`,
        background: active ? `${colors.accent}22` : 'transparent',
        color: active ? colors.accent : colors.textMuted,
        cursor: 'pointer',
        fontWeight: active ? 700 : 500,
        fontSize: '0.8rem',
        fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}
    >
      {label} ({count})
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CatalogApprovalScreen() {
  const colors = useThemeColors();
  const [models, setModels] = useState<CatalogModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved' | 'rejected'>('draft');
  const [actingOn, setActingOn] = useState<string | null>(null);

  const supabase = useMemo(() => getSupabaseClient(), []);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const PAGE_SIZE = 1000;
      let allModels: CatalogModelRow[] = [];
      let from = 0;
      for (;;) {
        const { data, error: fetchErr } = await supabase
          .from('catalog_models')
          .select('id, canonical_id, brand_id, name, status, approval_status, updated_at')
          .order('brand_id', { ascending: true })
          .order('name', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (fetchErr) throw new Error(fetchErr.message);
        allModels = allModels.concat(data ?? []);
        if ((data ?? []).length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setModels(allModels);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

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
      await loadModels();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadModels]);

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
      await loadModels();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadModels]);

  const filtered = useMemo(
    () => filter === 'all' ? models : models.filter(m => m.approval_status === filter),
    [models, filter],
  );

  const stats = useMemo(() => ({
    total: models.length,
    draft: models.filter(m => m.approval_status === 'draft').length,
    approved: models.filter(m => m.approval_status === 'approved').length,
    rejected: models.filter(m => m.approval_status === 'rejected').length,
  }), [models]);

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
          onClick={loadModels}
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

      {/* Stats */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '8px',
          background: colors.bgCard, border: `1px solid ${colors.borderLight}`,
          fontSize: '0.8rem', color: colors.textSecondary,
        }}>
          Total: <strong style={{ color: colors.text }}>{stats.total}</strong>
        </div>
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '8px',
          background: colors.warningBg, border: `1px solid ${colors.warning}33`,
          fontSize: '0.8rem', color: colors.warningText,
        }}>
          Draft: <strong>{stats.draft}</strong>
        </div>
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '8px',
          background: colors.successBg, border: `1px solid ${colors.success}33`,
          fontSize: '0.8rem', color: colors.successText,
        }}>
          Approved: <strong>{stats.approved}</strong>
        </div>
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '8px',
          background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
          fontSize: '0.8rem', color: colors.dangerText,
        }}>
          Rejected: <strong>{stats.rejected}</strong>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <FilterButton label="All" active={filter === 'all'} count={stats.total} colors={colors} onClick={() => setFilter('all')} />
        <FilterButton label="Draft" active={filter === 'draft'} count={stats.draft} colors={colors} onClick={() => setFilter('draft')} />
        <FilterButton label="Approved" active={filter === 'approved'} count={stats.approved} colors={colors} onClick={() => setFilter('approved')} />
        <FilterButton label="Rejected" active={filter === 'rejected'} count={stats.rejected} colors={colors} onClick={() => setFilter('rejected')} />
      </div>

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

      {/* Table */}
      {loading && models.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2rem' }}>
          Loading catalog models...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2rem' }}>
          No models match the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(model => (
            <div
              key={model.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                background: colors.bgCard,
                border: `1px solid ${colors.borderLight}`,
                gap: '0.75rem',
                flexWrap: 'wrap',
                opacity: actingOn === model.id ? 0.6 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: 700, color: colors.text, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                  {model.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                  {model.brand_id} &middot; {model.status}
                </div>
              </div>

              <StatusBadge status={model.approval_status} colors={colors} />

              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                {model.approval_status === 'draft' && (
                  <button
                    onClick={() => handleApprove(model)}
                    disabled={actingOn !== null}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      border: `1px solid ${colors.success}`,
                      background: colors.successBg,
                      color: colors.successText,
                      cursor: actingOn ? 'wait' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                    }}
                  >
                    Approve
                  </button>
                )}
                {model.approval_status !== 'rejected' && (
                  <button
                    onClick={() => handleReject(model)}
                    disabled={actingOn !== null}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      border: `1px solid ${colors.danger}`,
                      background: colors.dangerBg,
                      color: colors.dangerText,
                      cursor: actingOn ? 'wait' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                    }}
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      <div style={{ fontSize: '0.7rem', color: colors.textFaint, textAlign: 'center', paddingTop: '0.5rem' }}>
        Only draft models can be approved. Rejected models must be reopened to draft first (edit name).
      </div>
    </nav>
  );
}
