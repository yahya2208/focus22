import { useState, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getSupabaseClient } from '../../core/supabase/client';
import { Modal } from '../../design-system/components/Modal';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Button } from '../../design-system/components/Button';
import { useCatalogBrands } from '../../hooks/useCatalogBrands';
import { BrandAddModal } from './BrandAddModal';
import {
  toRamMb,
  toStorageGb,
  isValidRamGb,
  isValidStorageGb,
  variantCompactLabel,
  variantDetailedLabel,
  REGION_OPTIONS,
} from './catalog-utils';

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

export interface PendingVariant {
  id: string;
  ram_gb: string;
  storage_gb: string;
  region: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _pendingId = 0;
function nextPendingId(): string {
  return `pending-${++_pendingId}-${Date.now()}`;
}

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

function validateModel(form: ModelFormData, mode: ModelFormMode): string | null {
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

function validateVariant(v: PendingVariant): string | null {
  if (!v.ram_gb.trim()) return null; // empty = not yet entered
  const ramGb = Number(v.ram_gb);
  if (!Number.isFinite(ramGb) || ramGb <= 0) {
    return 'RAM must be a valid value (e.g., 4, 6, 8, 12 GB).';
  }
  if (!isValidRamGb(ramGb)) {
    return 'RAM must be a valid value (e.g., 4, 6, 8, 12 GB).';
  }
  if (!v.storage_gb.trim()) return null;
  const storGb = Number(v.storage_gb);
  if (!Number.isFinite(storGb) || storGb <= 0) {
    return 'Storage must be a valid value (e.g., 64, 128, 256 GB).';
  }
  if (!isValidStorageGb(storGb)) {
    return 'Storage must be a valid value (e.g., 64, 128, 256 GB).';
  }
  return null;
}

function variantKey(v: PendingVariant): string {
  const ramMb = toRamMb(v.ram_gb);
  const storGb = toStorageGb(v.storage_gb);
  return `${ramMb}-${storGb}-${v.region || ''}`;
}

function hasFilledVariant(v: PendingVariant): boolean {
  return v.ram_gb.trim() !== '' && v.storage_gb.trim() !== '';
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
  const { brands } = useCatalogBrands();
  const [form, setForm] = useState<ModelFormData>(() => toInitialValues(initial));
  const [variants, setVariants] = useState<PendingVariant[]>([]);
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrandModal, setShowBrandModal] = useState(false);

  const setField = useCallback((field: keyof ModelFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  // ─── Variant Management ────────────────────────────────────────────────

  const addVariant = useCallback(() => {
    setVariants(prev => [...prev, { id: nextPendingId(), ram_gb: '', storage_gb: '', region: '' }]);
    setVariantErrors({});
  }, []);

  const removeVariant = useCallback((id: string) => {
    setVariants(prev => prev.filter(v => v.id !== id));
    setVariantErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateVariant = useCallback((id: string, field: keyof PendingVariant, value: string) => {
    setVariants(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
    setVariantErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ─── Variant Validation ────────────────────────────────────────────────

  const validateAllVariants = useCallback((): boolean => {
    const filled = variants.filter(hasFilledVariant);
    const errors: Record<string, string> = {};
    const seen = new Map<string, string>();

    for (const v of filled) {
      const err = validateVariant(v);
      if (err) {
        errors[v.id] = err;
        continue;
      }
      const key = variantKey(v);
      const existing = seen.get(key);
      if (existing) {
        errors[v.id] = 'This RAM/storage combination already exists in the variant list.';
      } else {
        seen.set(key, v.id);
      }
    }

    setVariantErrors(errors);
    return Object.keys(errors).length === 0;
  }, [variants]);

  // ─── Submit ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const modelError = validateModel(form, mode);
    if (modelError) {
      setError(modelError);
      return;
    }

    if (!validateAllVariants()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        // Step 1: Create model
        const { data: createdModel, error: rpcErr } = await supabase.rpc('catalog_create_model', {
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

        // Step 2: Create variants (if any)
        const filled = variants.filter(hasFilledVariant);
        if (filled.length > 0 && createdModel) {
          const canonicalId = createdModel.canonical_id as string;
          let created = 0;
          let failed = 0;
          const failedLabels: string[] = [];

          for (const v of filled) {
            const ramMb = toRamMb(v.ram_gb);
            const storGb = toStorageGb(v.storage_gb);
            const { error: varErr } = await supabase.rpc('catalog_create_variant', {
              p_model_canonical_id: canonicalId,
              p_ram_mb: ramMb,
              p_storage_gb: storGb,
              p_region: v.region || null,
              p_source_type: 'ADMIN_MANUAL',
              p_notes: null,
              p_verified: false,
            });
            if (varErr) {
              failed++;
              failedLabels.push(variantDetailedLabel(ramMb, storGb));
            } else {
              created++;
            }
          }

          if (failed > 0) {
            const total = created + failed;
            setError(
              `Model was saved. ${failed} of ${total} variant${total > 1 ? 's' : ''} could not be saved:\n` +
              failedLabels.map(l => `${l}: already exists`).join('\n')
            );
            // Still call onSuccess so the model appears in the list
            onSuccess();
            return;
          }
        }

        onSuccess();
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
        onSuccess();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [form, mode, initial, variants, supabase, onSuccess, validateAllVariants]);

  const title = mode === 'create' ? 'Create Model' : 'Edit Model';
  const showVariants = mode === 'create';

  return (
    <>
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {mode === 'create' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>Brand</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <Select
                value={form.brand_id}
                onChange={(e) => setField('brand_id', e.target.value)}
                options={brands.map(b => ({ value: b.slug, label: b.display_name }))}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowBrandModal(true)}
                disabled={submitting}
                style={{
                  padding: '0.4rem 0.6rem', borderRadius: '8px',
                  border: `1px solid ${colors.accent}`, background: `${colors.accent}22`,
                  color: colors.accent, cursor: 'pointer', fontWeight: 600,
                  fontSize: '0.8rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                + Add Brand
              </button>
            </div>
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

        {/* ─── Variant Section (create mode only) ────────────────────── */}
        {showVariants && (
          <>
            <h4 style={{
              fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary,
              paddingTop: '0.25rem', borderTop: `1px solid ${colors.border}`,
              margin: 0,
            }}>
              Variants <span style={{ fontWeight: 400, color: colors.textMuted }}>(optional)</span>
            </h4>

            {variants.map((v, idx) => (
              <div key={v.id} style={{
                display: 'flex', flexDirection: 'column', gap: '0.3rem',
                padding: '0.5rem', borderRadius: '6px',
                border: `1px solid ${colors.border}`,
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                    <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>RAM (GB) - Variant {idx + 1}</span>
                    <Input
                      type="number"
                      value={v.ram_gb}
                      onChange={(e) => updateVariant(v.id, 'ram_gb', e.target.value)}
                      placeholder="8"
                      disabled={submitting}
                      min={0.25}
                      step="any"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                    <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Storage (GB) - Variant {idx + 1}</span>
                    <Input
                      type="number"
                      value={v.storage_gb}
                      onChange={(e) => updateVariant(v.id, 'storage_gb', e.target.value)}
                      placeholder="256"
                      disabled={submitting}
                      min={1}
                      step="any"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                    <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>Region - Variant {idx + 1}</span>
                    <Select
                      value={v.region}
                      onChange={(e) => updateVariant(v.id, 'region', e.target.value)}
                      options={REGION_OPTIONS}
                      disabled={submitting}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => removeVariant(v.id)}
                    disabled={submitting}
                    type="button"
                    aria-label={`Remove variant ${idx + 1}`}
                    style={{ marginBottom: '1px', alignSelf: 'flex-end', padding: '0.35rem 0.5rem', fontSize: '0.7rem' }}
                  >
                    Remove
                  </Button>
                </div>

                {/* Label preview */}
                {hasFilledVariant(v) && (
                  <div style={{ fontSize: '0.7rem', color: colors.textMuted, paddingLeft: '0.25rem' }}>
                    {variantCompactLabel(toRamMb(v.ram_gb), toStorageGb(v.storage_gb))}
                    {' · '}
                    {variantDetailedLabel(toRamMb(v.ram_gb), toStorageGb(v.storage_gb))}
                  </div>
                )}

                {/* Error */}
                {variantErrors[v.id] && (
                  <div role="alert" style={{ fontSize: '0.7rem', color: colors.dangerText, paddingLeft: '0.25rem' }}>
                    {variantErrors[v.id]}
                  </div>
                )}
              </div>
            ))}

            <Button
              variant="secondary"
              size="sm"
              onClick={addVariant}
              disabled={submitting}
              type="button"
              aria-label="Add variant"
              style={{
                borderStyle: 'dashed', borderColor: colors.info,
                color: colors.info, fontSize: '0.8rem',
              }}
            >
              + Add Variant
            </Button>
          </>
        )}

        {error && (
          <div role="alert" style={{
            padding: '0.6rem 0.8rem', borderRadius: '6px', whiteSpace: 'pre-line',
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
            {mode === 'create' ? 'Save as Draft' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
    {showBrandModal && (
      <BrandAddModal
        onClose={() => setShowBrandModal(false)}
        onAdded={(brand) => {
          setShowBrandModal(false);
          setField('brand_id', brand.slug);
        }}
      />
    )}
    </>
  );
}
