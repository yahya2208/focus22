import { useState, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';
import { CatalogVariantPanel } from './CatalogVariantPanel';
import { CatalogHistoryPanel } from './CatalogHistoryPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CatalogModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  series: string | null;
  release_year: number | null;
  status: string;
  approval_status: string;
  variant_count: number;
  updated_at: string;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

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

// ─── Model Card ──────────────────────────────────────────────────────────────

export function CatalogModelCard({ model, actingOn, onApprove, onReject, onReopen }: {
  model: CatalogModelRow;
  actingOn: string | null;
  onApprove: (m: CatalogModelRow) => void;
  onReject: (m: CatalogModelRow) => void;
  onReopen: (m: CatalogModelRow) => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'variants' | 'history'>('variants');
  const supabase = getSupabaseClient();
  const isActing = actingOn === model.id;

  const toggleExpand = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div
      style={{
        borderRadius: '10px',
        background: colors.bgCard,
        border: `1px solid ${expanded ? colors.accent : colors.borderLight}`,
        opacity: isActing ? 0.6 : 1,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Card Header */}
      <div
        onClick={toggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(); }}
        aria-label={`Expand ${model.name}`}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          cursor: 'pointer',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontWeight: 700, color: colors.text, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
            {expanded ? '\u25BC' : '\u25B6'} {model.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            {model.brand_id} &middot; {model.status}
            {model.variant_count > 0 && ` \u00b7 ${model.variant_count} variants`}
          </div>
        </div>

        <StatusBadge status={model.approval_status} colors={colors} />

        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          {model.approval_status === 'draft' && (
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(model); }}
              disabled={actingOn !== null}
              aria-label={`Approve ${model.name}`}
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
              onClick={(e) => { e.stopPropagation(); onReject(model); }}
              disabled={actingOn !== null}
              aria-label={`Reject ${model.name}`}
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
          {model.approval_status === 'rejected' && (
            <button
              onClick={(e) => { e.stopPropagation(); onReopen(model); }}
              disabled={actingOn !== null}
              aria-label={`Reopen ${model.name}`}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${colors.warning}`,
                background: colors.warningBg,
                color: colors.warningText,
                cursor: actingOn ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                fontFamily: 'inherit',
              }}
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Expanded Panel */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${colors.borderLight}`, padding: '0.75rem 1rem' }}>
          {/* Tab Bar */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setActiveTab('variants')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: `1px solid ${activeTab === 'variants' ? colors.accent : colors.border}`,
                background: activeTab === 'variants' ? `${colors.accent}22` : 'transparent',
                color: activeTab === 'variants' ? colors.accent : colors.textMuted,
                cursor: 'pointer',
                fontWeight: activeTab === 'variants' ? 700 : 500,
                fontSize: '0.75rem',
                fontFamily: 'inherit',
              }}
            >
              Variants ({model.variant_count})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: `1px solid ${activeTab === 'history' ? colors.accent : colors.border}`,
                background: activeTab === 'history' ? `${colors.accent}22` : 'transparent',
                color: activeTab === 'history' ? colors.accent : colors.textMuted,
                cursor: 'pointer',
                fontWeight: activeTab === 'history' ? 700 : 500,
                fontSize: '0.75rem',
                fontFamily: 'inherit',
              }}
            >
              History
            </button>
          </div>

          {/* Panel Content */}
          {activeTab === 'variants' ? (
            <CatalogVariantPanel
              modelId={model.id}
              modelName={model.name}
              supabase={supabase}
            />
          ) : (
            <CatalogHistoryPanel
              modelId={model.id}
              modelName={model.name}
              supabase={supabase}
            />
          )}
        </div>
      )}
    </div>
  );
}
