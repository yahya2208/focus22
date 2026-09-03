import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  getSettings,
  setSetting,
  isSettingsUnauthorized,
  resolveSetting,
  resolveSettingString,
  resolveSettingList,
  SETTING_REGISTRY,
  type SettingMeta,
} from '../settings-api';

/**
 * Phase 7 (+ Admin Control Center Pass 1) — Admin Control Center: Settings page.
 *
 * Read-only-until-authorized: the server RPC is the security boundary (read:
 * admin/super_admin/researcher; write: admin/super_admin). This UI renders the
 * CLOSED registered set only, grouped by domain, showing current + default +
 * type + bounds/a11y. Save enforces client-side validation for UX but the server
 * re-validates every value (incl. string/enum pattern + allow-list); a researcher
 * who cannot write gets a read-only state with no save controls.
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

const CATEGORY_ORDER: Record<SettingsMeta['category'], { title: string; color: string }> = {
  game: { title: 'Game', color: '#4cc4f0' },
  offers: { title: 'Offers', color: '#f59e0b' },
  inventory: { title: 'Inventory', color: '#22c55e' },
  rules: { title: 'Business Rules', color: '#8b5cf6' },
  cache: { title: 'Cache', color: '#ff6b7a' },
  telemetry: { title: 'Telemetry', color: '#38bdf8' },
  general: { title: 'General', color: '#94a3b8' },
  marketplace: { title: 'Marketplace', color: '#14b8a6' },
  ads: { title: 'Ads', color: '#f97316' },
  experience: { title: 'Experience', color: '#ec4899' },
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

function NumericRow({
  meta, current, saving, canWrite, draft, onDraft, onSave, onResult,
}: {
  meta: SettingsMeta; current: number; saving: boolean; canWrite: boolean;
  draft: string; onDraft: (v: string) => void; onSave: (m: SettingsMeta, v: number) => void; onResult: (r: SaveState) => void;
}) {
  const colors = useThemeColors();
  const isDirty = draft !== String(current);
  const isValid = draft.trim() !== '' && !Number.isNaN(Number(draft));
  const v = Number(draft);
  const inputValid = draft.trim() === '' || Number.isNaN(v) || (v >= (meta.min ?? 0) && v <= (meta.max ?? 0));
  const clear = () => { onDraft(String(current)); onResult({ kind: 'idle' }); };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: `1px solid ${colors.borderLight}`, padding: '10px 0' }}>
      <div>
        <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}</div>
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
            {isDirty && <button onClick={clear} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Reset</button>}
          </>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Current: <strong style={{ color: colors.text }}>{current}</strong> (read-only — admin/super_admin)</span>
        )}
      </div>
    </div>
  );
}

function TextRow({
  meta, current, saving, canWrite, draft, onDraft, onSave, onResult,
}: {
  meta: SettingsMeta; current: string; saving: boolean; canWrite: boolean;
  draft: string; onDraft: (v: string) => void; onSave: (m: SettingsMeta, v: string) => void; onResult: (r: SaveState) => void;
}) {
  const colors = useThemeColors();
  const isDirty = draft !== current;
  const inputValid = !meta.pattern || new RegExp(meta.pattern).test(draft.trim());
  const clear = () => { onDraft(current); onResult({ kind: 'idle' }); };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: `1px solid ${colors.borderLight}`, padding: '10px 0' }}>
      <div>
        <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}</div>
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
            {isDirty && <button onClick={clear} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Reset</button>}
          </>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Current: <strong style={{ color: colors.text }}>{current}</strong> (read-only — admin/super_admin)</span>
        )}
      </div>
    </div>
  );
}

function EnumRow({
  meta, current, saving, canWrite, onSave, onResult,
}: {
  meta: SettingsMeta; current: string[]; saving: boolean; canWrite: boolean; onSave: (m: SettingsMeta, v: string[]) => void; onResult: (r: SaveState) => void;
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
        <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}</div>
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
            {isDirty && <button onClick={() => { setSelected(current); onResult({ kind: 'idle' }); }} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>Reset</button>}
          </>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Current: <strong style={{ color: colors.text }}>{current.join(', ') || '—'}</strong> (read-only — admin/super_admin)</span>
        )}
      </div>
    </div>
  );
}

export function AdminSettingsBI() {
  const colors = useThemeColors();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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

  const onSave = useCallback(async (meta: SettingsMeta, value: SettingsValue) => {
    setSaveState({ kind: 'saving' });
    const res = await setSetting(meta.key, value as number | string | readonly string[]);
    if (res === null) { setSaveState({ kind: 'error', message: 'RPC failure — setting not saved.' }); return; }
    if (isSettingsWriteDeniedChecked(res)) { setState({ kind: 'readonly' }); setSaveState({ kind: 'error', message: 'Write denied — admin/super_admin required.' }); return; }
    if (res.error === null && res.saved) {
      const newVal = meta.type === 'integer' || meta.type === 'percent' ? Number(res.saved.value) : res.saved.value;
      setState((prev) => prev.kind === 'ready' ? { kind: 'ready', current: { ...prev.current, [meta.key]: newVal } } : prev);
      if (meta.type === 'integer' || meta.type === 'percent') setDrafts((p) => ({ ...p, [meta.key]: String(newVal) }));
      setSaveState({ kind: 'saved' });
      return;
    }
    if (res.error) { applyError(res, meta); return; }
    setSaveState({ kind: 'error', message: 'Unexpected response.' });
  }, [applyError]);

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
                if (meta.type === 'text') {
                  return <TextRow key={meta.key} meta={meta} current={String(c)} saving={saveState.kind === 'saving'} canWrite={canWrite} draft={drafts[meta.key] ?? String(c)} onDraft={onTextDraft(meta.key)} onSave={onSave} onResult={setSaveState} />;
                }
                if (meta.type === 'enum') {
                  const fallback = Array.isArray(meta.defaultValue) ? [...meta.defaultValue] : [];
                  const list = Array.isArray(c) ? c : fallback;
                  return <EnumRow key={meta.key} meta={meta} current={list} saving={saveState.kind === 'saving'} canWrite={canWrite} onSave={onSave} onResult={setSaveState} />;
                }
                return <NumericRow key={meta.key} meta={meta} current={Number(c)} saving={saveState.kind === 'saving'} canWrite={canWrite} draft={drafts[meta.key] ?? String(c)} onDraft={onNumericDraft(meta.key)} onSave={onSave} onResult={setSaveState} />;
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
