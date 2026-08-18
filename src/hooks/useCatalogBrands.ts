import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../core/supabase/client';

export interface CatalogBrand {
  id: string;
  slug: string;
  display_name: string;
  aliases: string[];
  created_at: string;
}

let _cachedBrands: CatalogBrand[] | null = null;

export function useCatalogBrands() {
  const [brands, setBrands] = useState<CatalogBrand[]>(_cachedBrands ?? []);
  const [loading, setLoading] = useState(!_cachedBrands);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('catalog_list_brands');
    if (!error && data) {
      _cachedBrands = data;
      setBrands(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addBrand = useCallback(async (displayName: string, aliases: string[] = []) => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('catalog_add_brand', {
      p_display_name: displayName,
      p_aliases: aliases,
    });
    if (error) throw error;
    _cachedBrands = null;
    await load();
    return data as CatalogBrand;
  }, [load]);

  const refresh = useCallback(async () => {
    _cachedBrands = null;
    await load();
  }, [load]);

  return { brands, loading, addBrand, refresh };
}
