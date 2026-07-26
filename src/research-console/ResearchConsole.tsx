import { useState, useMemo } from 'react';
import { useAppDispatch } from '../store/navigation';
import { useAuth } from '../core/auth/AuthProvider';
import { createPermissionGuard, type ResearchRole } from '../core/research/permissions';
import { useTranslation } from '../hooks/useTranslation';
import { useThemeColors } from '../hooks/useThemeColors';
import { OverviewDashboard } from './pages/overview/OverviewDashboard';
import { AcquisitionDashboard } from './pages/acquisition/AcquisitionDashboard';
import { ScientificDashboard } from './pages/scientific/ScientificDashboard';
import { UsersDashboard } from './pages/users/UsersDashboard';
import { SessionsDashboard } from './pages/sessions/SessionsDashboard';
import { DevicesDashboard } from './pages/devices/DevicesDashboard';
import { SurveysDashboard } from './pages/surveys/SurveysDashboard';
import { CampaignsDashboard } from './pages/campaigns/CampaignsDashboard';
import { LiveDashboard } from './pages/live/LiveDashboard';
import { SystemDashboard } from './pages/system/SystemDashboard';
import type { DashboardId } from './layout/ResearchLayout';

const guard = createPermissionGuard();

const RESEARCH_ROLE_MAP: Partial<Record<ResearchRole, 'super_admin' | 'research_admin' | 'analyst' | 'viewer'>> = {
  super_admin: 'super_admin',
  research_admin: 'research_admin',
  analyst: 'analyst',
  viewer: 'viewer',
};

const DASHBOARD_RESOURCE_MAP: Record<DashboardId, string> = {
  overview: 'overview',
  acquisition: 'overview',
  scientific: 'scientific',
  users: 'users',
  sessions: 'sessions',
  devices: 'devices',
  surveys: 'surveys',
  campaigns: 'campaigns',
  live: 'overview',
  system: 'overview',
};

const dashboards: { id: DashboardId; translationKey: string }[] = [
  { id: 'overview', translationKey: 'research.overview' },
  { id: 'acquisition', translationKey: 'research.acquisition' },
  { id: 'sessions', translationKey: 'research.sessions' },
  { id: 'users', translationKey: 'research.users' },
  { id: 'devices', translationKey: '' },
  { id: 'surveys', translationKey: 'research.surveys' },
  { id: 'campaigns', translationKey: 'research.campaigns' },
  { id: 'live', translationKey: '' },
  { id: 'system', translationKey: '' },
];

const dashboardComponents: Record<DashboardId, React.FC> = {
  overview: OverviewDashboard,
  acquisition: AcquisitionDashboard,
  scientific: ScientificDashboard,
  users: UsersDashboard,
  sessions: SessionsDashboard,
  devices: DevicesDashboard,
  surveys: SurveysDashboard,
  campaigns: CampaignsDashboard,
  live: LiveDashboard,
  system: SystemDashboard,
};

export function ResearchConsole() {
  const dispatch = useAppDispatch();
  const { researchRole } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [active, setActive] = useState<DashboardId>('overview');

  const mappedRole = researchRole !== 'none' ? RESEARCH_ROLE_MAP[researchRole] : undefined;

  const accessibleDashboards = useMemo(() => {
    if (!mappedRole) return [];
    return dashboards.filter((d) => {
      const resource = DASHBOARD_RESOURCE_MAP[d.id];
      return guard.can(mappedRole, resource, 'read');
    });
  }, [mappedRole]);

  const effectiveActive = useMemo(() => {
    if (accessibleDashboards.some((d) => d.id === active)) return active;
    return accessibleDashboards[0]?.id ?? 'overview';
  }, [active, accessibleDashboards]);

  const Component = dashboardComponents[effectiveActive];

  return (
    <nav aria-label="Research Console" style={{ minHeight: '100vh', background: colors.bg }}>
      <div style={{ display: 'flex', padding: '0.5rem', gap: '0.25rem', overflowX: 'auto', borderBottom: `1px solid ${colors.border}` }}>
        {accessibleDashboards.map((d) => (
          <button
            key={d.id}
            onClick={() => setActive(d.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: effectiveActive === d.id ? colors.accent : 'transparent',
              color: effectiveActive === d.id ? '#fff' : colors.textMuted,
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: effectiveActive === d.id ? 600 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {d.translationKey ? t(d.translationKey as 'research.title') : d.id}
          </button>
        ))}
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: `1px solid ${colors.borderLight}`,
            background: 'transparent',
            color: colors.textMuted,
            cursor: 'pointer',
            fontSize: '0.8125rem',
            whiteSpace: 'nowrap',
          }}
        >
          {t('research.back')}
        </button>
      </div>
      <div style={{ padding: '1rem' }}>
        {Component ? <Component /> : (
          <p style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem' }}>
            {t('research.noAccess')}
          </p>
        )}
      </div>
    </nav>
  );
}
