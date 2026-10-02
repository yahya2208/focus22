import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStoreProducts,
  type Neighborhood,
  type PilotProduct,
  type Store,
} from '../../../../services/neighborhood-service';

export interface StoreWorkspaceOptions {
  /** Store currently selected by the host. This hook never changes it. */
  storeId: string;
  /** Store catalog owned by the host. Used to resolve identity only, never refetched. */
  stores: readonly Store[];
  /** Neighborhood catalog owned by the host. Used to resolve identity only, never refetched. */
  neighborhoods: readonly Neighborhood[];
}

export interface StoreWorkspace {
  /** Selected store, or null when none is selected or known. */
  readonly store: Store | null;
  /** Neighborhood of the selected store, or null when unknown. */
  readonly neighborhood: Neighborhood | null;
  /** Available (buyable) products for the selected store, in server order. */
  readonly products: readonly PilotProduct[];
  readonly productsLoading: boolean;
  /** Failure of the product read. Store/neighborhood identity resolves separately. */
  readonly productsError: string | null;
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly visibleProducts: readonly PilotProduct[];
  readonly productCount: number;
  /** Explicit retry only. Selection, search, and navigation never call it. */
  readonly refreshProducts: () => Promise<void>;
}

/**
 * Store domain workspace (G2.4).
 *
 * Owns Store-specific read state ONLY: the selected store/neighborhood
 * identity (derived from the host-owned catalogs) and the available-products
 * read for the selected store. It performs exactly one product fetch path —
 * the pre-existing `fetchStoreProducts` call moved here from the host triage
 * effect — so no duplicate catalog read is introduced.
 *
 * Read-only by construction. It never calls a store upsert, inventory link,
 * price/stock, publish, order, settlement, delivery, ledger, deposit, or
 * membership write. Finance, family, orders, and Store Ops state are untouched.
 *
 * Data rules:
 * - `unit` (`inventory_items.unit`) is the unit source of truth. The derived
 *   `sell_unit` display column is never read here.
 * - Price, quantity, category, and published status are displayed exactly as
 *   the server provided them. Nothing is recomputed or summed.
 * - `pilot_store_products` returns buyable rows only, so the UI must call the
 *   list "available" products, never a full inventory.
 */
export function useStoreWorkspace({ storeId, stores, neighborhoods }: StoreWorkspaceOptions): StoreWorkspace {
  const [products, setProducts] = useState<PilotProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const requestRef = useRef(0);

  const store = useMemo(() => stores.find((s) => s.id === storeId) ?? null, [stores, storeId]);
  const neighborhood = useMemo(
    () => (store ? (neighborhoods.find((n) => n.id === store.neighborhood_id) ?? null) : null),
    [store, neighborhoods],
  );

  const refreshProducts = useCallback(async () => {
    if (!storeId) {
      requestRef.current += 1;
      setProducts([]);
      setProductsError(null);
      setProductsLoading(false);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setProductsLoading(true);
    try {
      const rows = await fetchStoreProducts(storeId);
      if (requestRef.current !== request) return;
      setProducts(rows);
      setProductsError(null);
    } catch {
      if (requestRef.current !== request) return;
      // Keep the last known products: a failed read is reported, not hidden.
      setProductsError('PRODUCTS_UNAVAILABLE');
    } finally {
      if (requestRef.current === request) setProductsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  // Search is pure presentation over rows already in memory: changing it must
  // never issue a request.
  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.brand, p.model, p.variant, p.category].some((value) =>
        String(value ?? '').toLowerCase().includes(q),
      ),
    );
  }, [products, query]);

  return {
    store,
    neighborhood,
    products,
    productsLoading,
    productsError,
    query,
    setQuery,
    visibleProducts,
    productCount: products.length,
    refreshProducts,
  };
}
