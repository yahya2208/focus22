import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderReceiptCard } from '../../../screens/pilot/family/OrderReceiptCard';
import { DeliveryProfileCard } from '../../../screens/pilot/family/DeliveryProfileCard';

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

describe('OrderReceiptCard', () => {
  it('renders human quantities, line totals and the total row', () => {
    render(
      <OrderReceiptCard
        lines={[
          { name: 'طماطم', quantityText: '1.5 كغ', lineTotal: 180 },
          { name: 'بطاطا', quantityText: '2 كغ', lineTotal: 180 },
        ]}
        subtotal={360}
        deliveryFee={0}
        total={360}
        currency="دج"
      />,
    );
    expect(screen.getByText('طماطم')).toBeTruthy();
    expect(screen.getByText('1.5 كغ')).toBeTruthy();
    expect(screen.getByText('2 كغ')).toBeTruthy();
    expect(screen.queryByText('1.500')).toBeNull();
    expect(screen.queryByText(/quantity:/i)).toBeNull();
    expect(screen.getByText('pilot.orderTotal')).toBeTruthy();
  });
});

describe('DeliveryProfileCard', () => {
  const contact = {
    family_id: 'f1',
    contact_name: 'أحمد',
    contact_phone: '0555',
    contact_address: 'شارع 12',
    contact_notes: '',
  };

  it('displays saved contact with icons and an edit affordance', () => {
    render(<DeliveryProfileCard contact={contact} saving={false} onSave={vi.fn()} />);
    expect(screen.getByText('أحمد')).toBeTruthy();
    expect(screen.getByText('0555')).toBeTruthy();
    expect(screen.getByText('pilot.editInfo')).toBeTruthy();
  });

  it('edits and saves through the provided callback', async () => {
    const onSave = vi.fn(async () => {});
    render(<DeliveryProfileCard contact={contact} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByText('pilot.editInfo'));
    fireEvent.change(screen.getByLabelText('pilot.phone'), { target: { value: '0666' } });
    fireEvent.click(screen.getByText('pilot.saveInfo'));

    expect(onSave).toHaveBeenCalledWith({
      name: 'أحمد',
      phone: '0666',
      address: 'شارع 12',
      notes: '',
    });
  });
});
