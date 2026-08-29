import { memo } from 'react';
import type { ThemeColors } from '../../../hooks/useThemeColors';
import {
  ensureAdminListingPresenters,
  getRequiredListingPresenter,
  isCarListing,
  isPropertyListing,
  listingLabel,
  type ListingRecord,
} from '../../../domains/listings';

ensureAdminListingPresenters();

interface ListingRowProps {
  record: ListingRecord;
  colors: ThemeColors;
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}

const STATUS_AR: Record<string, string> = {
  in_stock: 'متاح',
  low_stock: 'متاح',
  out_of_stock: 'غير متاح',
  archived: 'مخفي',
  discontinued: 'موقوف',
};

export const ListingRow = memo(function ListingRow({ record, colors, busy = false, onEdit, onDelete, onTogglePublish }: ListingRowProps) {
  const presenter = getRequiredListingPresenter(record.category);
  const card = presenter.card(record);
  const specs = isCarListing(record) || isPropertyListing(record) ? presenter.specRows(record) : [];
  const detailsMissing =
    (record.category === 'car' && !record.car) ||
    (record.category === 'property' && !record.propertyDetails);

  const disabled = { opacity: 0.55, cursor: 'wait' } as const;
  const priceText =
    record.price.amount != null
      ? `${record.price.amount.toLocaleString('en-US')} د.ج${record.price.period === 'monthly' ? ' / شهر' : ''}`
      : 'بلا سعر';

  return (
    <div style={{
      background: colors.bgCard,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '8px 12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '8px',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            background: record.category === 'car' ? colors.accentLight : colors.infoBg,
            color: record.category === 'car' ? colors.accent : colors.info,
            fontSize: '0.58rem',
            padding: '1px 7px',
            borderRadius: '999px',
          }}>
            {record.category === 'car' ? 'سيارة' : 'عقار'}
          </span>
          <div style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 600 }}>{card.title}</div>
        </div>
        {card.subtitle !== '' && (
          <div style={{ color: colors.textMuted, fontSize: '0.7rem', marginTop: '2px' }}>{card.subtitle}</div>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '3px' }}>
          {card.chips.map((chip) => (
            <span key={chip.labelKey} style={{ color: colors.textMuted, fontSize: '0.65rem' }}>
              {listingLabel(chip.labelKey)}: {chip.value}
            </span>
          ))}
        </div>
        {!detailsMissing && specs.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '3px' }}>
            {specs.slice(0, 5).map((row) => (
              <span key={row.labelKey} style={{ color: colors.textMuted, fontSize: '0.62rem' }}>
                {listingLabel(row.labelKey)}: {row.value}
              </span>
            ))}
          </div>
        )}
        {detailsMissing && (
          <div style={{ color: colors.warning, fontSize: '0.65rem', marginTop: '3px' }}>
            بيانات التفاصيل مفقودة — لا يُعرض كإعلان صالح
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <span style={{ color: colors.text, fontSize: '0.75rem', fontWeight: 600 }}>{priceText}</span>
          {record.city && <span style={{ color: colors.textMuted, fontSize: '0.68rem' }}>{record.city}</span>}
          <span style={{ color: STATUS_AR[record.status] ? colors.textMuted : colors.danger, fontSize: '0.68rem' }}>
            {STATUS_AR[record.status] ?? record.status}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <button onClick={onEdit} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: colors.infoBg, color: colors.info, fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>تعديل</button>
        <button onClick={onTogglePublish} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: record.isPublished ? colors.successBg : colors.bgInput,
          color: record.isPublished ? colors.success : colors.textMuted, fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>{record.isPublished ? 'منشور' : 'نشر'}</button>
        <button onClick={onDelete} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: '#e74c3c20', color: '#e74c3c', fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>حذف</button>
      </div>
    </div>
  );
});
