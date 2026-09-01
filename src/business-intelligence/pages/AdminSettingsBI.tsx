import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  getSettings,
  setSetting,
  isSettingsUnauthorized,
  resolveSetting,
  SETTING_REGISTRY,
  type SettingMeta,
} from '../settings-api';

/**
 * Phase 7 — Admin Control Center: Settings page.
 *
 * Read-only-until-authorized: the server RPC is the security boundary (read:
 * admin/super_admin/researcher; write: admin/super_admin). This UI renders the
 * CLOSED registered set only, grouped by domain, showing current + default +
 * type + bounds. Save enforces client-side validation for UX but the server
 * re-validates every value; a researcher who cannot write gets a read-only
 * state with no save controls.
 */

type SettingsMeta = SettingMeta;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'rpc-failure' }
  | { kind: 'unauthorized' }
  | { kind: 'readonly' }              // authorized reader but write denied / write unsupported path
  | { kind: 'ready'; current: Readonly<Record<string, number>> };

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
};

const cardStyle = (colors: ReturnType<typeof useThemeColors>): React.CSSProperties => ({
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
  padding: '16px',
});

function SettingRow({
  meta,
  current,
  saving,
  canWrite,
  draft,
  onDraft,
  onSave,
  onResult,
}: {
  meta: SettingsMeta;
  current: number;
  saving: boolean;
  canWrite: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onSave: (m: SettingsMeta, v: number) => void;
  onResult: (r: SaveState) => void;
}) {
  const colors = useThemeColors();
  const isDirty = draft !== String(current);
  const isValid = draft.trim() !== '' && !Number.isNaN(Number(draft));

  const inputValid = (() => {
    const v = Number(draft);
    if (draft.trim() === '' || Number.isNaN(v)) return true; // empty/invalid -> neutral until save
    return v >= meta.min && v <= meta.max;
  })();

  const clear = () => { onDraft(String(current)); onResult({ kind: 'idle' }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{meta.label}</div>
          <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{meta.description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>
            default <strong style={{ color: colors.textSecondary }}>{meta.defaultValue}</strong>
          </span>
          <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>
            type <strong style={{ color: colors.textSecondary }}>{meta.type}</strong>
          </span>
          <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>
            bounds <strong style={{ color: colors.textSecondary }}>{meta.min}–{meta.max}</strong>
          </span>
        </div>
      </div>

      {canWrite ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            value={draft}
            disabled={saving}
            onChange={(e) => onDraft(e.target.value)}
            style={{
              background: colors.bgInput,
              color: colors.text,
              border: `1px solid ${!inputValid ? colors.danger : colors.border}`,
              borderRadius: '6px',
              padding: '6px 8px',
              width: '120px',
            }}
          />
          <button
            disabled={saving || !isValid || !isDirty || !inputValid}
            onClick={() => { const v = Number(draft); onSave(meta, v); }}
            style={{
              background: colors.accent,
              color: '#0a0a14',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontWeight: 600,
              opacity: (saving || !isValid || !isDirty || !inputValid) ? 0.5 : 1,
              cursor: (saving || !isValid || !isDirty || !inputValid) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {isDirty && (
            <button onClick={clear} style={{ background: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>
              Reset
            </button>
          )}
        </div>
      ) : (
        <div style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
          Current: <strong style={{ color: colors.text }}>{current}</strong> (read-only — write requires admin/super_admin)
        </div>
      )}
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
    if (result === null) {
      setState({ kind: 'rpc-failure' });
      return;
    }
    if (isSettingsUnauthorized(result)) {
      setState({ kind: 'unauthorized' });
      return;
    }
    // Authorized reader. Writers are admin/super_admin; if the RPC data is
    // present we enable writes; read-only role falls back to read-only display.
    const current: Record<string, number> = {};
    for (const meta of SETTING_REGISTRY) {
      current[meta.key] = resolveSetting(result.settings ?? undefined, meta.key);
    }
    setDrafts(Object.fromEntries(Object.entries(current).map(([k, v]) => [k, String(v)])));
    setState({ kind: 'ready', current });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onDraft = useCallback((key: string) => (v: string) => {
    setDrafts((prev) => ({ ...prev, [key]: v }));
    setSaveState({ kind: 'idle' });
  }, []);

  const onSave = useCallback(async (meta: SettingsMeta, value: number) => {
    setSaveState({ kind: 'saving' });
    const res = await setSetting(meta.key, value);
    if (res === null) {
      setSaveState({ kind: 'error', message: 'RPC failure — setting not saved.' });
      return;
    }
    if (res.error === 'OUT_OF_RANGE') {
      setSaveState({ kind: 'error', message: `Out of range (${meta.min}–${meta.max}).` });
      return;
    }
    if (res.error === 'INVALID_TYPE' || res.error === 'INVALID_VALUE') {
      setSaveState({ kind: 'error', message: 'Invalid value type.' });
      return;
    }
    if (res.error === 'INVALID_KEY') {
      setSaveState({ kind: 'error', message: 'Unknown setting key.' });
      return;
    }
    if (isSettingsWriteDeniedChecked(res)) {
      setState({ kind: 'readonly' });
      setSaveState({ kind: 'error', message: 'Write denied — admin/super_admin required.' });
      return;
    }
    if (res.error === null && res.saved) {
      setState((prev) =>
        prev.kind === 'ready'
          ? { kind: 'ready', current: { ...prev.current, [res.saved!.key]: res.saved!.value } }
          : prev,
      );
      setDrafts((prev) => ({ ...prev, [res.saved!.key]: String(res.saved!.value) }));
      setSaveState({ kind: 'saved' });
      return;
    }
    setSaveState({ kind: 'error', message: 'Unexpected response.' });
  }, []);

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
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          Your role does not allow reading central settings.
        </span>
      </div>
    );
  }
  if (state.kind === 'readonly') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.warning, margin: '0 0 8px 0' }}>Read-only mode</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          You can view central settings, but saving requires an admin/super_admin role.
        </span>
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
          Centralized business settings. DB is the source of truth; each consumer falls back to its built-in default if this service is unreachable.
        </p>
      </div>

      {saveState.kind === 'saved' && (
        <div style={{ ...cardStyle(colors), borderColor: colors.success, color: colors.successText }}>
          Setting saved successfully.
        </div>
      )}
      {saveState.kind === 'error' && (
        <div style={{ ...cardStyle(colors), borderColor: colors.danger, color: colors.dangerText }}>{saveState.message}</div>
      )}

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
              {rows.map((meta) => (
                <SettingRow
                  key={meta.key}
                  meta={meta}
                  current={current[meta.key] ?? meta.defaultValue}
                  saving={saveState.kind === 'saving'}
                  canWrite={canWrite}
                  draft={drafts[meta.key] ?? String(meta.defaultValue)}
                  onDraft={onDraft(meta.key)}
                  onSave={onSave}
                  onResult={setSaveState}
                />
              ))}
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
