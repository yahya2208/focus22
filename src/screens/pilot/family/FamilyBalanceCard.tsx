import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { Flex } from '../../../design-system/components/Flex';
import type { PilotAccount } from '../../../services/pilot-account-service';

// ============================================================================
// FamilyBalanceCard — balance as a warm product card (never a ledger table).
// Recent operations come from the family's own order list (display-only).
// ============================================================================

export interface RecentOp {
  readonly id: string;
  readonly label: string;
  readonly total: number;
}

export const FamilyBalanceCard = memo(function FamilyBalanceCard({
  account,
  recentOps,
}: {
  account: PilotAccount;
  recentOps: readonly RecentOp[];
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 22,
        padding: '1.1rem 1.2rem',
        background: `linear-gradient(150deg, ${colors.accent}14 0%, ${colors.bgCard} 70%)`,
      }}
    >
      <p style={{ margin: 0, color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700 }}>
        {t('pilot.accountTitle')}
      </p>
      <p style={{ margin: '0.3rem 0 0', color: colors.text, fontSize: '1.7rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {account.balance.toLocaleString()} {t('pilot.currency')}
      </p>
      <p style={{ margin: '0.15rem 0 0', color: colors.successText, fontSize: '0.78rem', fontWeight: 700 }}>
        {t('pilot.availableForOrders')}
      </p>
      {recentOps.length > 0 && (
        <div style={{ borderTop: `1px dashed ${colors.borderLight}`, marginTop: '0.75rem', paddingTop: '0.6rem' }}>
          <p style={{ margin: '0 0 0.4rem', color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700 }}>
            {t('pilot.recentActivity')}
          </p>
          {recentOps.map((op) => (
            <Flex key={op.id} justify="space-between" align="center" style={{ padding: '0.2rem 0' }}>
              <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>{op.label}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                -{op.total.toLocaleString()} {t('pilot.currency')}
              </span>
            </Flex>
          ))}
        </div>
      )}
    </div>
  );
});
