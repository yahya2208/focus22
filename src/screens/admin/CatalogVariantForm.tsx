import { useState, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';
import { Modal } from '../../design-system/components/Modal';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Button } from '../../design-system/components/Button';

// ─── Types ───────────────────────────────────────────────────────────────────

export type VariantFormMode = 'create' | 'edit';

export interface VariantFormData {
  ram_gb: string;
  storage_gb: string;
  region: string;
}

export interface VariantFormInitial {
  canonical_variant_id?: string;
  ram_mb?: number | null;
  storage_gb?: number | null;
  region?: string | null;
  updated_at?: string;
}

// ─── Region Options ──────────────────────────────────────────────────────────

const REGION_OPTIONS = [
  { value: '', label: 'Global' },
  { value: 'US', label: 'US' },
  { value: 'EU', label: 'EU' },
  { value: 'IN', label: 'IN' },
  { value: 'CN', label: 'CN' },
  { value: 'GL', label: 'Global (GL)' },
  { value: 'MEA', label: 'MEA' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInitialValues(initial?: VariantFormInitial): VariantFormData {
  return {
    ram_gb: initial?.ram_mb != null ? String(initial.ram_mb / 1024) : '',
    storage_gb: initial?.storage_gb != null ? String(initial.storage_gb) : '',
    region: initial?.region ?? '',
  };
}

function validate(form: VariantFormData): string | null {
  if (!form.ram_gb.trim()) {
    return 'RAM is required';
  }
  const ramGb = Number(form.ram_gb);
  if (!Number.isFinite(ramGb) || ramGb <= 0) {
    return 'RAM must be a positive number';
  }
  if (!form.storage_gb.trim()) {
    return 'Storage is required';
  }
  const storGb = Number(form.storage_gb);
  if (!Number.isFinite(storGb) || storGb <= 0) {
    return 'Storage must be a positive number';
  }
  return null;
}

export function toRamMb(ramGb: string): number {
  return Math.round(Number(ramGb) * 1024);
}

export function toStorageGb(storageGb: string): number {
  return Math.round(Number(storageGb));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CatalogVariantForm({ mode, modelCanonicalId, modelId, initial, onSuccess, onClose }: {
  mode: VariantFormMode;
  modelCanonicalId: string;
  modelId: string;
  initial?: VariantFormInitial;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const supabase = getSupabaseClient();
  const [form, setForm] = useState<VariantFormData>(() => toInitialValues(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback((field: keyof VariantFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        const { error: rpcErr } = await supabase.rpc('catalog_create_variant', {
          p_model_canonical_id: modelCanonicalId,
          p_ram_mb: toRamMb(form.ram_gb),
          p_storage_gb: toStorageGb(form.storage_gb),
          p_region: form.region || null,
          p_source_type: 'ADMIN_MANUAL',
          p_notes: null,
          p_verified: false,
        });
        if (rpcErr) {
          if (rpcErr.code === '23505') {
            setError('A variant with these specs already exists for this model.');
            return;
          }
          throw new Error(rpcErr.message);
        }
      } else {
        const { error: rpcErr } = await supabase.rpc('catalog_admin_update_variant_specs', {
          p_canonical_variant_id: initial?.canonical_variant_id,
          p_ram_mb: toRamMb(form.ram_gb),
          p_storage_gb: toStorageGb(form.storage_gb),
          p_region: form.region || null,
          p_expected_updated_at: initial?.updated_at ?? null,
        });
        if (rpcErr) {
          if (rpcErr.code === '23505') {
            setError('A variant with these specs already exists for this model.');
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
  }, [form, mode, modelCanonicalId, initial, supabase, onSuccess, modelId]);

  const title = mode === 'create' ? 'Add Variant' : 'Edit Variant';

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>
            RAM (GB) <span style={{ color: colors.danger }}>*</span>
          </span>
          <Input
            type="number"
            value={form.ram_gb}
            onChange={(e) => setField('ram_gb', e.target.value)}
            placeholder="e.g. 8"
            disabled={submitting}
            required
            min={0.5}
            step={0.5}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>
            Storage (GB) <span style={{ color: colors.danger }}>*</span>
          </span>
          <Input
            type="number"
            value={form.storage_gb}
            onChange={(e) => setField('storage_gb', e.target.value)}
            placeholder="e.g. 128"
            disabled={submitting}
            required
            min={1}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Region</span>
          <Select
            value={form.region}
            onChange={(e) => setField('region', e.target.value)}
            options={REGION_OPTIONS}
            disabled={submitting}
          />
        </label>

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
            {mode === 'create' ? 'Add Variant' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
