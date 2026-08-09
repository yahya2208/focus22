import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ContactOwnerAction } from '../../components/showroom/ContactOwnerAction';
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

function renderAction() {
  const onContact = vi.fn();
  const view = render(
    <ThemeProvider>
      <TranslationProvider>
        <ContactOwnerAction device={DEVICE} onContact={onContact} />
      </TranslationProvider>
    </ThemeProvider>,
  );
  return { onContact, container: view.container };
}

afterEach(() => {
  cleanup();
});

describe('ContactOwnerAction — BATCH 3 (single contact CTA, mediator only)', () => {
  it('renders exactly ONE contact CTA with data-action evidence', () => {
    renderAction();
    const button = screen.getByRole('button', { name: /Contact the ad owner/i });
    expect(button.getAttribute('data-action')).toBe('contact-owner');
    expect(screen.getAllByRole('button').length).toBe(1);
  });

  it('has NO buy / exchange / installment / inquiry / sell buttons', () => {
    renderAction();
    expect(screen.queryByRole('button', { name: /Buy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exchange/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Installment/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Inquiry/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sell/i })).toBeNull();
  });

  it('shows the WhatsApp redirect note and the FOCUS mediator statement', () => {
    renderAction();
    expect(screen.getByText(/redirected to WhatsApp/i)).toBeTruthy();
    expect(screen.getByText(/intermediary only/i)).toBeTruthy();
    expect(screen.getByText(/no buying or payments/i)).toBeTruthy();
  });

  it('exposes exactly one focusable target (the contact button)', () => {
    const { container } = renderAction();
    const interactive = container.querySelectorAll('a, button, [role="link"], [tabindex]:not([tabindex="-1"])');
    expect(interactive.length).toBe(1);
    expect(interactive[0]!.tagName).toBe('BUTTON');
  });

  it('forwards the contact intent to onContact', () => {
    const { onContact } = renderAction();
    fireEvent.click(screen.getByRole('button', { name: /Contact the ad owner/i }));
    expect(onContact).toHaveBeenCalledTimes(1);
  });
});
