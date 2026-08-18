import { useState, useCallback, useRef, useEffect } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useCatalogBrands, type CatalogBrand } from '../../hooks/useCatalogBrands';

export function BrandAddModal({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: (brand: CatalogBrand) => void;
}) {
  const colors = useThemeColors();
  const { addBrand } = useCatalogBrands();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Brand name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const brand = await addBrand(trimmed);
      onAdded(brand);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to add brand.';
      if (msg.includes('23505') || msg.includes('already exists')) {
        setError(`Brand "${trimmed}" already exists.`);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }, [displayName, addBrand, onAdded]);

  return (
    <div
      role="dialog"
      aria-label="Add new brand"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '1.5rem', width: '360px', maxWidth: '90vw',
      }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: colors.text }}>
          Add New Brand
        </h3>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary }}>
              Brand Name
            </span>
            <input
              ref={inputRef}
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setError(null); }}
              placeholder="e.g. itel"
              disabled={submitting}
              style={{
                padding: '0.5rem 0.75rem', borderRadius: '8px',
                border: `1px solid ${error ? colors.danger : colors.border}`,
                background: colors.bgInput, color: colors.text,
                fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
              }}
            />
          </label>
          {error && (
            <div style={{ fontSize: '0.8rem', color: colors.danger, marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '8px',
                border: `1px solid ${colors.border}`, background: colors.bgCard,
                color: colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !displayName.trim()}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '8px',
                border: `1px solid ${colors.accent}`, background: colors.accent,
                color: '#fff', cursor: submitting ? 'wait' : 'pointer',
                fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit',
                opacity: submitting || !displayName.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? 'Adding...' : 'Add Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
