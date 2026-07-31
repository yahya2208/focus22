import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { searchCatalog } from '../../services/catalog-service';
import { getVariantsForModel, formatVariant } from '../../data/phone-variants';
import type { CatalogCascadeProps } from './CatalogIdentity';
import { ARABIC_BRANDS, STEP_NAMES, getFavorites, getMostUsed, addFavorite, trackUsage, getStockForModel, getPriceSummary, StepIndicator, type CatalogSearchResult, type DeviceCondition } from './CatalogCascadeTypes';
import CatalogStepSearch from './CatalogStepSearch'; import CatalogStepBrand from './CatalogStepBrand'; import CatalogStepSeries from './CatalogStepSeries'; import CatalogStepModel from './CatalogStepModel'; import CatalogStepVariant from './CatalogStepVariant'; import CatalogStepCondition from './CatalogStepCondition'; import CatalogStepAction from './CatalogStepAction';

export function CatalogCascadeSelector({
  value, onChange, allowSeries = true, allowVariant = true,
  allowCondition = true, allowOperation = true,
  showSearch = true, showFavorites = true, disabled,
}: CatalogCascadeProps) {
  const colors = useThemeColors();
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogSearchResult[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(value.brandName || null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(value.seriesName || null);
  const [selectedModel, setSelectedModel] = useState<string | null>(value.modelName || null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(value.variantId || null);
  const [selectedCondition, setSelectedCondition] = useState<DeviceCondition | null>(value.condition || null);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(value.operation || null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const catalogData = useMemo(() => {
    try {
      const brands = JSON.parse(localStorage.getItem('catalog_brands_v1') || '[]') as { name: string; series: string[]; id: string }[];
      const models = JSON.parse(localStorage.getItem('catalog_models_v1') || '[]') as { brandName: string; seriesName: string | null; name: string; id: string }[];
      return { brands, models };
    } catch { return { brands: [], models: [] }; }
  }, []);

  const brandModels = useMemo(() => {
    const map: Record<string, { series: string[]; models: { name: string; id: string; series: string | null }[] }> = {};
    for (const m of catalogData.models) (map[m.brandName] ??= { series: [], models: [] }).models.push({ name: m.name, id: m.id, series: m.seriesName });
    for (const b of catalogData.brands) if (map[b.name]) map[b.name]!.series = b.series;
    return map;
  }, [catalogData]);

  const availableBrands = useMemo(() =>
    catalogData.brands.filter(b => (brandModels[b.name]?.models?.length ?? 0) > 0),
    [catalogData.brands, brandModels]
  );

  const currentSeries = useMemo(() => {
    if (!selectedBrand) return [];
    return brandModels[selectedBrand]?.series || [];
  }, [selectedBrand, brandModels]);

  const currentModels = useMemo(() => {
    if (!selectedBrand) return [];
    const all = brandModels[selectedBrand]?.models || [];
    if (selectedSeries) return all.filter(m => m.series === selectedSeries);
    return all;
  }, [selectedBrand, selectedSeries, brandModels]);

  const currentVariants = useMemo(() => {
    if (!selectedModel) return [];
    return getVariantsForModel(selectedModel);
  }, [selectedModel]);

  const currentStock = useMemo(() => {
    if (!value.modelId) return [];
    return getStockForModel(value.modelId);
  }, [value.modelId]);

  const priceSummary = useMemo(() => {
    if (!value.modelId) return {};
    return getPriceSummary(value.modelId);
  }, [value.modelId]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, CatalogSearchResult[]> = {};
    for (const r of searchResults) (groups[r.brand] ??= []).push(r);
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [searchResults]);

  useEffect(() => { setSearchIndex(0); }, [searchResults]);

  useEffect(() => {
    if (searchQuery.length >= 1) {
      let query = searchQuery;
      for (const [ar, en] of Object.entries(ARABIC_BRANDS)) {
        if (query.includes(ar)) { query = query.replace(ar, en); break; }
      }
      const r = searchCatalog(query, 20);
      setSearchResults(r);
      setShowSearchResults(true);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const favorites = useMemo(() => getFavorites().slice(0, 20), []);
  const mostUsed = useMemo(() => getMostUsed().slice(0, 50), []);

  const emitChange = useCallback((updates: Record<string, any>) => onChange({ ...value, ...updates }), [value, onChange]);

  const handleSearchSelect = (result: CatalogSearchResult) => {
    setSearchQuery(`${result.brand} ${result.model}`);
    setShowSearchResults(false);
    setSelectedBrand(result.brand);
    setSelectedModel(result.model);
    setStep(allowVariant ? 3 : 4);
    addFavorite(result.brand, result.model);
    trackUsage(result.brand, result.model);
    emitChange({ brandName: result.brand, modelName: result.model, brandId: '', modelId: '' });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    const total = searchResults.length;
    if (total === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIndex(i => (i + 1) % total); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIndex(i => (i - 1 + total) % total); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = searchResults[searchIndex]; if (r) handleSearchSelect(r); }
    else if (e.key === 'Escape') { setShowSearchResults(false); searchInputRef.current?.blur(); }
  };

  const handleBrandSelect = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedSeries(null);
    setSelectedModel(null);
    setSelectedVariant(null);
    setStep(currentSeries.length > 0 && allowSeries ? 1 : 2);
    addFavorite(brand, '');
    emitChange({ brandName: brand, brandId: '', seriesName: null, seriesId: null, modelName: null, modelId: null, variantId: null, ram: null, storage: null });
  };

  const handleSeriesSelect = (series: string) => {
    setSelectedSeries(series);
    setSelectedModel(null);
    setSelectedVariant(null);
    setStep(2);
    emitChange({ seriesName: series, seriesId: '', modelName: null, modelId: null, variantId: null, ram: null, storage: null });
  };

  const handleModelSelect = (model: { name: string; id: string }) => {
    setSelectedModel(model.name);
    setSelectedVariant(null);
    setStep(allowVariant ? 3 : 4);
    addFavorite(selectedBrand!, model.name);
    trackUsage(selectedBrand!, model.name);
    emitChange({ modelName: model.name, modelId: model.id, variantId: null, ram: null, storage: null });
  };

  const handleVariantSelect = (ram: string, storage: string) => {
    const label = formatVariant(ram, storage);
    setSelectedVariant(label);
    setStep(4);
    emitChange({ variantId: label, ram, storage });
  };

  const handleConditionSelect = (cond: DeviceCondition) => {
    setSelectedCondition(cond);
    setStep(5);
    emitChange({ condition: cond });
  };

  const handleOperationSelect = (op: string) => {
    setSelectedOperation(op);
    emitChange({ operation: op as any });
  };

  const stepNames = STEP_NAMES.filter((_, i) => !(i === 1 && !allowSeries && currentSeries.length === 0 || i === 2 && !allowSeries || i === 4 && !allowVariant || i === 5 && !allowCondition || i === 6 && !allowOperation));

  return (
    <div style={{ width: '100%', fontFamily: 'inherit' }}>
      {step === 0 && showSearch && (
        <CatalogStepSearch
          searchQuery={searchQuery} onSearchChange={setSearchQuery}
          onSearchFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
          onSearchKeyDown={handleSearchKeyDown} showSearchResults={showSearchResults}
          searchResults={searchResults} groupedResults={groupedResults}
          searchIndex={searchIndex} onSearchSelect={handleSearchSelect}
          onSearchHover={setSearchIndex} favorites={favorites}
          mostUsed={mostUsed} showFavorites={showFavorites}
          onFavoriteSelect={(brand, model) => { setSearchQuery(`${brand} ${model}`); setSelectedBrand(brand); setSelectedModel(model); setStep(allowVariant ? 3 : 4); }}
          onBrowseClick={() => setStep(1)} disabled={disabled}
          searchRef={searchRef} searchInputRef={searchInputRef} />
      )}

      {step >= 1 && <StepIndicator current={step - 1} stepNames={stepNames} />}

      {step === 1 && (
        <CatalogStepBrand
          availableBrands={availableBrands}
          selectedBrand={selectedBrand}
          onSelect={handleBrandSelect}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && allowSeries && currentSeries.length > 0 && (
        <CatalogStepSeries
          selectedBrand={selectedBrand}
          currentSeries={currentSeries}
          selectedSeries={selectedSeries}
          currentModelsCount={currentModels.length}
          onSelect={handleSeriesSelect}
          onShowAll={() => { setSelectedSeries(null); setStep(3); }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <CatalogStepModel
          selectedBrand={selectedBrand}
          selectedSeries={selectedSeries}
          currentModels={currentModels}
          selectedModel={selectedModel}
          onSelect={handleModelSelect}
          onBack={() => setStep(allowSeries && currentSeries.length > 0 ? 2 : 1)}
        />
      )}

      {step === 4 && allowVariant && (
        <CatalogStepVariant
          selectedBrand={selectedBrand}
          selectedModel={selectedModel}
          currentVariants={currentVariants}
          selectedVariant={selectedVariant}
          currentStock={currentStock}
          priceSummary={priceSummary}
          onSelect={handleVariantSelect}
          onBack={() => setStep(3)}
        />
      )}

      {step === 5 && allowCondition && (
        <CatalogStepCondition
          selectedCondition={selectedCondition}
          onSelect={handleConditionSelect}
          onBack={() => setStep(4)}
        />
      )}

      {step === 6 && allowOperation && (
        <CatalogStepAction
          selectedOperation={selectedOperation}
          onSelect={handleOperationSelect}
          onBack={() => setStep(5)}
        />
      )}

      {selectedModel && step >= 4 && (
        <div style={{
          marginTop: '8px', padding: '10px 14px', borderRadius: '8px',
          background: colors.successBg, border: `1px solid ${colors.success}20`,
          fontSize: '0.82rem', color: colors.text,
        }}>
          <div style={{ fontWeight: 600, color: colors.success, marginBottom: '4px' }}>
            ✅ {selectedBrand} {selectedModel}
            {selectedVariant && ` — ${selectedVariant}`}
          </div>
          {selectedCondition && <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>الحالة: {selectedCondition}</div>}
          {selectedOperation && <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>العملية: {selectedOperation === 'buy' ? 'شراء' : selectedOperation === 'sell' ? 'بيع' : 'استبدال'}</div>}
          <button onClick={() => { setStep(0); setSearchQuery(''); }} style={{
            marginTop: '6px', padding: '4px 10px', borderRadius: '4px',
            border: 'none', background: colors.bgInput, color: colors.textMuted,
            cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'inherit',
          }}>
            تغيير الهاتف
          </button>
        </div>
      )}
    </div>
  );
}
