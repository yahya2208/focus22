import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  getSettings,
  setSetting,
  getSettingsAudit,
  isSettingsUnauthorized,
  isSensitiveSetting,
  isCustomizedSetting,
  resolveSetting,
  resolveSettingString,
  resolveSettingList,
  SETTING_REGISTRY,
  type SettingMeta,
  type SettingAuditEntry,
} from '../settings-api';
import { refreshRuntimeSettings } from '../../core/config/runtime-settings';

/**
 * Phase 7 (+ Admin Control Center Pass 1 + Pass 2) — Admin Control Center:
 * Settings page.
 *
 * Read-only-until-authorized: the server RPC is the security boundary (read:
 * any authenticated session; write: admin/super_admin). This UI renders the
 * CLOSED registered set only, grouped by domain, showing current + default +
 * type + bounds/a11y. Save enforces client-side validation for UX but the
 * server re-validates every value (incl. string/enum pattern + allow-list); a
 * reader who cannot write gets a read-only state with no save controls.
 *
 * Pass 2 additions:
 *   - Default/Customized badge per setting (normalized compare vs default).
 *   - "Reset to default" writes the registered default through set_setting
 *     (real DB write + refresh); the old draft-only Reset became "Discard"
 *     (reverts the input to the current DB value, no RPC).
 *   - Mutation of SENSITIVE keys is confirmed first (UX layer only).
 *   - "History" expands the append-only change history via get_settings_audit
 *     (admin/super_admin only; records are never editable from the client).
 *   - After a successful save/reset the runtime cache is refreshed so live
 *     consumers immediately read the new value.
 *
 * Value rendering by type:
 *   - integer/percent -> number spinner (min..max)
 *   - text            -> text input
 *   - enum            -> checkbox multi-select (closed allow-list)
 */

type SettingsMeta = SettingMeta;

type SettingsValue = number | string | string[];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'rpc-failure' }
  | { kind: 'unauthorized' }
  | { kind: 'readonly' }
  | { kind: 'ready'; current: Readonly<Record<string, SettingsValue>> };

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/** Domain display names (Pass-2 realignment; purely presentational metadata). */
const CATEGORY_ORDER: Record<SettingsMeta['category'], { title: string; color: string }> = {
  game: { title: 'Games', color: '#4cc4f0' },
  offers: { title: 'Offers & Promotions', color: '#f59e0b' },
  inventory: { title: 'Inventory', color: '#22c55e' },
  rules: { title: 'Business Rules', color: '#8b5cf6' },
  cache: { title: 'Performance', color: '#ff6b7a' },
  telemetry: { title: 'Telemetry & Analytics', color: '#38bdf8' },
  general: { title: 'General', color: '#94a3b8' },
  marketplace: { title: 'Marketplace', color: '#14b8a6' },
  ads: { title: 'Advertising', color: '#f97316' },
  experience: { title: 'Experience', color: '#ec4899' },
  catalog: { title: 'Catalog', color: '#06b6d4' },
  gamification: { title: 'Gamification', color: '#a855f7' },
};

const cardStyle = (colors: ReturnType<typeof useThemeColors>): React.CSSProperties => ({
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
  padding: '16px',
});

/** Resolve the DB value for a setting according to its declared type. */
function resolveCurrent(settings: Parameters<typeof resolveSetting>[0], meta: SettingsMeta): SettingsValue {
  if (meta.type === 'text') return resolveSettingString(settings, meta.key);
  if (meta.type === 'enum') return resolveSettingList(settings, meta.key);
  return resolveSetting(settings, meta.key);
}

function convertSaved(v: number | string | readonly string[], meta: SettingsMeta): SettingsValue {
  if (meta.type === 'integer' || meta.type === 'percent') return Number(v);
  return v as SettingsValue;
}

function CustomizationBadge({ customized }: { customized: boolean }) {
  const colors = useThemeColors();
  if (customized) {
    return <span style={{ color: colors.warning, fontSize: '0.6rem', border: `1px solid ${colors.warning}`, borderRadius: '10px', padding: '1px 6px', marginLeft: '6px' }}>Customized</span>;
  }
  return <span style={{ color: colors.textMuted, fontSize: '0.6rem', border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '1px 6px', marginLeft: '6px' }}>Default</span>;
}

function NumericRow({
  meta, current, saving, canWrite, customized, draft, onDraft, onSave, onResetDefault, onHistory, onResult,
}: {
  meta: SettingsMeta; current: number; saving: boolean; canWrite: boolean; customized: boolean;
  draft: string; onDraft: (v: string) => void; onSave: (m: SettingsMeta, v: number) => void;
  onResetDefault: (m: SettingsMeta) => void; onHistory: (m: SettingsMeta) => void; onResult: (r: SaveState) => void;
}) {
  const colors = useThemeColors();
  const isDirty = draft !== String(current);
  const isValid = draft.trim() !== '' && !Number.isNaN(Number(draft));
  const v = Number(draft);
  const inputValid = draft.trim() === '' || Number.isNaN(v) || (v >= (meta.min ?? 0) && v <= (meta.max ?? 0));
  const discard = () => { onDraft(String(current)); onResult({ kind: 'idle' }); };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: `1px solid ${colors.borderLight}`, padding: '10px 0' }}>
      <div>
        <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}<CustomizationBadge customized={customized} /></div>
        <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{meta.description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>default <strong style={{ color: colors.textSecondary }}>{meta.defaultValue}</strong></span>
        <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>type <strong style={{ color: colors.textSecondary }}>{meta.type}</strong></span>
        <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>bounds <strong style={{ color: colors.textSecondary }}>{meta.min}–{meta.max}</strong></span>
        {canWrite ? (
          <>
            <input type="number" data-testid={`setting-${meta.key}`} value={draft} disabled={saving}
              onChange={(e) => onDraft(e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${inputValid ? colors.border : colors.danger}`, borderRadius: '6px', padding: '6px 8px', width: '110px' }} />
            <button disabled={saving || !isValid || !isDirty || !inputValid}
              onClick={() => onSave(meta, v)}
              style={{ background: colors.accent, color: '#0a0a14', border: 'none', borderRadius: '6px', padding: '6px 14px', fontWeight: 600, opacity: (saving || !isValid || !isDirty || !inputValid) ? 0.5 : 1, cursor: (saving || !isValid || !isDirty || !inputValid) ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {isDirty && <button onClick={discard} disabled={saving} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Discard</button>}
            {customized && <button disabled={saving} onClick={() => onResetDefault(meta)} style={{ background: 'transparent', color: colors.warning, border: `1px solid ${colors.warning}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Reset to default</button>}
            <button data-testid={`history-${meta.key}`} disabled={saving} onClick={() => onHistory(meta)} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>History</button>
          </>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Current: <strong style={{ color: colors.text }}>{current}</strong> (read-only — admin/super_admin)</span>
        )}
      </div>
    </div>
  );
}

function TextRow({
  meta, current, saving, canWrite, customized, draft, onDraft, onSave, onResetDefault, onHistory, onResult,
}: {
  meta: SettingsMeta; current: string; saving: boolean; canWrite: boolean; customized: boolean;
  draft: string; onDraft: (v: string) => void; onSave: (m: SettingsMeta, v: string) => void;
  onResetDefault: (m: SettingsMeta) => void; onHistory: (m: SettingsMeta) => void; onResult: (r: SaveState) => void;
}) {
  const colors = useThemeColors();
  const isDirty = draft !== current;
  const inputValid = !meta.pattern || new RegExp(meta.pattern).test(draft.trim());
  const discard = () => { onDraft(current); onResult({ kind: 'idle' }); };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: `1px solid ${colors.borderLight}`, padding: '10px 0' }}>
      <div>
        <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}<CustomizationBadge customized={customized} /></div>
        <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{meta.description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>pattern <strong style={{ color: colors.textSecondary }}>{meta.pattern}</strong></span>
        {canWrite ? (
          <>
            <input type="text" data-testid={`setting-${meta.key}`} value={draft} disabled={saving}
              onChange={(e) => onDraft(e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${inputValid ? colors.border : colors.danger}`, borderRadius: '6px', padding: '6px 8px', width: '190px' }} />
            <button disabled={saving || !isDirty || !inputValid}
              onClick={() => onSave(meta, draft.trim())}
              style={{ background: colors.accent, color: '#0a0a14', border: 'none', borderRadius: '6px', padding: '6px 14px', fontWeight: 600, opacity: (saving || !isDirty || !inputValid) ? 0.5 : 1, cursor: (saving || !isDirty || !inputValid) ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {isDirty && <button onClick={discard} disabled={saving} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Discard</button>}
            {customized && <button disabled={saving} onClick={() => onResetDefault(meta)} style={{ background: 'transparent', color: colors.warning, border: `1px solid ${colors.warning}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Reset to default</button>}
            <button data-testid={`history-${meta.key}`} disabled={saving} onClick={() => onHistory(meta)} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>History</button>
          </>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Current: <strong style={{ color: colors.text }}>{current}</strong> (read-only — admin/super_admin)</span>
        )}
      </div>
    </div>
  );
}

function EnumRow({
  meta, current, saving, canWrite, customized, onSave, onResetDefault, onHistory, onResult,
}: {
  meta: SettingsMeta; current: string[]; saving: boolean; canWrite: boolean; customized: boolean;
  onSave: (m: SettingsMeta, v: string[]) => void; onResetDefault: (m: SettingsMeta) => void;
  onHistory: (m: SettingsMeta) => void; onResult: (r: SaveState) => void;
}) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string[]>(current);
  useEffect(() => setSelected(current), [current]);
  const options = meta.options ?? [];
  const toggle = (opt: string) => {
    setSelected((prev) => (prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]));
    onResult({ kind: 'idle' });
  };
  const isDirty = selected.length !== current.length || selected.some((x) => !current.includes(x)) || current.some((x) => !selected.includes(x));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', borderBottom: `1px solid ${colors.borderLight}`, padding: '10px 0' }}>
      <div>
        <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}<CustomizationBadge customized={customized} /></div>
        <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{meta.description}</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
          {options.map((opt) => {
            const on = selected.includes(opt);
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: colors.text, fontSize: '0.78rem' }}>
                <input type="checkbox" data-testid={`setting-${meta.key}-${opt}`} checked={on} disabled={saving} onChange={() => toggle(opt)} />
                {opt}
              </label>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {canWrite ? (
          <>
            <button disabled={saving || !isDirty || selected.length === 0}
              onClick={() => onSave(meta, selected)}
              style={{ background: colors.accent, color: '#0a0a14', border: 'none', borderRadius: '6px', padding: '6px 14px', fontWeight: 600, opacity: (saving || !isDirty || selected.length === 0) ? 0.5 : 1, cursor: (saving || !isDirty || selected.length === 0) ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {isDirty && <button onClick={() => { setSelected(current); onResult({ kind: 'idle' }); }} disabled={saving} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Discard</button>}
            {customized && <button disabled={saving} onClick={() => onResetDefault(meta)} style={{ background: 'transparent', color: colors.warning, border: `1px solid ${colors.warning}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Reset to default</button>}
            <button data-testid={`history-${meta.key}`} disabled={saving} onClick={() => onHistory(meta)} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>History</button>
          </>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Current: <strong style={{ color: colors.text }}>{current.join(', ') || '—'}</strong> (read-only — admin/super_admin)</span>
        )}
      </div>
    </div>
  );
}

function fmtAuditValue(v: unknown): string {
  if (v !== null && typeof v === 'object') {
    const asObj = v as Record<string, unknown>;
    if ('value' in asObj) return String(asObj.value);
    return JSON.stringify(v);
  }
  return v === null || v === undefined ? '—' : String(v);
}

function HistoryPanel({ meta, state: hist }: {
  meta: SettingsMeta;
  state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; entries: readonly SettingAuditEntry[] };
}) {
  const colors = useThemeColors();
  return (
    <div style={{ padding: '8px 10px', borderTop: `1px solid ${colors.borderLight}`, background: colors.bgInput, borderRadius: '8px', marginBottom: '6px' }}>
      <div style={{ color: colors.text, fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
        Change history — {CATEGORY_ORDER[meta.category]?.title ?? meta.category} / {meta.label}
      </div>
      {hist.status === 'loading' && <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Loading history…</div>}
      {hist.status === 'error' && <div style={{ color: colors.danger, fontSize: '0.7rem' }}>{hist.message}</div>}
      {hist.status === 'ok' && (hist.entries.length === 0 ? (
        <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>No recorded changes — the value is still the seeded default.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
          <thead>
            <tr>{['Old', 'New', 'Actor', 'When'].map((h) => (
              <th key={h} style={{ textAlign: 'left', color: colors.textMuted, padding: '2px 6px', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {hist.entries.map((e, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 6px', color: colors.textMuted }}>{fmtAuditValue(e.old_value)}</td>
                <td style={{ padding: '2px 6px', color: colors.text }}>{fmtAuditValue(e.new_value)}</td>
                <td style={{ padding: '2px 6px', color: colors.textMuted }}>{e.updated_by ? String(e.updated_by).slice(0, 8) : 'system'}</td>
                <td style={{ padding: '2px 6px', color: colors.textMuted }}>{e.updated_at ? new Date(e.updated_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <div style={{ color: colors.textMuted, fontSize: '0.65rem', marginTop: '4px' }}>
        Any change is written only by an admin/super_admin and recorded server-side. Records are append-only; audit history is not editable.
      </div>
    </div>
  );
}

export function AdminSettingsBI() {
  const colors = useThemeColors();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; entries: readonly SettingAuditEntry[] }>>({});

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await getSettings();
    if (result === null) { setState({ kind: 'rpc-failure' }); return; }
    if (isSettingsUnauthorized(result)) { setState({ kind: 'unauthorized' }); return; }
    const current: Record<string, SettingsValue> = {};
    for (const meta of SETTING_REGISTRY) {
      current[meta.key] = resolveCurrent(result.settings ?? undefined, meta);
    }
    const numericDrafts: Record<string, string> = {};
    for (const meta of SETTING_REGISTRY) {
      if (meta.type === 'integer' || meta.type === 'percent') numericDrafts[meta.key] = String(current[meta.key]);
    }
    setDrafts(numericDrafts);
    setHistory({});
    setState({ kind: 'ready', current });
  }, []);

  useEffect(() => { load(); }, [load]);

  const onNumericDraft = useCallback((key: string) => (v: string) => { setDrafts((p) => ({ ...p, [key]: v })); setSaveState({ kind: 'idle' }); }, []);
  const onTextDraft = useCallback((key: string) => (v: string) => { setDrafts((p) => ({ ...p, [key]: v })); setSaveState({ kind: 'idle' }); }, []);

  const applyError = useCallback((res: { error: string | null }, meta: SettingsMeta) => {
    if (res.error === 'OUT_OF_RANGE') setSaveState({ kind: 'error', message: `Out of range (${meta.min}–${meta.max}).` });
    else if (res.error === 'INVALID_PATTERN') setSaveState({ kind: 'error', message: 'Invalid value pattern.' });
    else if (res.error === 'INVALID_ALLOWED') setSaveState({ kind: 'error', message: 'Value not in allow-list.' });
    else if (res.error === 'INVALID_TYPE' || res.error === 'INVALID_VALUE') setSaveState({ kind: 'error', message: 'Invalid value type.' });
    else if (res.error === 'INVALID_KEY') setSaveState({ kind: 'error', message: 'Unknown setting key.' });
    else setSaveState({ kind: 'error', message: 'Unexpected response.' });
  }, []);

  const confirmIfSensitive = useCallback((meta: SettingsMeta, value: SettingsValue): boolean => {
    if (!isSensitiveSetting(meta.key)) return true;
    // Defensive guard only; the server authorizer remains the real gate.
    if (typeof window === 'undefined' || !window.confirm) return true;
    const pretty = Array.isArray(value) ? value.join(', ') : String(value);
    if (window.confirm(`Sensitive setting "${meta.label}" will change to "${pretty}". Continue?`)) return true;
    setSaveState({ kind: 'idle' });
    return false;
  }, []);

  const onSave = useCallback(async (meta: SettingsMeta, value: SettingsValue) => {
    if (!confirmIfSensitive(meta, value)) return;
    setSaveState({ kind: 'saving' });
    const res = await setSetting(meta.key, value as number | string | readonly string[]);
    if (res === null) { setSaveState({ kind: 'error', message: 'RPC failure — setting not saved.' }); return; }
    if (isSettingsWriteDeniedChecked(res)) { setState({ kind: 'readonly' }); setSaveState({ kind: 'error', message: 'Write denied — admin/super_admin required.' }); return; }
    if (res.error === null && res.saved) {
      const newVal = convertSaved(res.saved.value, meta);
      setState((prev) => prev.kind === 'ready' ? { kind: 'ready', current: { ...prev.current, [meta.key]: newVal } } : prev);
      if (meta.type !== 'enum') setDrafts((p) => ({ ...p, [meta.key]: String(newVal) }));
      setSaveState({ kind: 'saved' });
      void refreshRuntimeSettings();
      return;
    }
    if (res.error) { applyError(res, meta); return; }
    setSaveState({ kind: 'error', message: 'Unexpected response.' });
  }, [applyError, confirmIfSensitive]);

  const onResetDefault = useCallback(async (meta: SettingsMeta) => {
    const def = (Array.isArray(meta.defaultValue) ? [...meta.defaultValue] : meta.defaultValue) as SettingsValue;
    if (!confirmIfSensitive(meta, def)) return;
    setSaveState({ kind: 'saving' });
    const res = await setSetting(meta.key, def as number | string | readonly string[]);
    if (res === null) { setSaveState({ kind: 'error', message: 'RPC failure — Reset not applied.' }); return; }
    if (isSettingsWriteDeniedChecked(res)) { setState({ kind: 'readonly' }); setSaveState({ kind: 'error', message: 'Write denied — admin/super_admin required.' }); return; }
    if (res.error === null && res.saved) {
      const newVal = convertSaved(res.saved.value, meta);
      setState((prev) => prev.kind === 'ready' ? { kind: 'ready', current: { ...prev.current, [meta.key]: newVal } } : prev);
      if (meta.type !== 'enum') setDrafts((p) => ({ ...p, [meta.key]: String(newVal) }));
      setSaveState({ kind: 'saved' });
      void refreshRuntimeSettings();
      return;
    }
    if (res.error) { applyError(res, meta); return; }
    setSaveState({ kind: 'error', message: 'Unexpected response.' });
  }, [applyError, confirmIfSensitive]);

  const onToggleHistory = useCallback((meta: SettingsMeta) => {
    if (history[meta.key]) {
      setHistory((p) => { const n = { ...p }; delete n[meta.key]; return n; });
      return;
    }
    setHistory((p) => ({ ...p, [meta.key]: { status: 'loading' } }));
    void (async () => {
      const res = await getSettingsAudit(meta.key, 20);
      setHistory((p) => {
        const prev = p[meta.key];
        if (!prev) return p;
        if (res === null) return { ...p, [meta.key]: { status: 'error', message: 'Audit history is unavailable (transport error).' } };
        if (res.error) return { ...p, [meta.key]: { status: 'error', message: `Audit history is not available for your role (${res.error}).` } };
        return { ...p, [meta.key]: { status: 'ok', entries: res.changes ?? [] } };
      });
    })();
  }, [history]);

  if (state.kind === 'loading') {
    return <div style={{ color: colors.textMuted, padding: '2rem', textAlign: 'center' }}>Loading settings…</div>;
  }
  if (state.kind === 'rpc-failure') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.danger, margin: '0 0 8px 0' }}>RPC failure</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          Settings could not be loaded. The app continues with safe built-in defaults. This is a transport error.
        </span>
      </div>
    );
  }
  if (state.kind === 'unauthorized') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.danger, margin: '0 0 8px 0' }}>Access denied</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Your role does not allow reading central settings.</span>
      </div>
    );
  }
  if (state.kind === 'readonly') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.warning, margin: '0 0 8px 0' }}>Read-only mode</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>You can view central settings, but saving requires an admin/super_admin role.</span>
      </div>
    );
  }

  const canWrite = state.kind === 'ready';
  const current = state.current;
  const byCategory = (cat: SettingsMeta['category']) => SETTING_REGISTRY.filter((m) => m.category === cat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={cardStyle(colors)}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>Admin Control Center — Settings</h2>
        <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: '4px 0 0 0' }}>
          Centralized business settings. DB is the source of truth; each consumer falls back to its built-in default if this service is unreachable. Every change is audit-logged (who/what/old/new/when); audit history is not editable.
        </p>
        <p style={{ color: colors.textMuted, fontSize: '0.75rem', margin: '4px 0 0 0' }}>
          A <strong style={{ color: colors.warning }}>Customized</strong> badge means the live value differs from the default. Sensitive settings ask for confirmation before changing. After a successful save or reset, live consumers are refreshed immediately.
        </p>
      </div>

      {saveState.kind === 'saved' && <div style={{ ...cardStyle(colors), borderColor: colors.success, color: colors.successText }}>Setting saved successfully.</div>}
      {saveState.kind === 'error' && <div style={{ ...cardStyle(colors), borderColor: colors.danger, color: colors.dangerText }}>{saveState.message}</div>}

      {(Object.keys(CATEGORY_ORDER) as SettingsMeta['category'][]).map((cat) => {
        const rows = byCategory(cat);
        if (rows.length === 0) return null;
        return (
          <div key={cat} style={cardStyle(colors)}>
            <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: CATEGORY_ORDER[cat].color }}>●</span>
              <span>{CATEGORY_ORDER[cat].title}</span>
            </h3>
            <div>
              {rows.map((meta) => {
                const c = current[meta.key];
                const customized = isCustomizedSetting(c, meta);
                const hist = history[meta.key];
                const row = meta.type === 'text'
                  ? <TextRow key={meta.key} meta={meta} current={String(c)} saving={saveState.kind === 'saving'} canWrite={canWrite} customized={customized} draft={drafts[meta.key] ?? String(c)} onDraft={onTextDraft(meta.key)} onSave={onSave} onResetDefault={onResetDefault} onHistory={onToggleHistory} onResult={setSaveState} />
                  : meta.type === 'enum'
                    ? (() => {
                        const fallback = Array.isArray(meta.defaultValue) ? [...meta.defaultValue] : [];
                        const list = Array.isArray(c) ? c : fallback;
                        return <EnumRow key={meta.key} meta={meta} current={list} saving={saveState.kind === 'saving'} canWrite={canWrite} customized={customized} onSave={onSave} onResetDefault={onResetDefault} onHistory={onToggleHistory} onResult={setSaveState} />;
                      })()
                    : <NumericRow key={meta.key} meta={meta} current={Number(c)} saving={saveState.kind === 'saving'} canWrite={canWrite} customized={customized} draft={drafts[meta.key] ?? String(c)} onDraft={onNumericDraft(meta.key)} onSave={onSave} onResetDefault={onResetDefault} onHistory={onToggleHistory} onResult={setSaveState} />;
                return (
                  <div key={meta.key}>
                    {row}
                    {hist && <HistoryPanel meta={meta} state={hist} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isSettingsWriteDeniedChecked(r: { error: string | null }): boolean {
  return r.error === 'FORBIDDEN' || r.error === 'UNAUTHORIZED';
}