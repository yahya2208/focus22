import { memo, useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { listingImageUrl } from '../../../services/listing-service';
import { listingLabel, produceUnitLabel } from '../../../domains/listings';
import type { PublicListingCardModel } from '../../../domains/listings';

export interface PublicListingCardProps {
  model: PublicListingCardModel;
  onSelect: (deepLink: string) => void;
}

/**
 * P8.5 public card for car/property listings. Presentation semantics
 * (title/subtitle/chips) come from the category presenter via
 * `toPublicCardModel`; this component only renders the neutral shape.
 * Image fallback follows the existing phone-card convention: an emoji
 * placeholder div instead of a broken/empty <img>.
 */
export const PublicListingCard = memo(function PublicListingCard({
  model,
  onSelect,
}: PublicListingCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const coverUrl = model.image ? listingImageUrl(model.image) : '';
  // P8.6: a dead cover URL must degrade to the emoji placeholder, never a
  // broken <img>. Tracked per-URL so a re-fetched cover retries the image.
  const [failedSrc, setFailedSrc] = useState('');
  const showCover = coverUrl !== '' && failedSrc !== coverUrl;

  const categoryLabelKey = model.category === 'car'
    ? 'showroom.catCars'
    : model.category === 'property'
      ? 'showroom.catProperties'
      : 'showroom.catProduce';

  const unitSuffix =
    model.unit != null
      ? ` / ${produceUnitLabel(model.unit)}`
      : model.pricePeriod === 'monthly'
        ? ' / شهر'
        : '';

  return (
    <button
      type="button"
      onClick={() => onSelect(model.deepLink)}
      style={{
        textAlign: 'start',
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px',
        padding: '0.6rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        width: '100%',
      }}
      aria-label={model.title}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          borderRadius: '12px',
          overflow: 'hidden',
          background: colors.glass,
        }}
      >
        {showCover ? (
          <img
            src={coverUrl}
            alt={model.title}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(coverUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            role="img"
            aria-label={model.title}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.2rem',
            }}
          >
            {model.category === 'car' ? '🚗' : model.category === 'produce' ? '🥦' : '🏠'}
          </div>
        )}
        <span
          style={{
            position: 'absolute',
            top: '0.45rem',
            insetInlineStart: '0.45rem',
            background: 'rgba(16,16,28,0.85)',
            color: '#fff',
            fontSize: '0.62rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '999px',
          }}
        >
          {t(categoryLabelKey as never)}
        </span>
      </div>

      <div>
        <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.85rem' }}>{model.title}</div>
        {model.subtitle !== '' && (
          <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginTop: '1px' }}>
            {model.subtitle}
          </div>
        )}
      </div>

      {model.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {model.chips.map((chip) => (
            <span
              key={`${chip.labelKey}:${chip.value}`}
              style={{
                background: colors.glass,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                fontSize: '0.64rem',
                padding: '1px 7px',
                borderRadius: '999px',
              }}
            >
              {chip.value}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.4rem',
        }}
      >
        {model.price != null ? (
          <span style={{ color: colors.accent, fontWeight: 800, fontSize: '0.9rem' }}>
            {model.price.toLocaleString('en-US')} د.ج{unitSuffix}
          </span>
        ) : (
          <span style={{ color: colors.textMuted, fontWeight: 700, fontSize: '0.78rem' }}>
            {listingLabel(
              model.pricePeriod === 'monthly'
                ? 'listings.price.monthly'
                : 'listings.price.sale',
            )}
          </span>
        )}
        {model.city && (
          <span style={{ color: colors.textMuted, fontSize: '0.66rem' }}>📍 {model.city}</span>
        )}
      </div>
    </button>
  );
});
