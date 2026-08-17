import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VariantRow {
  id: string;
  model_id: string;
  name: string;
  status: string;
  storage: string | null;
  ram: string | null;
  region: string | null;
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
    return <span style={{ ...style, background: colors.bgInput, color: colors.textFaint }}>{status}</span>;
  }
  return <span style={{ ...style, background: colors.warningBg, color: colors.warningText }}>{status}</span>;
}

// ─── Variant Panel ───────────────────────────────────────────────────────────

export function CatalogVariantPanel({ modelId, modelName, supabase }: {
  modelId: string;
  modelName: string;
  supabase: ReturnType<typeof import('../../core/supabase/client').getSupabaseClient>;
}) {
  const colors = useThemeColors();
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('catalog_admin_list_variants', {
        p_model_id: modelId,
        p_limit: 100,
        p_offset: 0,
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', color: colors.textMuted, padding: '1rem', fontSize: '0.8rem' }}>
        Loading variants...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: colors.dangerBg, color: colors.dangerText, fontSize: '0.8rem' }}>
        {error}
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: colors.textMuted, padding: '1rem', fontSize: '0.8rem' }}>
        No variants defined for {modelName}.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {variants.map((v) => (
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
          }}
        >
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: colors.text }}>{v.name}</span>
            <span style={{ color: colors.textMuted, marginLeft: '0.5rem' }}>
              {v.storage && `${v.storage}`}
              {v.storage && v.ram && ' / '}
              {v.ram && `${v.ram} RAM`}
              {v.region && ` \u00b7 ${v.region}`}
            </span>
          </div>
          <VariantStatusBadge status={v.status} colors={colors} />
        </div>
      ))}
    </div>
  );
}
