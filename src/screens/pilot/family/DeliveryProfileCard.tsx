import { memo, useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Flex } from '../../../design-system/components/Flex';
import type { PilotFamilyContact } from '../../../services/pilot-account-service';

// ============================================================================
// DeliveryProfileCard — the family's delivery identity as a warm profile card
// (not an admin form). View mode by default; edit mode swaps in inputs and
// calls onSave (wired by the parent to saveMyFamilyContact). Display-only.
// ============================================================================

export interface ContactInput {
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const ROWS = [
  { icon: '👤', key: 'name' },
  { icon: '📞', key: 'phone' },
  { icon: '📍', key: 'address' },
  { icon: '📝', key: 'notes' },
] as const;

export const DeliveryProfileCard = memo(function DeliveryProfileCard({
  contact,
  saving,
  onSave,
}: {
  contact: PilotFamilyContact | null;
  saving: boolean;
  onSave: (input: ContactInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactInput>({ name: '', phone: '', address: '', notes: '' });

  const shown: ContactInput = contact == null
    ? { name: '', phone: '', address: '', notes: '' }
    : {
        name: contact.contact_name ?? '',
        phone: contact.contact_phone ?? '',
        address: contact.contact_address ?? '',
        notes: contact.contact_notes ?? '',
      };

  const beginEdit = () => {
    setDraft(shown);
    setEditing(true);
  };

  const commit = async () => {
    await onSave(draft);
    setEditing(false);
  };

  const fieldLabel = (key: string) => t(`pilot.${key}` as 'pilot.name');

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        padding: '1rem 1.1rem',
        background: colors.bgCard,
      }}
    >
      <p style={{ margin: '0 0 0.75rem', color: colors.text, fontSize: '1rem', fontWeight: 800 }}>
        {t('pilot.deliveryInfo')}
      </p>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {ROWS.map((row) => (
            <Input
              key={row.key}
              value={draft[row.key]}
              onChange={(e) => setDraft((cur) => ({ ...cur, [row.key]: e.target.value }))}
              placeholder={fieldLabel(row.key)}
              aria-label={fieldLabel(row.key)}
            />
          ))}
          <Flex gap="sm" style={{ marginTop: '0.25rem' }}>
            <Button variant="primary" size="sm" disabled={saving} onClick={() => void commit()} style={{ flex: 1 }}>
              {t('pilot.saveInfo')}
            </Button>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)} style={{ flex: 1 }}>
              {t('common.cancel')}
            </Button>
          </Flex>
        </div>
      ) : (
        <div>
          {ROWS.map((row) => (
            <Flex key={row.key} align="center" gap="sm" style={{ padding: '0.4rem 0' }}>
              <span aria-hidden="true" style={{ fontSize: '1.1rem', flexShrink: 0 }}>{row.icon}</span>
              <span style={{ color: shown[row.key] ? colors.text : colors.textMuted, fontSize: '0.88rem', fontWeight: shown[row.key] ? 600 : 400 }}>
                {shown[row.key] || fieldLabel(row.key)}
              </span>
            </Flex>
          ))}
          <Button variant="secondary" size="sm" onClick={beginEdit} style={{ width: '100%', marginTop: '0.6rem' }}>
            {t('pilot.editInfo')}
          </Button>
        </div>
      )}
    </div>
  );
});
