import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Select } from '../../../design-system/components/Select';
import { Flex } from '../../../design-system/components/Flex';
import { GOLD, LUX_RADIUS } from './tokens';
import { formatDZD } from './KPIGrid';
import type { Store } from '../../../services/neighborhood-service';
import type { StoreWorkspace } from './hooks/useStoreWorkspace';

const card = (border: string, bgCard: string): React.CSSProperties => ({
  border: `1px solid ${border}`,
  borderRadius: LUX_RADIUS,
  padding: '1.1rem 1.2rem',
  background: bgCard,
  minWidth: 0,
});

const sectionTitle = (color: string): React.CSSProperties => ({
  color,
  fontSize: '0.78rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
});

const DASH = '—';

function formatServerMoney(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? formatDZD(amount) : DASH;
}

function formatServerQuantity(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? String(value) : DASH;
}

function textOrDash(value: unknown): string {
  if (value === null || value === undefined) return DASH;
  const text = String(value).trim();
  return text ? text : DASH;
}

function productName(brand: unknown, model: unknown, variant: unknown): string {
  const parts = [brand, model, variant].map((p) => String(p ?? '').trim()).filter((p) => p !== '');
  return parts.length > 0 ? parts.join(' · ') : DASH;
}

/**
 * Independent Store workspace (G2.4).
 *
 * Administrative and read-only by construction. It shows the selected store's
 * identity, status, neighborhood, and contact facts, plus the store's
 * available (buyable) products. It contains no store upsert, inventory link,
 * price/stock edit, publish, order, settlement, delivery, ledger, deposit, or
 * membership control.
 *
 * Data rules enforced here:
 * - Missing optional facts render "—". A missing value never becomes zero.
 * - `unit` is the unit source of truth; the derived `sell_unit` column is
 *   never read.
 * - Price, quantity, category, and published status are displayed exactly as
 *   the server provided them. Nothing is recomputed, summed, or relabeled.
 * - The product list is titled "available" because `pilot_store_products`
 *   returns buyable rows only — never a full inventory.
 */
export const AdminStore = memo(function AdminStore({
  workspace: w,
  stores,
  storeId,
  onStoreChange,
}: {
  workspace: StoreWorkspace;
  stores: readonly Store[];
  storeId: string;
  onStoreChange: (storeId: string) => void;
}) {
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const tk = (k: string) => t(k as TranslationKey);
  const storeName = (s: Store) => (locale === 'ar' && s.name_ar ? s.name_ar : s.name);

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>{tk('cc.navStore')}</h2>
        <p style={{ margin: '0.3rem 0 0', color: colors.textSecondary, fontSize: '0.85rem' }}>{tk('cc.stIntro')}</p>
      </div>

      <div style={card(colors.border, colors.bgCard)}>
        <div style={sectionTitle(GOLD)}>{tk('cc.stStoreLabel')}</div>
        {stores.length === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.noStores')}</span>
        ) : (
          <Select
            options={stores.map((s) => ({ value: s.id, label: storeName(s) }))}
            value={storeId}
            onChange={(e) => onStoreChange(e.target.value)}
            aria-label={tk('cc.stStoreLabel')}
          />
        )}
      </div>

      <div style={{ ...card(colors.border, colors.bgCard), marginTop: '1rem' }}>
        <div style={sectionTitle(GOLD)}>{tk('cc.stIdentityTitle')}</div>
        {!w.store ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.stNoStore')}</span>
        ) : (
          <>
            <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>
              {textOrDash(storeName(w.store))}
            </div>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('cc.stName')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{textOrDash(w.store.name)}</span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('cc.stNameAr')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{textOrDash(w.store.name_ar)}</span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('cc.stStatus')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700 }}>{textOrDash(w.store.status)}</span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('cc.stNeighborhood')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>
                {w.neighborhood ? textOrDash(locale === 'ar' && w.neighborhood.name_ar ? w.neighborhood.name_ar : w.neighborhood.name) : DASH}
              </span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('cc.stDescription')}</span>
              <span style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>{textOrDash(w.store.description)}</span>
            </Flex>
            <Flex justify="space-between" align="center">
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('cc.stContact')}</span>
              <span style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>{textOrDash(w.store.contact_phone)}</span>
            </Flex>
          </>
        )}
      </div>

      <div style={{ ...card(colors.border, colors.bgCard), marginTop: '1rem' }}>
        <div style={sectionTitle(GOLD)}>{tk('cc.stInventoryTitle')}</div>
        <div style={{ color: colors.textSecondary, fontSize: '0.76rem', marginBottom: '0.6rem' }}>
          {tk('cc.stInventorySrc')}
        </div>

        <div style={{ marginBottom: '0.7rem' }}>
          <Input
            value={w.query}
            onChange={(e) => w.setQuery(e.target.value)}
            placeholder={tk('cc.stSearchPlaceholder')}
            aria-label={tk('cc.stSearchPlaceholder')}
          />
        </div>

        {w.productsError && (
          <div style={{ marginBottom: '0.7rem' }}>
            <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tk('cc.stProductsUnavailable')}</span>{' '}
            <Button variant="secondary" size="sm" disabled={w.productsLoading} onClick={() => void w.refreshProducts()}>
              {tk('cc.stRetry')}
            </Button>
          </div>
        )}

        {w.productsLoading && w.productCount === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.loading')}</span>
        ) : stores.length === 0 || !storeId ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.stNoStore')}</span>
        ) : w.productCount === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.emptyProducts')}</span>
        ) : w.visibleProducts.length === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.stNoMatch')}</span>
        ) : (
          w.visibleProducts.map((p) => (
            <Flex key={p.id} justify="space-between" align="center" style={{ padding: '0.35rem 0' }}>
              <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>
                {productName(p.brand, p.model, p.variant)}
                <span style={{ display: 'block', color: colors.textMuted, fontSize: '0.72rem' }}>
                  {tk('cc.stCategory')}: {textOrDash(p.category)} · {tk('cc.stQuantity')}: {formatServerQuantity(p.quantity)}{' '}
                  {textOrDash(p.unit)}
                </span>
              </span>
              <span
                style={{
                  color: colors.text,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {tk('cc.stPrice')}: {formatServerMoney(p.sell_price)}
              </span>
            </Flex>
          ))
        )}
      </div>
    </div>
  );
});
