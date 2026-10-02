import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';
import { LUX_RADIUS, LuxIcon, type LuxIconName } from './tokens';

export type QuickActionId = 'deposit' | 'invite' | 'orders';

/**
 * Quick actions (G1): visual shortcuts only — every action delegates to an
 * existing flow via onAction. No business logic lives here.
 */
export const QuickActions = memo(function QuickActions({
  onAction,
}: {
  onAction: (id: QuickActionId) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const actions: ReadonlyArray<{ id: QuickActionId; labelKey: TranslationKey; hintKey: TranslationKey; icon: LuxIconName }> = [
    { id: 'deposit', labelKey: 'cc.quickDeposit', hintKey: 'cc.quickDepositHint', icon: 'wallet' },
    { id: 'invite', labelKey: 'cc.quickInvite', hintKey: 'cc.quickInviteHint', icon: 'mail' },
    { id: 'orders', labelKey: 'cc.quickOrders', hintKey: 'cc.quickOrdersHint', icon: 'cart' },
  ];
  return (
    <section
      aria-label={t('cc.quickLabel')}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.4rem' }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onAction(action.id)}
          style={{
            background: '#14142a',
            border: `1px solid ${colors.border}`,
            borderRadius: LUX_RADIUS,
            padding: '1rem',
            textAlign: 'center',
            color: colors.text,
            fontSize: '0.86rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'inline-flex', verticalAlign: '-3px', marginInlineEnd: '0.45rem', color: '#D8B46A' }}>
            <LuxIcon name={action.icon} size={17} />
          </span>
          {t(action.labelKey)}
          <small style={{ display: 'block', color: colors.textMuted, fontWeight: 500, fontSize: '0.72rem', marginTop: '0.3rem' }}>
            {t(action.hintKey)}
          </small>
        </button>
      ))}
    </section>
  );
});
