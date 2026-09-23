import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { Flex } from '../../../design-system/components/Flex';

// ============================================================================
// FamilyOrderTimeline — the order journey as 5 human steps. Internal DB
// statuses never reach the user; cancelled is a terminal note, not a step.
//   pending → 0 · confirmed → 1 · preparing → 2 · out_for_delivery → 3 ·
//   delivered → 4 (all done). Unknown/cancelled → -1.
// ============================================================================

const STEPS = [
  { icon: '🛒', labelKey: 'pilot.stepReceived' },
  { icon: '✓', labelKey: 'pilot.stepConfirmed' },
  { icon: '👨‍🍳', labelKey: 'pilot.stepPreparing' },
  { icon: '📦', labelKey: 'pilot.readyForHandoff' },
  { icon: '🏠', labelKey: 'pilot.stepDelivered' },
] as const;

export function stepIndexForStatus(status: string): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'confirmed':
      return 1;
    case 'preparing':
      return 2;
    case 'out_for_delivery':
      return 3;
    case 'delivered':
      return 4;
    default:
      return -1;
  }
}

export const FamilyOrderTimeline = memo(function FamilyOrderTimeline({ status }: { status: string }) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (status === 'cancelled') {
    return (
      <Flex align="center" gap="sm">
        <span
          aria-hidden="true"
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem', background: colors.dangerBg, flexShrink: 0,
          }}
        >
          ✕
        </span>
        <span style={{ color: colors.text, fontWeight: 700 }}>{t('pilot.orderCancelled')}</span>
      </Flex>
    );
  }

  const current = stepIndexForStatus(status);

  return (
    <div role="list" aria-label={t('pilot.currentOrder')} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {STEPS.map((step, i) => {
        const done = current >= 0 && i < current;
        const isCurrent = i === current;
        const dimmed = current === -1 || i > current;
        return (
          <div key={step.labelKey} role="listitem" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span
                aria-hidden="true"
                style={{
                  width: isCurrent ? '46px' : '40px',
                  height: isCurrent ? '46px' : '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isCurrent ? '1.35rem' : '1.15rem',
                  background: done ? colors.successBg : isCurrent ? colors.accent : colors.bgInput,
                  border: isCurrent ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                  boxShadow: isCurrent ? `0 0 22px ${colors.accentGlow}` : 'none',
                  opacity: dimmed && !isCurrent ? 0.45 : 1,
                }}
              >
                {done ? '✓' : step.icon}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  style={{
                    width: '2px', height: '18px', margin: '2px 0',
                    background: done ? colors.success : colors.border,
                    opacity: dimmed ? 0.4 : 1,
                  }}
                />
              )}
            </div>
            <span
              style={{
                color: isCurrent ? colors.text : dimmed ? colors.textMuted : colors.textSecondary,
                fontWeight: isCurrent || done ? 800 : 600,
                fontSize: isCurrent ? '0.95rem' : '0.85rem',
                paddingTop: '0.55rem',
              }}
            >
              {t(step.labelKey)}
            </span>
          </div>
        );
      })}
    </div>
  );
});
