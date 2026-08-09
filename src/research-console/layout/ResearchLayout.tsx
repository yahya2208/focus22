import { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { ResearchFilters, FilterKey } from '../../core/research/filters';
import type { Metric } from '../../core/research/types';
import { displayMetric } from '../../core/research/types';
import { useTranslation } from '../../hooks/useTranslation';
import type { TranslationKey } from '../../i18n';

const MOBILE_BREAKPOINT = 768;

export type DashboardId =
  | 'overview' | 'scientific' | 'users' | 'sessions'
  | 'devices' | 'system' | 'inventory'
  | 'catalog-health' | 'variant-coverage' | 'inventory-health' | 'price-memory' | 'ads'
  | 'campaigns';

const DASHBOARDS: { id: DashboardId; labelKey: TranslationKey; icon: string }[] = [
  { id: 'overview', labelKey: 'research.nav.overview', icon: '📊' },
  { id: 'scientific', labelKey: 'research.nav.scientific', icon: '🔬' },
  { id: 'users', labelKey: 'research.nav.users', icon: '👥' },
  { id: 'sessions', labelKey: 'research.nav.sessions', icon: '⏱' },
  { id: 'devices', labelKey: 'research.nav.devices', icon: '💻' },
  { id: 'system', labelKey: 'research.nav.system', icon: '⚙' },
  { id: 'inventory', labelKey: 'research.nav.inventory', icon: '📦' },
  { id: 'catalog-health', labelKey: 'research.nav.catalog-health', icon: '🗂' },
  { id: 'variant-coverage', labelKey: 'research.nav.variant-coverage', icon: '🧩' },
  { id: 'inventory-health', labelKey: 'research.nav.inventory-health', icon: '🗃' },
  { id: 'price-memory', labelKey: 'research.nav.price-memory', icon: '🏷' },
  { id: 'ads', labelKey: 'research.nav.ads', icon: '📢' },
  { id: 'campaigns', labelKey: 'research.nav.campaigns', icon: '🎯' },
];

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

interface ResearchLayoutProps {
  activeDashboard: DashboardId;
  onNavigate: (dashboard: DashboardId) => void;
  children: React.ReactNode;
  availableDashboards?: readonly DashboardId[];
  onBack?: () => void;
}

export function ResearchLayout({ activeDashboard, onNavigate, children, availableDashboards, onBack }: ResearchLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { t } = useTranslation();

  const navigate = useCallback((id: DashboardId) => {
    onNavigate(id);
    setDrawerOpen(false);
  }, [onNavigate]);

  const visibleDashboards = availableDashboards
    ? DASHBOARDS.filter((d) => availableDashboards.includes(d.id))
    : DASHBOARDS;

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const sidebarContent = (
    <>
      <div style={{ padding: '0 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#6366f1' }}>{t('sidebar.focusResearch')}</span>
        {isMobile && (
          <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', padding: '0.25rem' }} aria-label="Close menu">
            ✕
          </button>
        )}
        {!isMobile && (
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', padding: '0.25rem' }} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        )}
      </div>
      <nav aria-label="Research console navigation" style={{ flex: 1, overflowY: 'auto' }}>
        {visibleDashboards.map((d) => (
          <button
            key={d.id}
            onClick={() => navigate(d.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              width: '100%', padding: (isMobile || sidebarOpen) ? '0.6rem 1rem' : '0.6rem 0',
              justifyContent: (isMobile || sidebarOpen) ? 'flex-start' : 'center',
              background: activeDashboard === d.id ? '#1e1e2e' : 'transparent',
              border: 'none', color: activeDashboard === d.id ? '#6366f1' : '#888',
              cursor: 'pointer', fontSize: '0.9rem', borderRadius: '0',
              transition: 'background 0.1s',
            }}
            aria-current={activeDashboard === d.id ? 'page' : undefined}
            title={t(d.labelKey)}
          >
            <span>{d.icon}</span>
            {(isMobile || sidebarOpen) && <span>{t(d.labelKey)}</span>}
          </button>
        ))}
      </nav>
      {onBack && (
        <div style={{ marginTop: '1rem', padding: '0 0.5rem' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              width: '100%', padding: '0.6rem 0.5rem',
              justifyContent: (isMobile || sidebarOpen) ? 'flex-start' : 'center',
              background: 'transparent',
              border: '1px solid #333', borderRadius: '6px', color: '#888',
              cursor: 'pointer', fontSize: '0.85rem',
            }}
            title={t('research.back')}
          >
            <span>←</span>
            {(isMobile || sidebarOpen) && <span>{t('research.back')}</span>}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f', color: '#f0f0f0', position: 'relative', overflow: 'hidden' }}>
      {isMobile && drawerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90 }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {!isMobile && (
        <aside style={{
          width: sidebarOpen ? '240px' : '60px',
          background: '#12121a',
          borderRight: '1px solid #1e1e2e',
          padding: '1rem 0',
          transition: 'width 0.2s',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {sidebarContent}
        </aside>
      )}

      {isMobile && (
        <aside style={{
          position: 'fixed', top: 0, left: drawerOpen ? 0 : '-260px',
          width: '260px', height: '100vh',
          background: '#12121a',
          borderRight: '1px solid #1e1e2e',
          padding: '1rem 0',
          transition: 'left 0.25s ease',
          zIndex: 100,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {sidebarContent}
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #1e1e2e', background: '#12121a' }}>
            <button onClick={() => setDrawerOpen(true)} style={{ background: 'none', border: 'none', color: '#f0f0f0', cursor: 'pointer', fontSize: '1.3rem', padding: '0.25rem' }} aria-label="Open menu">
              ☰
            </button>
            <span style={{ fontWeight: 'bold', color: '#6366f1' }}>{t('sidebar.focusResearch')}</span>
          </div>
        )}
        <main style={{ flex: 1, padding: isMobile ? '1rem' : '1.5rem', overflow: 'auto', width: '100%', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}

interface StatCardProps {
  readonly label: string;
  readonly value: string | number | Metric;
  readonly subtitle?: string;
  readonly color?: string;
  readonly onClick?: () => void;
}

export function StatCard({ label, value, subtitle, color, onClick }: StatCardProps) {
  const isMetric = typeof value === 'object' && value !== null && 'status' in value;
  const metric = isMetric ? (value as Metric) : null;
  const displayText = metric ? displayMetric(metric) : String(value);
  const isComingSoon = metric?.status === 'coming-soon';

  const resolvedColor = (() => {
    if (isComingSoon) return '#444';
    if (color) return color;
    return '#f0f0f0';
  })();

  return (
    <Card
      padding="1rem"
      style={{
        cursor: onClick ? 'pointer' : undefined,
        transition: 'transform 0.1s',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <p style={{ color: '#888', fontSize: '0.8rem', margin: 0 }}>{label}</p>
        <p style={{ color: resolvedColor, fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{displayText}</p>
        {isComingSoon && (
          <span style={{
            display: 'inline-block', padding: '1px 6px', borderRadius: '4px',
            background: '#1e1e2e', color: '#666', fontSize: '0.6rem',
            marginTop: '4px', border: '1px solid #333',
          }}>Coming Soon</span>
        )}
        {subtitle && <p style={{ color: '#666', fontSize: '0.75rem', margin: 0 }}>{subtitle}</p>}
      </div>
    </Card>
  );
}

interface DashboardHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: React.ReactNode;
}

export function DashboardHeader({ title, subtitle, actions }: DashboardHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f0f0f0', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.25rem' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem' }}>{actions}</div>}
    </div>
  );
}

interface FilterBarProps {
  readonly filters: ResearchFilters;
  readonly onFilterChange: (key: FilterKey, value: unknown) => void;
  readonly onReset: () => void;
}

export function FilterBar({ filters, onFilterChange, onReset }: FilterBarProps) {
  const { t } = useTranslation();
  const activeCount = Object.values(filters).filter((v) => v !== null && v !== undefined).length;
  return (
    <Card padding="0.75rem" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>{t('sidebar.filters')}{activeCount > 0 ? ` (${activeCount})` : ''}</span>
        <input
          type="date"
          aria-label="Date from"
          style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #333', background: '#1e1e2e', color: '#f0f0f0', fontSize: '0.85rem' }}
          onChange={(e) => onFilterChange('dateFrom', e.target.value ? new Date(e.target.value).getTime() : null)}
        />
        <input
          type="date"
          aria-label="Date to"
          style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #333', background: '#1e1e2e', color: '#f0f0f0', fontSize: '0.85rem' }}
          onChange={(e) => onFilterChange('dateTo', e.target.value ? new Date(e.target.value).getTime() : null)}
        />
        {activeCount > 0 && (
          <Button variant="secondary" onClick={onReset}>
            {t('sidebar.reset')}
          </Button>
        )}
      </div>
    </Card>
  );
}
