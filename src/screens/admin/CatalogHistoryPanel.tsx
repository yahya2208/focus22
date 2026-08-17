import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_email: string | null;
  created_at: string;
}

// ─── Action Badge ────────────────────────────────────────────────────────────

function ActionBadge({ action, colors }: { action: string; colors: ReturnType<typeof useThemeColors> }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  };

  if (action === 'APPROVE') {
    return <span style={{ ...style, background: colors.successBg, color: colors.successText }}>{action}</span>;
  }
  if (action === 'REJECT') {
    return <span style={{ ...style, background: colors.dangerBg, color: colors.dangerText }}>{action}</span>;
  }
  if (action === 'REOPEN') {
    return <span style={{ ...style, background: colors.warningBg, color: colors.warningText }}>{action}</span>;
  }
  if (action === 'CREATE') {
    return <span style={{ ...style, background: `${colors.accent}22`, color: colors.accent }}>{action}</span>;
  }
  if (action === 'UPDATE') {
    return <span style={{ ...style, background: colors.infoBg, color: colors.infoText }}>{action}</span>;
  }
  return <span style={{ ...style, background: colors.bgInput, color: colors.textMuted }}>{action}</span>;
}

// ─── History Panel ───────────────────────────────────────────────────────────

export function CatalogHistoryPanel({ canonicalId, modelName, supabase }: {
  canonicalId: string;
  modelName: string;
  supabase: ReturnType<typeof import('../../core/supabase/client').getSupabaseClient>;
}) {
  const colors = useThemeColors();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const loadHistory = useCallback(async (off: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('catalog_admin_get_model_history', {
        p_canonical_id: canonicalId,
        p_limit: LIMIT,
        p_offset: off,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setEntries(data ?? []);
      setOffset(off);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase, canonicalId]);

  useEffect(() => {
    loadHistory(0);
  }, [loadHistory]);

  const handleLoadMore = useCallback(() => {
    loadHistory(offset + LIMIT);
  }, [loadHistory, offset]);

  const handleLoadPrev = useCallback(() => {
    loadHistory(Math.max(0, offset - LIMIT));
  }, [loadHistory, offset]);

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  if (loading && entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: colors.textMuted, padding: '1rem', fontSize: '0.8rem' }}>
        Loading history...
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

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: colors.textMuted, padding: '1rem', fontSize: '0.8rem' }}>
        No history entries for {modelName}.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.6rem',
            borderRadius: '4px',
            background: colors.bg,
            fontSize: '0.8rem',
          }}
        >
          <ActionBadge action={entry.action} colors={colors} />
          <span style={{ flex: 1, color: colors.textMuted, fontSize: '0.75rem' }}>
            {entry.actor_email ?? entry.actor_user_id ?? 'Unknown'}
          </span>
          <span style={{ color: colors.textFaint, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
            {formatTimestamp(entry.created_at)}
          </span>
        </div>
      ))}

      {/* Load More / Prev */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', paddingTop: '0.25rem' }}>
        {offset > 0 && (
          <button
            onClick={handleLoadPrev}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              border: `1px solid ${colors.border}`,
              background: colors.bgCard,
              color: colors.textMuted,
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontFamily: 'inherit',
            }}
          >
            Prev
          </button>
        )}
        {entries.length === LIMIT && (
          <button
            onClick={handleLoadMore}
            disabled={loading}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              border: `1px solid ${colors.border}`,
              background: colors.bgCard,
              color: colors.textMuted,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '0.7rem',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Loading...' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}
