import { memo, useState } from 'react';
import { getAllBrands, type CatalogSearchResult } from '../../services/catalog-service';
import { useThemeColors } from '../../hooks/useThemeColors';
import { CatalogCascadeSelector } from './CatalogCascadeSelector';

// ─── Legacy bridge: wraps CatalogCascadeSelector with old API ──────
interface CatalogAutocompleteProps {
  onSelect: (result: CatalogSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
  onModelNotFound?: (brand: string, model: string) => void;
}

export const CatalogAutocomplete = memo(function CatalogAutocomplete({ onSelect, onModelNotFound }: CatalogAutocompleteProps) {
  return (
    <CatalogCascadeSelector
      value={{}}
      onChange={(id) => {
        if (id.modelName && id.brandName) {
          onSelect({
            brand: id.brandName,
            model: id.modelName,
            normalized: id.modelName.toLowerCase().replace(/\s+/g, ''),
            score: 100,
          });
        }
      }}
      showSearch
      showFavorites
      onModelNotFound={onModelNotFound}
    />
  );
});

// ─── Brand Select (unchanged, already no free text in selection) ───
export const CatalogBrandSelect = memo(function CatalogBrandSelect({ onSelect }: { onSelect: (brand: string) => void }) {
  const colors = useThemeColors();
  const brands = getAllBrands();
  const [query, setQuery] = useState('');

  const filtered = query ? brands.filter(b => b.toLowerCase().includes(query.toLowerCase())) : brands;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="ابحث عن علامة..."
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '8px',
          border: `1px solid ${colors.border}`, background: colors.bgInput,
          color: colors.text, fontSize: '0.85rem', fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
        {filtered.map(brand => (
          <button key={brand} onClick={() => onSelect(brand)} style={{
            padding: '6px 14px', borderRadius: '8px', border: `1px solid ${colors.borderLight}`,
            background: colors.bgInput, color: colors.text, cursor: 'pointer',
            fontSize: '0.78rem', fontFamily: 'inherit',
          }}>
            {brand}
          </button>
        ))}
      </div>
    </div>
  );
});
