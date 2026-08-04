import { memo, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Highlight } from './CatalogCascadeTypes';
import type { CatalogSearchResult } from './CatalogCascadeTypes';

interface CatalogStepSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchFocus: () => void;
  onSearchKeyDown: (e: React.KeyboardEvent) => void;
  showSearchResults: boolean;
  searchResults: CatalogSearchResult[];
  groupedResults: [string, CatalogSearchResult[]][];
  searchIndex: number;
  onSearchSelect: (result: CatalogSearchResult) => void;
  onSearchHover: (index: number) => void;
  favorites: { brand: string; model: string }[];
  mostUsed: { brand: string; model: string; count: number }[];
  showFavorites: boolean;
  onFavoriteSelect: (brand: string, model: string) => void;
  onBrowseClick: () => void;
  disabled?: boolean;
  searchRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onModelNotFound?: (brand: string, model: string) => void;
}

function CatalogStepSearch({
  searchQuery, onSearchChange, onSearchFocus, onSearchKeyDown,
  showSearchResults, searchResults, groupedResults, searchIndex,
  onSearchSelect, onSearchHover, favorites, mostUsed, showFavorites,
  onFavoriteSelect, onBrowseClick, disabled, searchRef, searchInputRef,
  onModelNotFound,
}: CatalogStepSearchProps) {
  const colors = useThemeColors();
  const [notFoundOpen, setNotFoundOpen] = useState(false);
  const [notFoundBrand, setNotFoundBrand] = useState('');
  const [notFoundModel, setNotFoundModel] = useState('');

  const handleNotFoundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const brand = notFoundBrand.trim();
    const model = notFoundModel.trim();
    if (brand && model && onModelNotFound) {
      onModelNotFound(brand, model);
      setNotFoundOpen(false);
      setNotFoundBrand('');
      setNotFoundModel('');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: `1px solid ${colors.border}`, background: colors.bgInput,
    color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div ref={searchRef} style={{ position: 'relative' }}>
      <div style={{ marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={onSearchFocus}
          onKeyDown={onSearchKeyDown}
          placeholder="ابحث عن هاتف... (A10, سامسونج, S25, SM-A105)"
          disabled={disabled}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: '10px',
            border: `2px solid ${showSearchResults ? colors.accent : colors.border}`,
            background: colors.bgInput, color: colors.text,
            fontSize: '0.9rem', fontFamily: 'inherit',
            outline: 'none', transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
        />
        <button onClick={onBrowseClick} disabled={disabled} style={{
          padding: '12px 16px', borderRadius: '10px', border: 'none',
          background: colors.accent, color: colors.text, cursor: 'pointer',
          fontSize: '0.78rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
          اختيار من القائمة
        </button>
      </div>
      {showSearchResults && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '10px', marginTop: '4px', maxHeight: '360px', overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)', direction: 'rtl',
        }}>
          {searchResults.length === 0 && searchQuery.length >= 1 && (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ color: colors.textMuted, fontSize: '0.82rem', margin: '0 0 10px' }}>
                لا توجد نتائج مطابقة.
              </p>
              {onModelNotFound && (
                notFoundOpen ? (
                  <form
                    onSubmit={handleNotFoundSubmit}
                    style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'right' }}
                  >
                    <input
                      autoFocus
                      value={notFoundBrand}
                      onChange={e => setNotFoundBrand(e.target.value)}
                      placeholder="اسم الشركة المصنعة (مثال: سامسونج)"
                      style={inputStyle}
                    />
                    <input
                      value={notFoundModel}
                      onChange={e => setNotFoundModel(e.target.value)}
                      placeholder="اسم الموديل (مثال: A32)"
                      style={inputStyle}
                    />
                    <button
                      type="submit"
                      disabled={!notFoundBrand.trim() || !notFoundModel.trim()}
                      style={{
                        padding: '8px 12px', borderRadius: '8px', border: 'none',
                        background: '#25D366', color: '#fff', cursor: 'pointer',
                        fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 600,
                        opacity: (!notFoundBrand.trim() || !notFoundModel.trim()) ? 0.5 : 1,
                      }}
                    >
                      📤 إرسال عبر واتساب
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNotFoundOpen(true)}
                    style={{
                      padding: '8px 14px', borderRadius: '8px',
                      border: `1px dashed ${colors.accent}`,
                      background: 'transparent', color: colors.accent,
                      cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit',
                    }}
                  >
                    هاتفي غير موجود؟ أخبرنا
                  </button>
                )
              )}
            </div>
          )}
          {groupedResults.map(([brand, items]) => (
            <div key={brand}>
              <div style={{
                padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700,
                color: colors.textMuted, background: colors.bgInput,
                borderBottom: `1px solid ${colors.borderLight}`,
                position: 'sticky', top: 0,
              }}>
                {brand}
              </div>
              {items.map((r) => {
                const idx = searchResults.indexOf(r);
                const isActive = idx === searchIndex;
                return (
                  <button
                    key={`${r.brand}-${r.model}`}
                    onClick={() => onSearchSelect(r)}
                    onMouseEnter={() => onSearchHover(idx)}
                    style={{
                      width: '100%', padding: '8px 12px', border: 'none',
                      background: isActive ? colors.bgHover : 'transparent',
                      color: colors.text, textAlign: 'right', cursor: 'pointer',
                      fontSize: '0.82rem', fontFamily: 'inherit',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: `1px solid ${colors.borderLight}`,
                    }}
                  >
                    <span>
                      <span style={{ color: colors.accent, fontWeight: 600, marginLeft: '4px' }}>
                        <Highlight text={r.brand} query={searchQuery} accentColor={colors.accent} />
                      </span>
                      <Highlight text={r.model} query={searchQuery} accentColor={colors.accent} />
                    </span>
                    {r.score >= 80 && (
                      <span style={{
                        color: colors.success, fontSize: '0.6rem',
                        padding: '2px 6px', borderRadius: '4px',
                        background: colors.successBg,
                      }}>
                        مطابق
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {showFavorites && searchQuery.length === 0 && (
        <div>
          {(favorites.length > 0 || mostUsed.length > 0) && (
            <div style={{ marginTop: '12px' }}>
              {favorites.length > 0 && (
                <>
                  <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '6px' }}>⌛ آخر الهواتف</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {favorites.map((f, i) => (
                      <button key={i} onClick={() => onFavoriteSelect(f.brand, f.model)} style={{
                        padding: '5px 12px', borderRadius: '6px', border: `1px solid ${colors.borderLight}`,
                        background: colors.bgInput, color: colors.text, cursor: 'pointer',
                        fontSize: '0.72rem', fontFamily: 'inherit',
                      }}>
                        {f.brand} {f.model}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {mostUsed.length > 0 && favorites.length === 0 && (
                <>
                  <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '6px', marginTop: '8px' }}>🔥 الأكثر استخداماً</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {mostUsed.slice(0, 10).map((f, i) => (
                      <button key={i} onClick={() => onFavoriteSelect(f.brand, f.model)} style={{
                        padding: '5px 12px', borderRadius: '6px', border: `1px solid ${colors.borderLight}`,
                        background: colors.bgInput, color: colors.text, cursor: 'pointer',
                        fontSize: '0.72rem', fontFamily: 'inherit',
                      }}>
                        {f.brand} {f.model}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(CatalogStepSearch);
