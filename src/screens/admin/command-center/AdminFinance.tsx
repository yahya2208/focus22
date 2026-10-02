import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Flex } from '../../../design-system/components/Flex';
import { GOLD, LUX_RADIUS } from './tokens';
import { formatDZD } from './KPIGrid';
import { LEDGER_TYPES, useFinanceWorkspace, type FamilyBalanceRow } from './hooks/useFinanceWorkspace';
import type { FamilyWorkspace } from './hooks/useFamilyWorkspace';

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

/**
 * Independent Finance workspace (G2.2).
 *
 * Money rules enforced here:
 * - A family balance is the server's SUM(ledger.amount), shown ONCE per family
 *   and never summed across member rows (the server repeats it on every row).
 * - A family with no active member row renders "—". It never renders 0.00.
 * - The total covers only families that have a server value, and says how many
 *   families were excluded.
 * - `balance_after` is labeled as an audit snapshot, not as a balance.
 * - Nothing here is called revenue, sales, or profit, and no debt figure is
 *   shown: no admin aggregate debts source exists.
 * - Cash deposit is the only write, admin-only, and the FIFO debt pay-down
 *   happens exclusively inside pilot_admin_deposit.
 *
 * A failed ledger read renders "unavailable" — never an empty ledger.
 */
export const AdminFinance = memo(function AdminFinance({
  workspace: w,
  isAdmin,
}: {
  workspace: FamilyWorkspace;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const f = useFinanceWorkspace({ workspace: w });
  const tk = (k: string) => t(k as TranslationKey);

  const balanceRow = (r: FamilyBalanceRow) => {
    const active = r.family.id === f.selectedFamily?.id;
    return (
      <button
        key={r.family.id}
        type="button"
        onClick={() => f.selectFamily(r.family.id)}
        aria-pressed={active}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          width: '100%',
          textAlign: 'start',
          padding: '0.6rem 0.8rem',
          marginBottom: '0.4rem',
          borderRadius: 12,
          border: active ? `1px solid ${GOLD}` : `1px solid ${colors.border}`,
          background: 'transparent',
          color: colors.text,
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontWeight: 700, color: active ? GOLD : colors.text }}>{r.family.name}</span>
        <span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>
          {tk('cc.finMembers')} {r.activeMemberCount}/{r.memberCount}
        </span>
        <span
          style={{
            color: r.balance === null ? colors.textMuted : colors.text,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {r.balance === null ? DASH : formatDZD(r.balance)}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>{tk('cc.navFinance')}</h2>
        <p style={{ margin: '0.3rem 0 0', color: colors.textSecondary, fontSize: '0.85rem' }}>{tk('cc.finIntro')}</p>
      </div>

      {(w.message || w.error) && (
        <div style={{ marginBottom: '1rem' }}>
          {w.message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tk(`pilot.msg.${w.message}`)}</span>}
          {w.error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tk(`pilot.error.${w.error}`)}</span>}
        </div>
      )}

      <div style={card(colors.border, colors.bgCard)}>
        <div style={sectionTitle(GOLD)}>{tk('cc.finBalancesTitle')}</div>
        <div style={{ color: colors.textSecondary, fontSize: '0.76rem', marginBottom: '0.6rem' }}>{tk('cc.finBalancesSrc')}</div>

        <Flex gap="sm" align="center" style={{ flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <Input
            value={f.query}
            onChange={(e) => f.setQuery(e.target.value)}
            placeholder={tk('cc.finSearchPlaceholder')}
            aria-label={tk('cc.finSearchPlaceholder')}
          />
          <span style={{ color: colors.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {f.totals.withBalance > 0 ? formatDZD(f.totals.sum) : DASH}
          </span>
        </Flex>
        <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '0.7rem' }}>
          {f.totals.withoutBalance > 0
            ? tk('cc.finTotalsPartial').replace('{n}', String(f.totals.withoutBalance))
            : tk('cc.finTotalsComplete').replace('{n}', String(f.totals.familyCount))}
        </div>

        {w.membersLoading && !w.families.length ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.loading')}</span>
        ) : f.visibleRows.length === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.finNoFamilies')}</span>
        ) : (
          f.visibleRows.map(balanceRow)
        )}
      </div>

      <div style={{ ...card(colors.border, colors.bgCard), marginTop: '1rem' }}>
        <div style={sectionTitle(GOLD)}>{tk('cc.finLedgerTitle')}</div>
        {!f.selectedFamily ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.finSelectFamily')}</span>
        ) : (
          <>
            <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{f.selectedFamily.name}</div>
            <Flex gap="sm" align="center" style={{ flexWrap: 'wrap', margin: '0.6rem 0' }}>
              <select
                value={f.typeFilter}
                onChange={(e) => f.setTypeFilter(e.target.value as typeof f.typeFilter)}
                aria-label={tk('cc.finTypeFilter')}
                style={{
                  background: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: '0.4rem 0.6rem',
                  fontSize: '0.82rem',
                  fontFamily: 'inherit',
                }}
              >
                <option value="ALL">{tk('cc.finTypeAll')}</option>
                {LEDGER_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {ty}
                  </option>
                ))}
              </select>
              <span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>{tk('cc.finAuditSnapshotNote')}</span>
            </Flex>

            {w.ledgerError ? (
              <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tk('cc.finLedgerUnavailable')}</span>
            ) : w.ledgerLoading ? (
              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.loading')}</span>
            ) : f.visibleEntries.length === 0 ? (
              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.ledgerEmpty')}</span>
            ) : (
              f.visibleEntries.map((e) => (
                <Flex key={e.id} justify="space-between" align="center" style={{ padding: '0.25rem 0' }}>
                  <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>
                    {e.transaction_type}
                    {e.order_number ? ` · #${e.order_number}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                  <span
                    style={{
                      color: Number(e.amount) < 0 ? colors.danger : colors.successText,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDZD(Number(e.amount))}
                    <span style={{ color: colors.textMuted, fontWeight: 500, fontSize: '0.7rem' }}>
                      {' '}
                      · {tk('cc.finAuditAfter')} {formatDZD(Number(e.balance_after))}
                    </span>
                  </span>
                </Flex>
              ))
            )}
          </>
        )}
      </div>

      {isAdmin && (
        <div style={{ ...card(colors.border, colors.bgCard), marginTop: '1rem' }}>
          <div style={sectionTitle(GOLD)}>{tk('cc.finDepositTitle')}</div>
          <div style={{ color: colors.textSecondary, fontSize: '0.76rem', marginBottom: '0.6rem' }}>{tk('cc.finDepositHint')}</div>
          {!f.selectedFamily ? (
            <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.finSelectFamily')}</span>
          ) : (
            <Flex gap="sm" align="center" style={{ flexWrap: 'wrap' }}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={f.depositAmount}
                onChange={(e) => f.setDepositAmount(e.target.value)}
                placeholder={tk('pilot.depositAmountPlaceholder')}
                aria-label={tk('pilot.depositAmountPlaceholder')}
              />
              <Input
                value={f.depositNote}
                onChange={(e) => f.setDepositNote(e.target.value)}
                placeholder={tk('pilot.depositNotePlaceholder')}
                aria-label={tk('pilot.depositNotePlaceholder')}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={f.depositing || !f.selectedFamily}
                onClick={() => void f.submitDeposit()}
              >
                {f.depositing ? tk('pilot.depositing') : tk('pilot.depositAction')}
              </Button>
            </Flex>
          )}
        </div>
      )}
    </div>
  );
});
