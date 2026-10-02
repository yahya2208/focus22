import { memo, useMemo, useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Flex } from '../../../design-system/components/Flex';
import { GOLD, GOLD_GLOW, LUX_RADIUS } from './tokens';
import type { FamilyWorkspace } from './hooks/useFamilyWorkspace';

const card = (border: string, bgCard: string): React.CSSProperties => ({
  border: `1px solid ${border}`,
  borderRadius: LUX_RADIUS,
  padding: '1.1rem 1.2rem',
  background: bgCard,
  minWidth: 0,
});

/**
 * Independent Families section (G2.1): two-column family workspace —
 * list + selected family detail (account, members, preferences, ledger,
 * deposits, provision/bind with move guard, family invitations, creation).
 * Pure composition over useFamilyWorkspace; every write flows through the
 * existing admin RPCs with identical validation and messages.
 */
export const AdminFamilies = memo(function AdminFamilies({
  workspace: w,
}: {
  workspace: FamilyWorkspace;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');

  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);

  const visibleFamilies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return w.families;
    return w.families.filter((f) => f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q));
  }, [w.families, query]);

  const selected = w.families.find((f) => f.id === w.selectedFamilyId) ?? null;
  // Canonical family balance: the server repeats the same family-level balance
  // on every member row, so summing members would multiply it by headcount.
  const familyBalance = useMemo(
    () => w.familyMembers[0]?.balance ?? 0,
    [w.familyMembers],
  );

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>
          {t('pilot.families')}
        </h2>
        <p style={{ margin: '0.3rem 0 0', color: colors.textSecondary, fontSize: '0.85rem' }}>
          {t('pilot.familyAccountHint' as TranslationKey)}
        </p>
      </div>

      {(w.message || w.error) && (
        <div style={{ marginBottom: '1rem' }}>
          {w.message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tMsg(w.message)}</span>}
          {w.error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(w.error)}</span>}
        </div>
      )}

      <div style={{ ...card(colors.border, colors.bgCard), marginBottom: '1rem' }}>
        <Flex gap="sm" align="center">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pilot.familySearchPlaceholder' as TranslationKey)}
            aria-label={t('pilot.familySearchPlaceholder' as TranslationKey)}
          />
        </Flex>
        <Flex gap="sm" align="center" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <Input
            value={w.newFamilyName}
            onChange={(e) => w.setNewFamilyName(e.target.value)}
            placeholder={t('pilot.familyName')}
            aria-label={t('pilot.familyName')}
          />
          <Input
            value={w.newFamilyNameAr}
            onChange={(e) => w.setNewFamilyNameAr(e.target.value)}
            placeholder={t('pilot.familyNameAr')}
            aria-label={t('pilot.familyNameAr')}
          />
          <Input
            value={w.newFamilySlug}
            onChange={(e) => w.setNewFamilySlug(e.target.value)}
            placeholder={t('pilot.familySlug')}
            aria-label={t('pilot.familySlug')}
          />
          <Input
            value={w.newFamilyDescription}
            onChange={(e) => w.setNewFamilyDescription(e.target.value)}
            placeholder={t('pilot.familyDescription')}
            aria-label={t('pilot.familyDescription')}
          />
          <Button variant="primary" size="sm" disabled={w.creatingFamily} onClick={() => void w.handleCreateFamily()}>
            {t('pilot.saveFamily')}
          </Button>
        </Flex>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div style={card(colors.border, colors.bgCard)}>
          <div style={{ color: GOLD, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.7rem' }}>
            {t('pilot.familyListTitle' as TranslationKey)}
          </div>
          {visibleFamilies.length === 0 ? (
            <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.noFamilies')}</span>
          ) : (
            visibleFamilies.map((f) => {
              const active = f.id === w.selectedFamilyId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => w.selectFamily(f.id)}
                  aria-pressed={active}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'start',
                    padding: '0.65rem 0.8rem',
                    marginBottom: '0.45rem',
                    borderRadius: 12,
                    border: active ? '1px solid rgba(216, 180, 106, 0.4)' : `1px solid ${colors.border}`,
                    background: active ? '#1a1a2e' : 'transparent',
                    boxShadow: active ? `0 0 20px ${GOLD_GLOW}` : 'none',
                    color: active ? GOLD : colors.text,
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {f.name}
                  <span style={{ display: 'block', color: colors.textMuted, fontSize: '0.72rem', fontWeight: 500 }}>
                    {f.slug} · {f.status}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={card(colors.border, colors.bgCard)}>
          {!selected ? (
            <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.selectFamily' as TranslationKey)}</span>
          ) : (
            <>
              <div style={{ color: GOLD, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                {selected.name}
              </div>
              <div style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {familyBalance.toFixed(2)} {t('pilot.currency')}
              </div>

              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '1rem 0 0.4rem' }}>
                {t('pilot.membersTitle' as TranslationKey)}
              </div>
              {w.membersLoading ? (
                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.loading')}</span>
              ) : w.familyMembers.length === 0 ? (
                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.familyNoMembers' as TranslationKey)}</span>
              ) : (
                // Balance is family-level (shown once above) — the server repeats
                // the same value on every member row, so rows show identity only.
                w.familyMembers.map((m) => (
                  <Flex key={m.member_id} justify="space-between" align="center" style={{ padding: '0.25rem 0' }}>
                    <span style={{ color: colors.text, fontSize: '0.84rem' }}>{m.user_email}</span>
                    <span style={{ color: colors.textMuted, fontSize: '0.76rem' }}>{m.role} · {m.status}</span>
                  </Flex>
                ))
              )}

              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '1rem 0 0.4rem' }}>
                {t('pilot.preferencesTitle')}
              </div>
              {(w.familyPrefs?.preferred_delivery_time ?? '') === '' && (w.familyPrefs?.veg_notes ?? '') === '' ? (
                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.preferencesEmpty')}</span>
              ) : (
                <>
                  <div style={{ color: colors.text, fontSize: '0.84rem' }}>{w.familyPrefs?.preferred_delivery_time}</div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>{w.familyPrefs?.veg_notes}</div>
                </>
              )}

              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '1rem 0 0.4rem' }}>
                {t('pilot.ledgerHistory')}
              </div>
              {w.ledgerError ? (
                <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{t('cc.finLedgerUnavailable')}</span>
              ) : w.ledgerLoading ? (
                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.loading')}</span>
              ) : w.familyLedger.length === 0 ? (
                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('pilot.ledgerEmpty')}</span>
              ) : (
                w.familyLedger.map((e) => (
                  <Flex key={e.id} justify="space-between" align="center" style={{ padding: '0.2rem 0' }}>
                    <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>
                      {e.transaction_type}
                      {e.order_number ? ` · #${e.order_number}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                    <span style={{ color: e.amount < 0 ? colors.danger : colors.successText, fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {Number(e.amount).toFixed(2)} {t('pilot.currency')}
                    </span>
                  </Flex>
                ))
              )}

              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '1rem 0 0.4rem' }}>
                {t('pilot.depositTitle' as TranslationKey)}
              </div>
              <Flex gap="sm" align="center" style={{ flexWrap: 'wrap' }}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={w.depositAmount}
                  onChange={(e) => w.setDepositAmount(e.target.value)}
                  placeholder={t('pilot.depositAmountPlaceholder' as TranslationKey)}
                  aria-label={t('pilot.depositAmountPlaceholder' as TranslationKey)}
                />
                <Input
                  value={w.depositNote}
                  onChange={(e) => w.setDepositNote(e.target.value)}
                  placeholder={t('pilot.depositNotePlaceholder' as TranslationKey)}
                  aria-label={t('pilot.depositNotePlaceholder' as TranslationKey)}
                />
                <Button variant="primary" size="sm" disabled={w.depositing} onClick={() => void w.submitDeposit()}>
                  {w.depositing ? t('pilot.depositing' as TranslationKey) : t('pilot.depositAction' as TranslationKey)}
                </Button>
              </Flex>

              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '1rem 0 0.4rem' }}>
                {t('pilot.familyProvisionTitle' as TranslationKey)}
              </div>
              <Flex gap="sm" align="center">
                <Input
                  value={w.familyEmail}
                  onChange={(e) => w.setFamilyEmail(e.target.value)}
                  placeholder={t('pilot.emailPlaceholder')}
                  aria-label={t('pilot.emailPlaceholder')}
                />
                <Button variant="secondary" size="sm" disabled={w.familySearching} onClick={() => void w.searchFamilyUsers()}>
                  {t('pilot.findUser')}
                </Button>
              </Flex>
              {w.familyUserResults.map((u) => (
                <Flex key={u.user_id} justify="space-between" align="center" style={{ marginTop: 6 }}>
                  <span style={{ color: colors.text, fontSize: '0.85rem' }}>{u.display_name ?? u.email ?? u.user_id}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={w.bindingUserId === u.user_id}
                    onClick={() => void w.bindToFamily(u.user_id)}
                  >
                    {t('pilot.bindToFamily' as TranslationKey)}
                  </Button>
                </Flex>
              ))}
              {w.pendingMove && (
                <div style={{ border: `1px solid ${colors.danger}`, borderRadius: 12, padding: 10, background: colors.bgCard, marginTop: 8 }}>
                  <span style={{ color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' }}>
                    {t('pilot.familyMoveTitle')}
                  </span>
                  <span style={{ color: colors.text, fontSize: '0.85rem', display: 'block', margin: '0.35rem 0' }}>
                    {w.pendingMove.email} · {w.pendingMove.fromFamilyName} → {w.familyNameOf(w.pendingMove.toFamilyId, null)}
                  </span>
                  <span style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                    {t('pilot.familyMoveNotice')}
                  </span>
                  <Flex gap="sm" style={{ marginTop: 8 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={w.bindingUserId !== null}
                      onClick={() => void w.confirmPendingMove()}
                    >
                      {t('pilot.confirmMove')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={w.bindingUserId !== null}
                      onClick={() => w.cancelPendingMove()}
                      aria-label={t('adminCategories.cancel')}
                    >
                      ✕
                    </Button>
                  </Flex>
                </div>
              )}

              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '1rem 0 0.4rem' }}>
                {t('invite.familyTitle')}
              </div>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                {t('invite.familyHint')}
              </span>
              <Flex gap="sm" align="center">
                <Input
                  value={w.familyInviteEmail}
                  onChange={(e) => w.setFamilyInviteEmail(e.target.value)}
                  placeholder={t('invite.familyEmailPlaceholder')}
                  aria-label={t('invite.familyEmailPlaceholder')}
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={w.familyInviting || !w.familyInviteEmail.trim()}
                  onClick={() => void w.handleFamilyInvite(false)}
                >
                  {w.familyInviting ? t('invite.sending') : t('invite.send')}
                </Button>
              </Flex>
              {w.familyInvitations.map((row) => (
                <div
                  key={`${row.invite_email}:${row.member_kind}`}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard, marginTop: 8 }}
                >
                  <Flex justify="space-between" align="center">
                    <span style={{ color: colors.text, fontWeight: 700 }}>{row.invite_email}</span>
                    <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{row.status}</span>
                  </Flex>
                  <Flex gap="sm" style={{ marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={w.familyInviting}
                      onClick={() => void w.handleFamilyInvite(true, row.invite_email)}
                    >
                      {t('invite.resend')}
                    </Button>
                  </Flex>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
