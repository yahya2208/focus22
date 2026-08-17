import { useState, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';
import { Modal } from '../../design-system/components/Modal';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Button } from '../../design-system/components/Button';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModelFormMode = 'create' | 'edit';

export interface ModelFormData {
  brand_id: string;
  name: string;
  series: string;
  release_year: string;
  model_numbers: string;
  aliases: string;
  owner_notes: string;
}

export interface ModelFormInitial {
  canonical_id?: string;
  brand_id?: string;
  name?: string;
  series?: string | null;
  release_year?: number | null;
  model_numbers?: string[];
  aliases?: string[];
  owner_notes?: string;
  updated_at?: string;
}

// ─── Brand Options ───────────────────────────────────────────────────────────

const BRAND_OPTIONS = [
  { value: 'apple', label: 'Apple' },
  { value: 'samsung', label: 'Samsung' },
  { value: 'google', label: 'Google' },
  { value: 'oneplus', label: 'OnePlus' },
  { value: 'xiaomi', label: 'Xiaomi' },
  { value: 'sony', label: 'Sony' },
  { value: 'huawei', label: 'Huawei' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInitialValues(initial?: ModelFormInitial): ModelFormData {
  return {
    brand_id: initial?.brand_id ?? 'apple',
    name: initial?.name ?? '',
    series: initial?.series ?? '',
    release_year: initial?.release_year != null ? String(initial.release_year) : '',
    model_numbers: initial?.model_numbers?.join(', ') ?? '',
    aliases: initial?.aliases?.join(', ') ?? '',
    owner_notes: initial?.owner_notes ?? '',
  };
}

function parseArrayField(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function validate(form: ModelFormData, mode: ModelFormMode): string | null {
  if (mode === 'create' && !form.brand_id) {
    return 'Brand is required';
  }
  if (!form.name.trim()) {
    return 'Model name is required';
  }
  if (form.name.trim().length > 200) {
    return 'Model name is too long (max 200 characters)';
  }
  if (form.release_year) {
    const y = Number(form.release_year);
    if (!Number.isInteger(y) || y <= 0 || y > 2100) {
      return 'Release year must be a valid year (1–2100)';
    }
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CatalogModelForm({ mode, initial, onSuccess, onClose }: {
  mode: ModelFormMode;
  initial?: ModelFormInitial;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const supabase = getSupabaseClient();
  const [form, setForm] = useState<ModelFormData>(() => toInitialValues(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback((field: keyof ModelFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(form, mode);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const { error: rpcErr } = await supabase.rpc('catalog_create_model', {
          p_brand_id: form.brand_id,
          p_name: form.name.trim(),
          p_series: form.series.trim() || null,
          p_release_year: form.release_year ? Number(form.release_year) : null,
          p_model_numbers: parseArrayField(form.model_numbers),
          p_aliases: parseArrayField(form.aliases),
        });
        if (rpcErr) {
          if (rpcErr.code === '23505') {
            setError('This model already exists.');
            return;
          }
          throw new Error(rpcErr.message);
        }
      } else {
        const { error: rpcErr } = await supabase.rpc('catalog_admin_update_model', {
          p_canonical_id: initial?.canonical_id,
          p_name: form.name.trim(),
          p_series: form.series.trim() || null,
          p_release_year: form.release_year ? Number(form.release_year) : null,
          p_model_numbers: parseArrayField(form.model_numbers),
          p_aliases: parseArrayField(form.aliases),
          p_owner_notes: form.owner_notes.trim() || null,
          p_expected_updated_at: initial?.updated_at ?? null,
        });
        if (rpcErr) {
          if (rpcErr.code === '23505') {
            setError('A model with this name already exists for this brand.');
            return;
          }
          if (rpcErr.code === '55000') {
            setError('The record was modified by another user. Please refresh and try again.');
            return;
          }
          throw new Error(rpcErr.message);
        }
      }
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [form, mode, initial, supabase, onSuccess]);

  const title = mode === 'create' ? 'Create Model' : 'Edit Model';

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {mode === 'create' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Brand</span>
            <Select
              value={form.brand_id}
              onChange={(e) => setField('brand_id', e.target.value)}
              options={BRAND_OPTIONS}
              disabled={submitting}
            />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>
            Model Name <span style={{ color: colors.danger }}>*</span>
          </span>
          <Input
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. iPhone 16 Pro"
            disabled={submitting}
            required
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Series</span>
          <Input
            value={form.series}
            onChange={(e) => setField('series', e.target.value)}
            placeholder="e.g. iPhone 16"
            disabled={submitting}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Release Year</span>
          <Input
            type="number"
            value={form.release_year}
            onChange={(e) => setField('release_year', e.target.value)}
            placeholder="e.g. 2024"
            disabled={submitting}
            min={1}
            max={2100}
          />
        </label>

        {mode === 'edit' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Model Numbers</span>
              <Input
                value={form.model_numbers}
                onChange={(e) => setField('model_numbers', e.target.value)}
                placeholder="Comma separated"
                disabled={submitting}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Aliases</span>
              <Input
                value={form.aliases}
                onChange={(e) => setField('aliases', e.target.value)}
                placeholder="Comma separated"
                disabled={submitting}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Notes</span>
              <Input
                value={form.owner_notes}
                onChange={(e) => setField('owner_notes', e.target.value)}
                placeholder="Optional notes"
                disabled={submitting}
              />
            </label>
          </>
        )}

        {error && (
          <div style={{
            padding: '0.6rem 0.8rem', borderRadius: '6px',
            background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
            color: colors.dangerText, fontSize: '0.8rem',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={submitting} type="submit">
            {mode === 'create' ? 'Create Model' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
