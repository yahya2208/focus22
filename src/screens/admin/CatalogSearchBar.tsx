import { useState, useEffect, useRef } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

// ─── Filter State ─────────────────────────────────────────────────────────────

export interface CatalogFilters {
  search: string;
  brand: string;
  approval: string;
  has_variants: boolean | null;
  page: number;
}

export const PAGE_SIZE = 50;

export const EMPTY_FILTERS: CatalogFilters = {
  search: '',
  brand: '',
  approval: 'draft',
  has_variants: null,
  page: 1,
};

// ─── Brand List ───────────────────────────────────────────────────────────────

const BRAND_OPTIONS = [
  { value: '', label: 'All Brands' },
  { value: 'apple', label: 'Apple' },
  { value: 'samsung', label: 'Samsung' },
  { value: 'google', label: 'Google' },
  { value: 'oneplus', label: 'OnePlus' },
  { value: 'xiaomi', label: 'Xiaomi' },
  { value: 'sony', label: 'Sony' },
  { value: 'huawei', label: 'Huawei' },
];

// ─── Debounced Input ──────────────────────────────────────────────────────────

function DebouncedInput({ value, onDebouncedChange, placeholder, colors }: {
  value: string;
  onDebouncedChange: (v: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onDebouncedChange(local), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [local, onDebouncedChange]);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      aria-label="Search models"
      style={{
        flex: 1,
        minWidth: '200px',
        padding: '0.5rem 0.75rem',
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
        background: colors.bgInput,
        color: colors.text,
        fontSize: '0.85rem',
        fontFamily: 'inherit',
        outline: 'none',
      }}
    />
  );
}

// ─── Select Dropdown ──────────────────────────────────────────────────────────

function FilterSelect({ value, onChange, options, colors }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter dropdown"
      style={{
        padding: '0.5rem 0.75rem',
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
        background: colors.bgInput,
        color: colors.text,
        fontSize: '0.8rem',
        fontFamily: 'inherit',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ─── Pagination Controls ──────────────────────────────────────────────────────

export function PaginationControls({ page, total, loading, onPrev, onNext, colors }: {
  page: number;
  total: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '0.8rem', color: colors.textSecondary }}>
      <button
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous page"
        style={{
          padding: '0.35rem 0.75rem',
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          background: canPrev ? colors.bgCard : 'transparent',
          color: canPrev ? colors.text : colors.textFaint,
          cursor: canPrev ? 'pointer' : 'not-allowed',
          fontSize: '0.8rem',
          fontFamily: 'inherit',
        }}
      >
        Prev
      </button>
      <span>
        {total > 0 ? `${start}–${end} of ${total}` : '0 results'}
      </span>
      <button
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next page"
        style={{
          padding: '0.35rem 0.75rem',
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          background: canNext ? colors.bgCard : 'transparent',
          color: canNext ? colors.text : colors.textFaint,
          cursor: canNext ? 'pointer' : 'not-allowed',
          fontSize: '0.8rem',
          fontFamily: 'inherit',
        }}
      >
        Next
      </button>
    </div>
  );
}

// ─── Main Search Bar ──────────────────────────────────────────────────────────

export function CatalogSearchBar({ filters, total, loading, onChange }: {
  filters: CatalogFilters;
  total: number;
  loading: boolean;
  onChange: (partial: Partial<CatalogFilters>) => void;
}) {
  const colors = useThemeColors();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Search + Brand Row */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <DebouncedInput
          value={filters.search}
          onDebouncedChange={(search) => onChange({ search, page: 1 })}
          placeholder="Search by name or ID..."
          colors={colors}
        />
        <FilterSelect
          value={filters.brand}
          onChange={(brand) => onChange({ brand, page: 1 })}
          options={BRAND_OPTIONS}
          colors={colors}
        />
      </div>

      {/* Approval Filter Row */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterSelect
          value={filters.approval}
          onChange={(approval) => onChange({ approval, page: 1 })}
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ]}
          colors={colors}
        />
        <button
          onClick={() => onChange({ has_variants: filters.has_variants === true ? null : true, page: 1 })}
          aria-label="Toggle has variants filter"
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: '8px',
            border: `1px solid ${filters.has_variants === true ? colors.accent : colors.border}`,
            background: filters.has_variants === true ? `${colors.accent}22` : 'transparent',
            color: filters.has_variants === true ? colors.accent : colors.textMuted,
            cursor: 'pointer',
            fontWeight: filters.has_variants === true ? 700 : 500,
            fontSize: '0.8rem',
            fontFamily: 'inherit',
          }}
        >
          Has Variants
        </button>
      </div>

      {/* Pagination */}
      <PaginationControls
        page={filters.page}
        total={total}
        loading={loading}
        onPrev={() => onChange({ page: filters.page - 1 })}
        onNext={() => onChange({ page: filters.page + 1 })}
        colors={colors}
      />
    </div>
  );
}
