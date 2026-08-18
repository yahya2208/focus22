import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { variantCompactLabel } from './catalog-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VariantRow {
  id: string;
  canonical_variant_id: string;
  model_id: string;
  ram_mb: number;
  storage_gb: number;
  region: string | null;
  status: string;
  source_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function VariantStatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useThemeColors> }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  };

  if (status === 'known') {
    return <span style={{ ...style, background: colors.successBg, color: colors.successText }}>{status}</span>;
  }
  if (status === 'verified') {
    return <span style={{ ...style, background: `${colors.accent}22`, color: colors.accent }}>{status}</span>;
  }
  if (status === 'archived') {
    return <span style={{ ...style, background: colors.bgInput, color: colors.textMuted }}>{status}</span>;
  }
  return <span style={{ ...style, background: colors.warningBg, color: colors.warningText }}>{status}</span>;
}

// ─── Variant Panel ───────────────────────────────────────────────────────────

export function CatalogVariantPanel({ modelId, modelName, modelCanonicalId, supabase, onEditVariant, onAddVariant }: {
  modelId: string;
  modelName: string;
  modelCanonicalId: string;
  supabase: ReturnType<typeof import('../../core/supabase/client').getSupabaseClient>;
  onEditVariant: (v: VariantRow) => void;
  onAddVariant: (modelCanonicalId: string) => void;
}) {
  const colors = useThemeColors();
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('catalog_admin_list_variants', {
        p_model_id: modelId,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setVariants(data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase, modelId]);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  const handleVerify = useCallback(async (v: VariantRow) => {
    setActingOn(v.id);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('catalog_verify_variant', {
        p_canonical_variant_id: v.canonical_variant_id,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      await loadVariants();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadVariants]);

  const handleArchive = useCallback(async (v: VariantRow) => {
    setActingOn(v.id);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('catalog_archive_variant', {
        p_canonical_variant_id: v.canonical_variant_id,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      await loadVariants();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingOn(null);
    }
  }, [supabase, loadVariants]);

  if (loading) {
    return (
      <div role="status" aria-live="polite" style={{ textAlign: 'center', color: colors.textMuted, padding: '1rem', fontSize: '0.8rem' }}>
        Loading variants...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: colors.dangerBg, color: colors.dangerText, fontSize: '0.8rem' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <button
        onClick={() => onAddVariant(modelCanonicalId)}
        disabled={actingOn !== null}
        style={{
          padding: '0.4rem 0.75rem',
          borderRadius: '6px',
          border: `1px dashed ${colors.info}`,
          background: 'transparent',
          color: colors.infoText,
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 600,
          fontFamily: 'inherit',
          alignSelf: 'flex-start',
        }}
      >
        + Add Variant
      </button>

      {variants.length === 0 && (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '1rem', fontSize: '0.8rem' }}>
          No variants defined for {modelName}.
        </div>
      )}

      {variants.map((v) => {
        const isActing = actingOn === v.id;
        return (
          <div
            key={v.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              background: colors.bg,
              border: `1px solid ${colors.borderLight}`,
              gap: '0.5rem',
              fontSize: '0.8rem',
              opacity: isActing ? 0.6 : 1,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: colors.text }}>
                {variantCompactLabel(v.ram_mb, v.storage_gb)}
              </div>
              <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>
                {v.region ?? 'Global'}
                {v.source_type !== 'unknown' && ` \u00b7 ${v.source_type}`}
                {v.updated_at && ` \u00b7 updated ${formatTimestamp(v.updated_at)}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0, alignItems: 'center' }}>
              <VariantStatusBadge status={v.status} colors={colors} />
              {v.status !== 'archived' && (
                <button
                  onClick={() => onEditVariant(v)}
                  disabled={isActing}
                  aria-label={`Edit variant ${variantCompactLabel(v.ram_mb, v.storage_gb)}`}
                  style={{
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    border: `1px solid ${colors.accent}`,
                    background: `${colors.accent}15`,
                    color: colors.accent,
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
              )}
              {v.status !== 'archived' && v.status !== 'verified' && (
                <button
                  onClick={() => handleVerify(v)}
                  disabled={isActing}
                  aria-label={`Verify variant ${variantCompactLabel(v.ram_mb, v.storage_gb)}`}
                  style={{
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    border: `1px solid ${colors.success}`,
                    background: colors.successBg,
                    color: colors.successText,
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                >
                  Verify
                </button>
              )}
              {v.status !== 'archived' && (
                <button
                  onClick={() => handleArchive(v)}
                  disabled={isActing}
                  aria-label={`Archive variant ${variantCompactLabel(v.ram_mb, v.storage_gb)}`}
                  style={{
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    border: `1px solid ${colors.danger}`,
                    background: colors.dangerBg,
                    color: colors.dangerText,
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}
