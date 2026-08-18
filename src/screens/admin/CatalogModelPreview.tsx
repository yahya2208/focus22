import { useState, useEffect } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { variantCompactLabel, variantDetailedLabel } from './catalog-utils';
import type { getSupabaseClient } from '../../core/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VariantInfo {
  ram_mb: number;
  storage_gb: number;
  region: string | null;
  status: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CatalogModelPreview({ modelId, brandId, modelName, series, supabase }: {
  modelId: string;
  brandId: string;
  modelName: string;
  series: string | null;
  supabase: ReturnType<typeof getSupabaseClient>;
}) {
  const colors = useThemeColors();
  const [variants, setVariants] = useState<VariantInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('catalog_admin_list_variants', { p_model_id: modelId });
      if (!cancelled && data) {
        setVariants(data.map((v: Record<string, unknown>) => ({
          ram_mb: v.ram_mb as number,
          storage_gb: v.storage_gb as number,
          region: v.region as string | null,
          status: v.status as string,
        })));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [modelId, supabase]);

  const brandDisplay = brandId.charAt(0).toUpperCase() + brandId.slice(1);

  return (
    <div style={{
      padding: '1rem',
      borderRadius: '8px',
      border: `1px solid ${colors.borderLight}`,
      background: colors.bgCard,
      fontSize: '0.85rem',
    }}>
      {/* Brand */}
      <div style={{ color: colors.accent, fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem' }}>
        {brandDisplay}
      </div>

      {/* Model */}
      <div style={{ color: colors.text, fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.15rem' }}>
        {modelName}
      </div>

      {/* Series */}
      {series && (
        <div style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Series: {series}
        </div>
      )}
      {!series && <div style={{ marginBottom: '0.75rem' }} />}

      {/* Variants */}
      <h4 style={{
        fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary,
        marginBottom: '0.4rem', marginTop: 0,
        borderTop: `1px solid ${colors.border}`,
        paddingTop: '0.5rem',
      }}>
        Versions
      </h4>

      {loading && (
        <div role="status" aria-live="polite" style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Loading variants...</div>
      )}

      {!loading && variants.length === 0 && (
        <div role="status" style={{ color: colors.textMuted, fontSize: '0.8rem', fontStyle: 'italic' }}>
          No variants defined
        </div>
      )}

      {!loading && variants.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {variants.map((v, i) => (
            <li key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.4rem 0.6rem', borderRadius: '6px',
              background: colors.bgInput,
            }}>
              <div>
                <span style={{ fontWeight: 600, color: colors.text }}>
                  {variantCompactLabel(v.ram_mb, v.storage_gb)}
                </span>
                <span style={{ color: colors.textSecondary, marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                  {variantDetailedLabel(v.ram_mb, v.storage_gb)}
                </span>
              </div>
              {v.region && (
                <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>{v.region}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
