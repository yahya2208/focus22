import { describe, it, expect, afterEach } from 'vitest';
import {
  ensureAdminListingPresenters,
  getRequiredListingPresenter,
  isProduceListing,
  produceUnitLabel,
  formatProduceAmount,
  formatProduceUnitSuffix,
  toPublicCardModel,
  type ListingRecord,
} from '../../domains/listings';

function makeProduce(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: 'aaaaaaa1-1111-4111-8111-111111111111',
    category: 'produce',
    brand: 'مزرعة',
    model: 'طماطم',
    description: 'طازجة',
    color: '',
    city: 'ورقلة',
    warranty: '',
    code: 'P-01',
    price: { amount: 250, period: 'sale' },
    conditionGroup: null,
    quantity: 100,
    status: 'in_stock',
    isPublished: true,
    unit: 'kg',
    produce: { origin: 'م’سيلة', grade: 'A' },
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('produce domain presenter', () => {
  afterEach(() => {
    // no-op: keep admin presenters registered; file-scoped reads are idempotent
  });

  it('is classified as produce', () => {
    expect(isProduceListing(makeProduce())).toBe(true);
  });

  it('renders the unit-based card title/subtitle/chips', () => {
    ensureAdminListingPresenters();
    const presenter = getRequiredListingPresenter('produce');
    const card = presenter.card(makeProduce());
    expect(card.title).toBe('طماطم');
    expect(card.subtitle).toContain('كغ');
    expect(card.priceLabelKey).toBe('listings.price.sale');
  });

  it('renders spec rows for unit, origin and grade', () => {
    ensureAdminListingPresenters();
    const presenter = getRequiredListingPresenter('produce');
    const rows = presenter.specRows(makeProduce());
    const labels = rows.map((r) => r.labelKey);
    expect(labels).toContain('listings.produce.unit');
    expect(labels).toContain('listings.produce.origin');
    expect(labels).toContain('listings.produce.grade');

    const unitRow = rows.find((r) => r.labelKey === 'listings.produce.unit')!;
    expect(unitRow.value).toBe(produceUnitLabel('kg'));
  });

  it('omits blank origin/grade from chips and spec rows', () => {
    ensureAdminListingPresenters();
    const presenter = getRequiredListingPresenter('produce');
    const blank = makeProduce({ produce: { origin: '', grade: '' } });
    expect(presenter.card(blank).chips).toHaveLength(0);
    // The unit row remains (it reflects the pricing unit), but no origin/grade rows.
    const labels = presenter.specRows(blank).map((r) => r.labelKey);
    expect(labels).toContain('listings.produce.unit');
    expect(labels).not.toContain('listings.produce.origin');
    expect(labels).not.toContain('listings.produce.grade');
  });

  it('formats contact with a unit-suffixed price text', () => {
    ensureAdminListingPresenters();
    const presenter = getRequiredListingPresenter('produce');
    const record = makeProduce();
    const info = presenter.contact(record, '#/listing-details?id=x');
    expect(info.name).toBe('طماطم');
    expect(info.priceText).toContain('كغ');
  });

  it('produces a public card model with the pricing unit', () => {
    ensureAdminListingPresenters();
    const model = toPublicCardModel(makeProduce());
    expect(model.category).toBe('produce');
    expect(model.unit).toBe('kg');
    expect(model.price).toBe(250);
    expect(model.pricePeriod).toBe('sale');
  });

  it('maps every unit to a stable Arabic label and suffix', () => {
    expect(formatProduceAmount(250)).toContain('250');
    expect(formatProduceUnitSuffix('kg')).toBe('د.ج/كغ');
    expect(formatProduceUnitSuffix(null)).toBe('د.ج');
    for (const unit of ['piece', 'kg', 'g', 'liter', 'dozen', 'bag'] as const) {
      expect(produceUnitLabel(unit).trim()).not.toBe('');
    }
  });
});
