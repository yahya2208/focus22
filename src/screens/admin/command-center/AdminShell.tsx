import { memo, type ReactNode } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useAuth } from '../../../core/auth/AuthProvider';
import { useMediaQuery } from '../../../design-system/responsive';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { AdminContent } from './AdminContent';

/**
 * Command shell (G1): sidebar (right in RTL by DOM order) + header + content.
 * Desktop-first flex row; collapses to a top nav strip under 900px via the
 * same block restyled — no duplicate navigation trees.
 */
export const AdminShell = memo(function AdminShell({
  active,
  onNavigate,
  children,
}: {
  active: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state } = useAuth();
  const narrow = useMediaQuery('(max-width: 900px)');
  const userLabel = state.user?.displayName || state.user?.email || state.user?.id || t('cc.adminFallback');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: narrow ? 'column' : 'row',
        minHeight: '100dvh',
        background: colors.bg,
        color: colors.text,
        boxSizing: 'border-box',
      }}
    >
      {narrow ? (
        <AdminSidebar active={active} onNavigate={onNavigate} userLabel={userLabel} layout="top" />
      ) : (
        <AdminSidebar active={active} onNavigate={onNavigate} userLabel={userLabel} layout="side" />
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: narrow ? '1rem 1rem 0' : '1.6rem 2rem 0', maxWidth: 1180, width: '100%', marginInline: 'auto', boxSizing: 'border-box' }}>
          <AdminHeader userName={typeof userLabel === 'string' ? userLabel : t('cc.adminFallback')} />
        </div>
        <AdminContent>{children}</AdminContent>
      </div>
    </div>
  );
});
