import { memo, useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Flex } from '../../../design-system/components/Flex';
import { Stack } from '../../../design-system/layout/Stack';
import { Card } from '../../../design-system/components/Card';
import type { PilotFamilyPreferences } from '../../../services/pilot-account-service';

// ============================================================================
// FamilyPreferencesCard — the family's optional vegetable delivery preferences
// (preferred time hint + free notes). A glowing CTA opens the inline editor;
// nothing here is required, nothing touches ledger/balance/settlement.
// View mode by default; edit mode swaps in inputs and calls onSave (wired by
// the parent to saveMyFamilyPreferences). Display-only.
// ============================================================================

export interface PreferencesInput {
  preferredDeliveryTime: string;
  vegNotes: string;
}

export const FamilyPreferencesCard = memo(function FamilyPreferencesCard({
  prefs,
  saving,
  onSave,
}: {
  prefs: PilotFamilyPreferences | null;
  saving: boolean;
  onSave: (input: PreferencesInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PreferencesInput>({ preferredDeliveryTime: '', vegNotes: '' });

  const shown: PreferencesInput = {
    preferredDeliveryTime: prefs?.preferred_delivery_time ?? '',
    vegNotes: prefs?.veg_notes ?? '',
  };
  const hasPrefs = shown.preferredDeliveryTime !== '' || shown.vegNotes !== '';

  const beginEdit = () => {
    setDraft(shown);
    setEditing(true);
  };

  const commit = async () => {
    await onSave(draft);
    setEditing(false);
  };

  return (
    <Card
      variant="interactive"
      padding="lg"
      style={{
        textAlign: 'center',
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 0 28px ${colors.accentGlow}`,
      }}
    >
      <div aria-hidden="true" style={{ fontSize: '2rem', lineHeight: 1 }}>🕒</div>
      <p style={{ margin: '0.5rem 0 0', color: colors.text, fontSize: '1rem', fontWeight: 800 }}>
        {t('pilot.preferencesTitle')}
      </p>
      {!editing && hasPrefs && (
        <p style={{ margin: '0.4rem 0 0', color: colors.textSecondary, fontSize: '0.85rem' }}>
          {shown.preferredDeliveryTime}
          {shown.preferredDeliveryTime && shown.vegNotes ? ' · ' : ''}
          {shown.vegNotes}
        </p>
      )}
      {!editing && !hasPrefs && (
        <p style={{ margin: '0.4rem 0 0', color: colors.textSecondary, fontSize: '0.85rem' }}>
          {t('pilot.preferencesHint')}
        </p>
      )}
      {!editing && (
        <Button variant="primary" size="lg" onClick={beginEdit} style={{ minWidth: '200px', minHeight: '52px', marginTop: '0.8rem' }}>
          {t('pilot.preferencesCta')}
        </Button>
      )}
      {editing && (
        <Stack gap="sm" style={{ marginTop: '0.8rem' }}>
          <Input
            value={draft.preferredDeliveryTime}
            onChange={(e) => setDraft((d) => ({ ...d, preferredDeliveryTime: e.target.value }))}
            placeholder={t('pilot.preferencesTimePlaceholder')}
            aria-label={t('pilot.preferencesTimePlaceholder')}
          />
          <Input
            value={draft.vegNotes}
            onChange={(e) => setDraft((d) => ({ ...d, vegNotes: e.target.value }))}
            placeholder={t('pilot.preferencesNotesPlaceholder')}
            aria-label={t('pilot.preferencesNotesPlaceholder')}
          />
          <Flex gap="sm" justify="center">
            <Button variant="primary" onClick={() => void commit()} disabled={saving}>
              {t('pilot.saveInfo')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              {t('adminCategories.cancel')}
            </Button>
          </Flex>
        </Stack>
      )}
    </Card>
  );
});
