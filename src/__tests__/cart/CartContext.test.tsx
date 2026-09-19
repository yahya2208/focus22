import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

const phone: CartLineInput = {
  catalogRef: 'd1',
  categoryId: 'm1',
  domain: 'phone',
  category: 'phone',
  brand: 'Samsung',
  model: 'Galaxy S23',
  displayUnitPrice: 1000,
  stock: 5,
};

const car: CartLineInput = {
  catalogRef: 'c1',
  domain: 'car',
  category: 'car',
  brand: 'Tesla Model 3',
  model: '2024',
  displayUnitPrice: 8000000,
  stock: 1,
};

const potatoesKg: CartLineInput = {
  catalogRef: 'p-kg',
  domain: 'produce',
  category: 'produce',
  brand: 'بطاطا',
  model: 'بيضاء',
  displayUnitPrice: 80,
  stock: 100,
  unit: 'kg',
};

const tomatoPiece: CartLineInput = {
  catalogRef: 'p-pc',
  domain: 'produce',
  category: 'produce',
  brand: 'طماطم',
  model: 'حبة',
  displayUnitPrice: 20,
  stock: 50,
  unit: 'piece',
};

describe('CartContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when used outside CartProvider', () => {
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within CartProvider');
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.itemCount).toBe(0);
    expect(result.current.subtotal).toBe(0);
  });

  it('adds a line and computes itemCount/subtotal', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine({ ...phone, quantity: 2 }));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.subtotal).toBe(2000);
    expect(result.current.getLine('d1')?.quantity).toBe(2);
  });

  it('clamps quantity to [1, stock]', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine({ ...phone, quantity: 99 }));
    expect(result.current.getLine('d1')?.quantity).toBe(5);
    act(() => result.current.setQuantity('d1', 0));
    expect(result.current.getLine('d1')?.quantity).toBe(1);
  });

  it('merges an existing catalogRef by incrementing (clamped)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine({ ...phone, quantity: 4 }));
    act(() => result.current.addLine({ ...phone, quantity: 1 }));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.getLine('d1')?.quantity).toBe(5);
  });

  it('supports multiple distinct lines (multi-item cart)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    act(() => result.current.addLine(car));
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.subtotal).toBe(1000 + 8000000);
  });

  it('car lines default to stock 1 regardless of requested quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine({ ...car, quantity: 9 }));
    expect(result.current.getLine('c1')?.stock).toBe(1);
    expect(result.current.getLine('c1')?.quantity).toBe(1);
  });

  it('setQuantity clamps to stock and removeLine deletes a line', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    act(() => result.current.setQuantity('d1', 9));
    expect(result.current.getLine('d1')?.quantity).toBe(5);
    act(() => result.current.removeLine('d1'));
    expect(result.current.isEmpty).toBe(true);
  });

  it('clear empties the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    act(() => result.current.addLine(car));
    act(() => result.current.clear());
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.itemCount).toBe(0);
    expect(result.current.lines).toHaveLength(0);
  });

  it('preserves catalogRef identity on merged lines (server-authoritative key)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    act(() => result.current.addLine(phone));
    const line = result.current.getLine('d1');
    expect(line?.catalogRef).toBe('d1');
    expect(line?.key).toBe('d1');
    expect(line?.categoryId).toBe('m1');
  });

  describe('GATE C1 — unit-aware quantities', () => {
    it('kg line keeps a decimal quantity (1.5)', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine({ ...potatoesKg, quantity: 1.5 }));
      expect(result.current.getLine('p-kg')?.quantity).toBe(1.5);
    });

    it('kg rounds extra precision to 3 places (5.3337 -> 5.334)', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine({ ...potatoesKg, quantity: 5.3337 }));
      expect(result.current.getLine('p-kg')?.quantity).toBe(5.334);
    });

    it('kg setQuantity accepts 2.25 and clamps to stock', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine(potatoesKg));
      act(() => result.current.setQuantity('p-kg', 2.25));
      expect(result.current.getLine('p-kg')?.quantity).toBe(2.25);
      act(() => result.current.setQuantity('p-kg', 999));
      expect(result.current.getLine('p-kg')?.quantity).toBe(100);
      act(() => result.current.setQuantity('p-kg', 0.1));
      expect(result.current.getLine('p-kg')?.quantity).toBe(0.5);
    });

    it('merging a kg line steps by 0.5', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine({ ...potatoesKg, quantity: 1 }));
      act(() => result.current.addLine(potatoesKg));
      expect(result.current.getLine('p-kg')?.quantity).toBe(1.5);
    });

    it('piece line stays whole: 1.5 floors to 1', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine({ ...tomatoPiece, quantity: 1.5 }));
      expect(result.current.getLine('p-pc')?.quantity).toBe(1);
    });

    it('kg subtotal uses the decimal quantity (display-only estimate)', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine({ ...potatoesKg, quantity: 2.5 }));
      expect(result.current.subtotal).toBe(200);
    });

    it('kg stock below 1 is not inflated (0.6 stays 0.6)', () => {
      const { result } = renderHook(() => useCart(), { wrapper });
      act(() => result.current.addLine({ ...potatoesKg, stock: 0.6, quantity: 5 }));
      expect(result.current.getLine('p-kg')?.stock).toBe(0.6);
      expect(result.current.getLine('p-kg')?.quantity).toBe(0.6);
    });
  });
});
