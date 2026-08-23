import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { VariantSelector } from '../../components/catalog/VariantSelector';
import CatalogStepVariant from '../../components/catalog/CatalogStepVariant';
import { getVariantsForModel } from '../../data/phone-variants';
import { CustomerPhoneFlow } from '../../screens/phone-services/CustomerPhoneFlow';

/**
 * اختصار للقاعدة: الموديلات بدون نسخ حقيقية يجب ألا تُعرض لها نسخ مُخترَعة (heuristic).
 * الواجهة يجب أن تعرض الحالة الفارغة، وأن تتيح متابعة المسار بدون تحديد إصدار.
 */

const mock = vi.hoisted(() => ({
  selectResult: { brand: 'Apple', model: 'iPhone SE (2016)', normalized: 'iphone se 2016', score: 100 },
  addStock: vi.fn(() => ({ id: 'rec-empty' })),
  updateImages: vi.fn(() => ({})),
  getExchangeableDevices: vi.fn(() => []),
}));

vi.mock('../../components/catalog/CatalogCascadeSelector', () => ({
  CatalogCascadeSelector: ({ onChange }: { onChange: (id: { brandName?: string; modelName?: string }) => void }) => (
    <button
      type="button"
      onClick={() => onChange({ brandName: mock.selectResult.brand, modelName: mock.selectResult.model })}
    >
      mock-cascade
    </button>
  ),
}));

vi.mock('../../services/whatsapp-service', () => ({
  WHATSAPP_PHONE: '+213556254007',
  buildWhatsAppForActionMessage: vi.fn(() => ''),
  buildModelNotFoundMessage: vi.fn(() => ''),
  openModelNotFoundRequest: vi.fn(),
  openWhatsAppForAction: vi.fn(),
  openPhoneAdWhatsApp: vi.fn(),
}));

vi.mock('../../providers/WhatsAppProvider', () => ({
  WhatsAppProvider: ({ children }: { children: React.ReactNode }) => children,
  useWhatsApp: () => ({
    send: vi.fn(),
    modal: null,
    retryOpen: vi.fn(),
    copyMessage: vi.fn(async () => true),
    closeModal: vi.fn(),
  }),
}));

vi.mock('../../services/inventory-service', () => ({
  InventoryService: {
    addStock: mock.addStock,
    updateImages: mock.updateImages,
    getExchangeableDevices: mock.getExchangeableDevices,
  },
}));

vi.mock('../../core/analytics/tracker', () => ({
  trackPhoneServiceOpened: vi.fn(),
  trackDeviceSelected: vi.fn(),
  trackBuyFlowStarted: vi.fn(),
  trackSellFlowStarted: vi.fn(),
  trackExchangeFlowStarted: vi.fn(),
}));

vi.mock('../../components/ad-contact/AdContactBanner', () => ({
  AdContactBanner: () => null,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(() => {
  mock.selectResult = { brand: 'Apple', model: 'iPhone SE (2016)', normalized: 'iphone se 2016', score: 100 };
});

afterEach(() => {
  cleanup();
});

describe('empty variant state: no fabricated configs, workflow continues without a variant', () => {
  it('getVariantsForModel returns [] (no heuristic fallback) for a model with no real variants', () => {
    expect(getVariantsForModel('iPhone SE (2016)', 'apple')).toEqual([]);
    expect(getVariantsForModel('iPhone SE (2016)', 'apple').map(v => v.label)).not.toContain('4/64');
  });

  it('VariantSelector renders the empty message for a model without variants, never 4/64', () => {
    renderWithTheme(
      <VariantSelector modelName="iPhone SE (2016)" brand="apple" onSelect={vi.fn()} />,
    );
    expect(screen.getByText('إصدارات RAM والتخزين غير متوفرة لهذا الموديل.')).toBeTruthy();
    expect(screen.queryByText('4/64')).toBeNull();
    expect(screen.queryByText('8/128')).toBeNull();
  });

  it('VariantSelector still renders the real variants for original models (incl. 4/64 where real)', () => {
    renderWithTheme(
      <VariantSelector modelName="Galaxy A14" brand="samsung" onSelect={vi.fn()} />,
    );
    expect(screen.getByText('4/64')).toBeTruthy();
    expect(screen.getByText('4/128')).toBeTruthy();
  });

  it('CatalogStepVariant offers "متابعة بدون تحديد إصدار" when currentVariants is empty and triggers onSkipVariant', () => {
    const onSkip = vi.fn();
    renderWithTheme(
      <CatalogStepVariant
        selectedBrand="Apple"
        selectedModel="iPhone SE (2016)"
        currentVariants={[]}
        selectedVariant={null}
        currentStock={[]}
        priceSummary={{}}
        onSelect={vi.fn()}
        onSkipVariant={onSkip}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('لا توجد نسخ مسجلة لهذا الموديل')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'متابعة بدون تحديد إصدار' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('CustomerPhoneFlow: model with no variants → skip → condition step shows "بدون تحديد إصدار"', () => {
    renderWithTheme(<CustomerPhoneFlow />);
    fireEvent.click(screen.getByRole('button', { name: 'mock-cascade' }));

    expect(screen.getByText('متابعة بدون تحديد إصدار')).toBeTruthy();
    expect(screen.queryByText('4/64')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'متابعة بدون تحديد إصدار' }));

    expect(screen.getByText('حالة الجهاز')).toBeTruthy();
    expect(screen.getByText(/بدون تحديد إصدار/)).toBeTruthy();
  });

  it('CustomerPhoneFlow: model WITH real variants still shows them on the variant step', () => {
    mock.selectResult = { brand: 'Samsung', model: 'Galaxy A14', normalized: 'galaxy a14', score: 100 };
    renderWithTheme(<CustomerPhoneFlow />);
    fireEvent.click(screen.getByRole('button', { name: 'mock-cascade' }));

    expect(screen.getByRole('button', { name: /4\/64/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /4\/128/ })).toBeTruthy();
  });
});
