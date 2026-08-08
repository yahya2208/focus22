import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PhoneShowroom } from '../../components/showroom/PhoneShowroom';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import type { InventoryRecord } from '../../services/inventory-service';

function makeDevice(overrides: Partial<InventoryRecord> = {}): InventoryRecord {
  return {
    id: 'd1',
    modelId: 'apple-iphone-13',
    brand: 'Apple',
    model: 'iPhone 13',
    variant: '128GB',
    ram: '4GB',
    storage: '128GB',
    condition: 'New',
    quantity: 3,
    sellPrice: 98000,
    city: 'الجزائر',
    images: ['img-1.png', 'img-2.png'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalPurchased: 0,
    totalSold: 0,
    ...overrides,
  };
}

function renderGrid(devices: InventoryRecord[], onSelect: (d: InventoryRecord) => void) {
  return render(
    <ThemeProvider>
      <TranslationProvider>
        <PhoneShowroom devices={devices} onSelect={onSelect} emptyText="لا توجد أجهزة" />
      </TranslationProvider>
    </ThemeProvider>,
  );
}

describe('Phase 3B §3.1/§3.2 — PhoneShowroom card', () => {
  it('card shows name, price, condition badge, city, multi-image icon; image fills the card', () => {
    const device = makeDevice();
    renderGrid([device], () => {});
    const card = screen.getByRole('button', { name: /Apple iPhone 13/ });
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Apple');
    expect(card.textContent).toContain('iPhone 13');
    expect(card.textContent).toContain('98,000 د.ج');
    expect(card.textContent).toContain('New'); // condition badge
    expect(card.textContent).toContain('الجزائر');
    expect(card.textContent).toContain('2 📷'); // multi-image indicator
    expect(card.querySelector('img')).toBeTruthy(); // image fills the card
  });

  it('tap always fires onSelect with the device (gallery-only tap removed)', () => {
    const device = makeDevice();
    const onSelect = vi.fn();
    renderGrid([device], onSelect);
    fireEvent.click(screen.getByRole('button', { name: /Apple iPhone 13/ }));
    expect(onSelect).toHaveBeenCalledWith(device);
  });

  it('used condition renders the Used badge', () => {
    renderGrid([makeDevice({ condition: 'Used' })], () => {});
    const card = screen.getByRole('button', { name: /Apple iPhone 13/ });
    expect(card.textContent).toContain('Used');
    expect(card.textContent).not.toContain('New');
  });

  it('shows the empty state when there are no devices', () => {
    renderGrid([], () => {});
    expect(screen.getByText('لا توجد أجهزة')).toBeTruthy();
  });
});
