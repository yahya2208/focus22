/**
 * Marketplace Request Cart — product selection only. FOCUS never sells/pays
 * in-app: the cart collects lines (keyed by `catalogRef` = inventory_items.id)
 * and the terminal step sends ONE organized WhatsApp request card to the
 * business number. `displayUnitPrice` is display-only — final price is agreed
 * over WhatsApp, never computed as a confirmed total in the app.
 *
 * Property MONTHLY rentals never enter the cart (they are lead/contact-only);
 * only `sale` listings are cart-able here.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type CartDomain = 'phone' | 'car' | 'property' | 'produce';
export type CartPricePeriod = 'sale' | 'monthly';

export interface CartLine {
  /** Stable unique line key = catalogRef (one line per inventory item). */
  readonly key: string;
  /** inventory_items.id — the authoritative product identity. */
  readonly catalogRef: string;
  readonly categoryId?: string;
  readonly domain: CartDomain;
  readonly category: 'phone' | 'car' | 'property' | 'produce';
  readonly brand: string;
  readonly model: string;
  /** DISPLAY ONLY — never used to compute order totals. */
  readonly displayUnitPrice: number | null;
  readonly quantity: number;
  /** Phones: real stock; cars pinned to 1; produce: whole units in stock. */
  readonly stock: number;
  readonly unit?: 'piece' | 'kg' | 'g' | 'liter' | 'dozen' | 'bag';
  readonly image?: string;
  readonly pricePeriod: CartPricePeriod;
}

export interface CartLineInput {
  catalogRef: string;
  categoryId?: string;
  domain: CartDomain;
  category: 'phone' | 'car' | 'property' | 'produce';
  brand: string;
  model: string;
  displayUnitPrice: number | null;
  stock?: number;
  unit?: 'piece' | 'kg' | 'g' | 'liter' | 'dozen' | 'bag';
  image?: string;
  pricePeriod?: CartPricePeriod;
  quantity?: number;
}

interface CartContextValue {
  lines: readonly CartLine[];
  itemCount: number;
  subtotal: number;
  isEmpty: boolean;
  getLine: (catalogRef: string) => CartLine | undefined;
  addLine: (input: CartLineInput) => void;
  setQuantity: (catalogRef: string, quantity: number) => void;
  removeLine: (catalogRef: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const clampQty = (q: number, stock: number): number =>
  Math.max(1, Math.min(Math.floor(q), Math.max(1, stock)));

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<readonly CartLine[]>([]);

  const addLine = useCallback((input: CartLineInput) => {
    const stock = Math.max(1, input.stock ?? 1);
    const quantity = clampQty(input.quantity ?? 1, stock);
    const line: CartLine = {
      key: input.catalogRef,
      catalogRef: input.catalogRef,
      categoryId: input.categoryId,
      domain: input.domain,
      category: input.category,
      brand: input.brand,
      model: input.model,
      displayUnitPrice: input.displayUnitPrice,
      quantity,
      stock,
      unit: input.unit,
      image: input.image,
      pricePeriod: input.pricePeriod ?? 'sale',
    };
    setLines((prev) => {
      const existing = prev.find((l) => l.key === line.key);
      if (existing) {
        return prev.map((l) =>
          l.key === line.key
            ? { ...l, quantity: clampQty(l.quantity + 1, stock), stock }
            : l,
        );
      }
      return [...prev, line];
    });
  }, []);

  const setQuantity = useCallback((catalogRef: string, quantity: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.catalogRef === catalogRef ? { ...l, quantity: clampQty(quantity, l.stock) } : l,
      ),
    );
  }, []);

  const removeLine = useCallback((catalogRef: string) => {
    setLines((prev) => prev.filter((l) => l.catalogRef !== catalogRef));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = lines.reduce(
      (sum, l) => sum + (l.displayUnitPrice ?? 0) * l.quantity,
      0,
    );
    return {
      lines,
      itemCount,
      subtotal,
      isEmpty: lines.length === 0,
      getLine: (catalogRef) => lines.find((l) => l.catalogRef === catalogRef),
      addLine,
      setQuantity,
      removeLine,
      clear,
    };
  }, [lines, addLine, setQuantity, removeLine, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export default CartProvider;
