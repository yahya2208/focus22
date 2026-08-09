import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ThemeColors } from '../hooks/useThemeColors';
import { ThemeProvider } from '../design-system/use-theme';
import { AddInventoryModal } from '../components/inventory/AddInventoryModal';
import { CustomerPhoneFlow } from '../screens/phone-services/CustomerPhoneFlow';

/**
 * S3 Acceptance Gate — UI forwarding:
 * عند توفر العلامة في الواجهة (state/result)، يجب تمريرها إلى VariantSelector.
 * التغطية: AddInventoryModal، CustomerPhoneFlow.
 *
 * الوضع الحالي (قبل تنفيذ S3): العلامة متاحة لكنها لا تُمرَّر → البوابة حمراء.
 */

const mock = vi.hoisted(() => ({
  addStock: vi.fn(() => ({ id: 'rec-9' })),
  updateImages: vi.fn(() => ({})),
  getExchangeableDevices: vi.fn(() => []),
  lastVariantProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('../components/catalog/VariantSelector', () => ({
  VariantSelector: (props: Record<string, unknown>) => {
    mock.lastVariantProps.current = props;
    return null;
  },
}));

vi.mock('../components/catalog/CatalogAutocomplete', () => ({
  CatalogAutocomplete: ({ onSelect }: { onSelect: (r: { brand: string; model: string; normalized: string; score: number }) => void }) => (
    <button type="button" onClick={() => onSelect({ brand: 'Vivo', model: 'X50', normalized: 'x50', score: 100 })}>
      mock-autocomplete
    </button>
  ),
}));

vi.mock('../components/showroom/PhoneImageUploader', () => ({
  PhoneImageUploader: () => null,
}));

vi.mock('../services/inventory-service', () => ({
  InventoryService: {
    addStock: mock.addStock,
    updateImages: mock.updateImages,
    getExchangeableDevices: mock.getExchangeableDevices,
  },
}));

vi.mock('../core/analytics/tracker', () => ({
  trackPhoneServiceOpened: vi.fn(),
  trackDeviceSelected: vi.fn(),
  trackBuyFlowStarted: vi.fn(),
  trackSellFlowStarted: vi.fn(),
  trackExchangeFlowStarted: vi.fn(),
}));

vi.mock('../services/whatsapp-service', () => ({
  WHATSAPP_PHONE: '+213556254007',
  buildWhatsAppForActionMessage: vi.fn(() => ''),
  buildModelNotFoundMessage: vi.fn(() => ''),
  openModelNotFoundRequest: vi.fn(),
  openWhatsAppForAction: vi.fn(),
  openPhoneAdWhatsApp: vi.fn(),
}));

vi.mock('../providers/WhatsAppProvider', () => ({
  WhatsAppProvider: ({ children }: { children: React.ReactNode }) => children,
  useWhatsApp: () => ({
    send: vi.fn(),
    modal: null,
    retryOpen: vi.fn(),
    copyMessage: vi.fn(async () => true),
    closeModal: vi.fn(),
  }),
}));

vi.mock('../components/ads/AdSpot', () => ({
  AdSpot: () => null,
}));

function mockColors(): ThemeColors {
  return {
    bg: '', bgCard: '', bgInput: '', bgHover: '', border: '', borderLight: '',
    text: '', textSecondary: '', textMuted: '', textFaint: '', accent: '', accentLight: '',
    accentGlow: '', success: '', successBg: '', successText: '', danger: '', dangerBg: '',
    dangerText: '', warning: '', warningBg: '', warningText: '', info: '', infoBg: '',
    infoText: '', progressBg: '', shadow: '', glass: '', glassBorder: '', gradient: '',
  } as ThemeColors;
}

afterEach(() => {
  cleanup();
});

describe('S3 Acceptance Gate: UI must forward brand to VariantSelector', () => {
  beforeEach(() => {
    mock.lastVariantProps.current = null;
  });

  it('R5: AddInventoryModal forwards the selected brand to VariantSelector', () => {
    render(
      <ThemeProvider>
        <AddInventoryModal colors={mockColors()} onDone={vi.fn()} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));

    expect(mock.lastVariantProps.current).toEqual(
      expect.objectContaining({ brand: 'Vivo', modelName: 'X50' }),
    );
  });

  it('R6: CustomerPhoneFlow forwards the selected brand to VariantSelector', () => {
    render(
      <ThemeProvider>
        <CustomerPhoneFlow />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));

    expect(mock.lastVariantProps.current).toEqual(
      expect.objectContaining({ brand: 'Vivo', modelName: 'X50' }),
    );
  });
});
