import { useState, useEffect, useCallback, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, HStack, Stack } from '../../design-system/layout';
import { getRepairRepository } from '../../services/repair/repair-repository';

interface HealthResult {
  connected: boolean;
  tables: Record<string, boolean>;
  error?: string;
}

export const RepairDiagnosticsScreen = memo(function RepairDiagnosticsScreen() {
  const dispatch = useAppDispatch();
  const colors = useThemeColors();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [running, setRunning] = useState(true);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const repo = getRepairRepository();
    const health = await repo.getHealth();
    setHealth({
      connected: health.connected,
      tables: health.tables,
      error: health.error,
    });
    setRequestCount(health.localStorageCount >= 0 ? health.localStorageCount : -1);
    setRunning(false);
  }, []);

  useEffect(() => { runDiagnostics(); }, [runDiagnostics]);

  const overallOk = health?.connected && Object.values(health?.tables ?? {}).every(Boolean);

  const card: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '14px',
    border: `1px solid ${colors.borderLight}`, padding: '1rem',
    marginBottom: '0.75rem',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 600, color: colors.textSecondary,
    marginBottom: '0.25rem', fontFamily: 'inherit',
  };

  const green = '#22c55e';
  const red = '#ef4444';
  const yellow = '#eab308';

  const statusDot = (ok: boolean | undefined, label: string) => (
    <HStack gap="sm" align="center" style={{ marginBottom: '0.35rem' }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
        background: ok === undefined ? yellow : ok ? green : red,
      }} />
      <span style={{ fontSize: '0.8rem', color: colors.text, fontFamily: 'inherit' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.7rem', color: colors.textMuted, fontFamily: 'inherit' }}>
        {ok === undefined ? '⏳' : ok ? '✅' : '❌'}
      </span>
    </HStack>
  );

  const tableLabel: Record<string, string> = {
    repair_requests: 'طلبات التصليح',
    repair_quotes: 'عروض السعر',
    repair_timeline: 'الجدول الزمني',
    repair_courier_jobs: 'مهام المندوبين',
    repair_notifications: 'الإشعارات',
    repair_photos: 'الصور',
    repair_status_history: 'سجل الحالات',
    repair_audit_log: 'سجل التدقيق',
    users: 'المستخدمين',
  };

  return (
    <Screen ariaLabel="Repair diagnostics" scroll>
      <Stack gap="lg">
        <div>
          <h1 style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: '0 0 1rem' }}>
            تشخيص النظام
          </h1>

          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>
              حالة الاتصال
            </div>
            {statusDot(health?.connected, health?.connected ? 'متصل بـ Supabase' : 'غير متصل')}
            {health?.error && (
              <div style={{ fontSize: '0.75rem', color: red, marginTop: '0.3rem', fontFamily: 'inherit' }}>
                {health.error}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>
              جداول قاعدة البيانات
            </div>
            {running ? (
              <div style={{ fontSize: '0.8rem', color: colors.textMuted, fontFamily: 'inherit' }}>
                جاري الفحص...
              </div>
            ) : (
              Object.entries(health?.tables ?? {}).map(([table, ok]) => (
                <div key={table}>
                  {statusDot(ok, tableLabel[table] || table)}
                </div>
              ))
            )}
          </div>

          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>
              إحصائيات
            </div>
            <div style={{ fontSize: '0.85rem', color: colors.text, fontFamily: 'inherit' }}>
              عدد طلبات التصليح: {requestCount >= 0 ? requestCount : '⚠️ فشل التحميل'}
            </div>
          </div>

          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>
              التشخيص العام
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
              color: overallOk ? green : red }}>
              {overallOk ? '✅ جميع الأنظمة تعمل بشكل طبيعي' : '⚠️ توجد مشاكل في بعض الأنظمة'}
            </div>
          </div>

          <button
            onClick={runDiagnostics}
            disabled={running}
            style={{
              width: '100%', padding: '0.85rem', borderRadius: '14px', border: 'none',
              background: colors.accent, color: '#fff', fontSize: '0.9rem',
              fontWeight: 600, fontFamily: 'inherit', cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.6 : 1, marginTop: '0.5rem',
            }}
          >
            {running ? 'جاري التشخيص...' : 'إعادة التشخيص'}
          </button>
        </div>

        <div style={{ textAlign: 'center', paddingBottom: '1rem' }}>
          <button
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })}
            style={{
              background: 'none', border: `1px solid ${colors.borderLight}`,
              borderRadius: '14px', padding: '0.75rem 2rem',
              color: colors.textMuted, fontSize: '0.9rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            العودة للوحة الصيانة
          </button>
        </div>
      </Stack>
    </Screen>
  );
});
