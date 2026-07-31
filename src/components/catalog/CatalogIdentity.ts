import type { DeviceCondition } from '../../services/price-memory';

export interface PhoneIdentity {
  brandId: string;
  brandName: string;
  seriesId: string | null;
  seriesName: string | null;
  modelId: string;
  modelName: string;
  variantId: string | null;
  ram: string | null;
  storage: string | null;
  condition: DeviceCondition | null;
  operation: 'buy' | 'sell' | 'exchange' | 'trade_in' | null;
}

export interface CatalogCascadeProps {
  value: Partial<PhoneIdentity>;
  onChange: (identity: Partial<PhoneIdentity>) => void;
  allowSeries?: boolean;
  allowVariant?: boolean;
  allowCondition?: boolean;
  allowOperation?: boolean;
  showSearch?: boolean;
  showFavorites?: boolean;
  disabled?: boolean;
}
