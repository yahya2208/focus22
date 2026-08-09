import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ProductActionBar } from '../../components/showroom/ProductActionBar';
import type { PhoneActionId } from '../../services/whatsapp-service';
import type { InventoryRecord } from '../../services/inventory-service';

const DEVICE: InventoryRecord = {
  id: 'rec_abcdef12',
  modelId: 'apple-iphone-13',
  brand: 'Apple',
  model: 'iPhone 13',
  variant: '128GB',
  ram: '4GB',
  storage: '128GB',
  condition: 'New',
  quantity: 1,
  sellPrice: 98000,
  city: 'الجزائر',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  totalPurchased: 1,
  totalSold: 0,
};

const ACTIONS: readonly PhoneActionId[] = ['buy', 'exchange', 'installment', 'inquiry'];

function renderBar() {
  const onSelect = vi.fn();
  render(
    <ThemeProvider>
      <TranslationProvider>
        <ProductActionBar actions={ACTIONS} device={DEVICE} onSelect={onSelect} />
      </TranslationProvider>
    </ThemeProvider>,
  );
  return { onSelect };
}

afterEach(() => {
  cleanup();
});

describe('ProductActionBar — CTA Option A (M1)', () => {
  it('renders exactly the 4 actions with data-action evidence', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /Buy/i }).getAttribute('data-action')).toBe('buy');
    expect(screen.getByRole('button', { name: /Exchange/i }).getAttribute('data-action')).toBe('exchange');
    expect(screen.getByRole('button', { name: /Installment/i }).getAttribute('data-action')).toBe('installment');
    expect(screen.getByRole('button', { name: /Inquiry/i }).getAttribute('data-action')).toBe('inquiry');
    expect(screen.queryByRole('button', { name: /Sell/i })).toBeNull();
  });

  it('uses contact-neutral icons (no cart / card graphics)', () => {
    renderBar();
    const html = document.body.textContent ?? '';
    expect(html).not.toContain('🛒');
    expect(html).not.toContain('💳');
  });

  it('shows the clarifying WhatsApp note under the actions', () => {
    renderBar();
    expect(screen.getByText(/WhatsApp/i)).toBeTruthy();
  });

  it('forwards the selected action to onSelect', () => {
    const { onSelect } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /Exchange/i }));
    expect(onSelect).toHaveBeenCalledWith('exchange');
  });
});
