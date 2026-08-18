import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';
import { CatalogVariantPanel, type VariantRow } from './CatalogVariantPanel';
import { CatalogHistoryPanel } from './CatalogHistoryPanel';
import { CatalogModelPreview } from './CatalogModelPreview';

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

export function CatalogModelCard({ model, actingOn, onApprove, onReject, onReopen, onEditModel, onAddVariant, onEditVariant }: {
  model: CatalogModelRow;
  actingOn: string | null;
  onApprove: (m: CatalogModelRow) => void;
  onReject: (m: CatalogModelRow) => void;
  onReopen: (m: CatalogModelRow) => void;
  onEditModel: (m: CatalogModelRow) => void;
  onAddVariant: (m: CatalogModelRow) => void;
  onEditVariant: (m: CatalogModelRow, v: VariantRow) => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'variants' | 'history' | 'preview'>('variants');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const supabase = getSupabaseClient();
  const isActing = actingOn === model.id;

  const toggleExpand = useCallback(() => setExpanded((prev) => !prev), []);
  const canApprove = model.approval_status === 'draft' && model.variant_count > 0;
  const tabListRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const confirmDescId = `confirm-desc-${model.id}`;
  const panelId = `model-panel-${model.id}`;

  const handleTabKeyDown = useCallback((e: KeyboardEvent) => {
    const tabs: Array<'variants' | 'history' | 'preview'> = ['variants', 'history', 'preview'];
    const idx = tabs.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab(tabs[((idx % tabs.length) + 1) % tabs.length]!);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveTab(tabs[((idx % tabs.length) - 1 + tabs.length) % tabs.length]!);
    }
  }, [activeTab]);

  useEffect(() => {
    if (confirmAction && confirmRef.current) {
      confirmRef.current.focus();
    }
  }, [confirmAction]);

  return (
    <div
      aria-busy={isActing || undefined}
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
            <span aria-hidden="true">{expanded ? '\u25BC' : '\u25B6'}</span> {model.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
            {model.brand_id} &middot; {model.status}
            {model.variant_count > 0 && ` \u00b7 ${model.variant_count} variants`}
          </div>
        </div>

        <StatusBadge status={model.approval_status} colors={colors} />

        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEditModel(model); }}
            disabled={actingOn !== null}
            aria-label={`Edit ${model.name}`}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              border: `1px solid ${colors.accent}`,
              background: `${colors.accent}22`,
              color: colors.accent,
              cursor: actingOn ? 'wait' : 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              fontFamily: 'inherit',
            }}
          >
            Edit Model
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAddVariant(model); }}
            disabled={actingOn !== null}
            aria-label={`Add Variant to ${model.name}`}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              border: `1px solid ${colors.info}`,
              background: colors.infoBg,
              color: colors.infoText,
              cursor: actingOn ? 'wait' : 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              fontFamily: 'inherit',
            }}
          >
            Add Variant
          </button>
          {canApprove && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmAction('approve'); }}
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
          {model.approval_status === 'draft' && model.variant_count === 0 && (
            <button
              disabled
              title="Add at least 1 variant before approving"
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                background: colors.bgInput,
                color: colors.textMuted,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'not-allowed',
                opacity: 0.6,
                fontFamily: 'inherit',
              }}
            >
              Approve
            </button>
          )}
          {model.approval_status !== 'rejected' && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmAction('reject'); }}
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
        <div id={panelId} role="tabpanel" style={{ borderTop: `1px solid ${colors.borderLight}`, padding: '0.75rem 1rem' }}>
          {/* Tab Bar */}
          <div ref={tabListRef} role="tablist" aria-label="Model details" onKeyDown={handleTabKeyDown} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              role="tab"
              aria-selected={activeTab === 'variants'}
              aria-controls={panelId}
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
              role="tab"
              aria-selected={activeTab === 'history'}
              aria-controls={panelId}
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
            <button
              role="tab"
              aria-selected={activeTab === 'preview'}
              aria-controls={panelId}
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: `1px solid ${activeTab === 'preview' ? colors.accent : colors.border}`,
                background: activeTab === 'preview' ? `${colors.accent}22` : 'transparent',
                color: activeTab === 'preview' ? colors.accent : colors.textMuted,
                cursor: 'pointer',
                fontWeight: activeTab === 'preview' ? 700 : 500,
                fontSize: '0.75rem',
                fontFamily: 'inherit',
              }}
            >
              Preview
            </button>
          </div>

          {/* Panel Content */}
          {activeTab === 'variants' ? (
            <CatalogVariantPanel
              modelId={model.id}
              modelName={model.name}
              modelCanonicalId={model.canonical_id}
              supabase={supabase}
              onEditVariant={(v) => onEditVariant(model, v)}
              onAddVariant={() => onAddVariant(model)}
            />
          ) : activeTab === 'history' ? (
            <CatalogHistoryPanel
              canonicalId={model.canonical_id}
              modelName={model.name}
              supabase={supabase}
            />
          ) : (
            <CatalogModelPreview
              modelId={model.id}
              brandId={model.brand_id}
              modelName={model.name}
              series={model.series}
              supabase={supabase}
            />
          )}
        </div>
      )}
      {/* Confirmation Dialog */}
      {confirmAction && (
        <div
          ref={confirmRef}
          role="alertdialog"
          aria-label={confirmAction === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
          aria-describedby={confirmDescId}
          tabIndex={-1}
          style={{
            borderTop: `1px solid ${colors.borderLight}`,
            padding: '0.75rem 1rem',
            background: confirmAction === 'approve' ? colors.successBg : colors.dangerBg,
            outline: 'none',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text, marginBottom: '0.5rem' }}>
            {confirmAction === 'approve' ? 'Approve' : 'Reject'} &ldquo;{model.name}&rdquo;?
          </div>
          <div id={confirmDescId} style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.75rem' }}>
            {confirmAction === 'approve'
              ? `This will publish the model and its ${model.variant_count} variant(s) to the public catalog.`
              : 'This will reject the model and hide it from the public catalog.'}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirmAction === 'approve') onApprove(model);
                else onReject(model);
                setConfirmAction(null);
              }}
              disabled={actingOn !== null}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${confirmAction === 'approve' ? colors.success : colors.danger}`,
                background: confirmAction === 'approve' ? colors.success : colors.danger,
                color: '#fff',
                cursor: actingOn ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                fontFamily: 'inherit',
              }}
            >
              {actingOn ? 'Working...' : confirmAction === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmAction(null); }}
              disabled={actingOn !== null}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                background: colors.bgCard,
                color: colors.textSecondary,
                cursor: actingOn ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
