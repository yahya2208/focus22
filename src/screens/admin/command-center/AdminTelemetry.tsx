import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';
import { useAuth } from '../../../core/auth/AuthProvider';
import { permissionGuard } from '../../../core/research/permissions';
import { TelemetryAnalyticsBI } from '../../../business-intelligence/pages/TelemetryAnalyticsBI';
import { AdminSettingsBI } from '../../../business-intelligence/pages/AdminSettingsBI';
import type { PilotHealth } from '../../../services/order-service';
import { AccessDeniedScreen } from '../../auth/AccessDeniedScreen';
import { GOLD, LUX_RADIUS } from './tokens';

const card = (border: string, bgCard: string): React.CSSProperties => ({
  border: `1px solid ${border}`,
  borderRadius: LUX_RADIUS,
  padding: '1.1rem 1.2rem',
  background: bgCard,
  minWidth: 0,
});

/**
 * Independent Telemetry workspace.
 *
 * Renders the existing TelemetryAnalyticsBI directly — never through the
 * Business Intelligence Center. Aggregates only; no raw telemetry row path
 * exists here, exactly as on the original surface. The route-level permission
 * gate (`scientific/read`) is preserved as an explicit check so embedding
 * inside Pilot Ops never widens access. Operational event counters come from
 * the host-owned pilot health read (no refetch); telemetry.* settings reuse
 * the existing AdminSettingsBI component scoped to the telemetry category
 * (no second settings system). No Auth/RBAC/RPC/SQL change.
 */
export const AdminTelemetry = memo(function AdminTelemetry({
  health,
}: {
  /** Host-owned pilot health. Rendered read-only; never refetched here. */
  health: PilotHealth | null;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { researchRole } = useAuth();
  const tk = (k: string) => t(k as TranslationKey);

  if (!permissionGuard.can(researchRole, 'scientific', 'read')) {
    return <AccessDeniedScreen />;
  }

  const telemetry = health?.telemetry ?? null;

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>{tk('cc.navTelemetry')}</h2>
      </div>

      <TelemetryAnalyticsBI />

      <div style={{ ...card(colors.border, colors.bgCard), marginTop: '1rem' }}>
        <div style={{ color: GOLD, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          {tk('cc.telHealthTitle')}
        </div>
        <div style={{ color: colors.textSecondary, fontSize: '0.76rem', marginBottom: '0.6rem' }}>
          {tk('cc.telHealthSrc')}
        </div>
        {telemetry ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' }}>
            📊 {tk('pilot.telemetryCreated')}: {String(telemetry.order_created)} · {tk('pilot.telemetryCompleted')}:{' '}
            {String(telemetry.order_completed)} · {tk('pilot.telemetryFailed')}: {String(telemetry.order_failed)}
          </span>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.telHealthUnavailable')}</span>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <AdminSettingsBI categories={['telemetry']} />
      </div>
    </div>
  );
});
