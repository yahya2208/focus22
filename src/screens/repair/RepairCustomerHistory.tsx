import { useState, useEffect, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, HStack, Grid } from '../../design-system/layout';
import { getRepairRepository } from '../../services/repair/repair-repository';
import type { RepairRequest, RepairIssue, RepairCustomerProfile } from '../../services/repair/repair-types';
import { AlgerianPhoneInput } from '../../components/forms/AlgerianPhoneInput';

const STATUS_ARABIC: Record<string, string> = {
  'Pending': 'بانتظار المعاينة',
  'Received': 'تم الاستلام',
  'Diagnosing': 'قيد التشخيص',
  'Waiting Parts': 'بانتظار القطع',
  'Repairing': 'قيد التصليح',
  'Ready': 'جاهز',
  'Delivered': 'تم التسليم',
  'Cancelled': 'ملغي',
};

function buildCustomerProfile(phone: string, all: RepairRequest[]): RepairCustomerProfile | null {
  const customerRequests = all.filter(r => r.customerPhone === phone);
  if (customerRequests.length === 0) return null;

  const name = customerRequests[0]!.customerName;
  const total = customerRequests.length;
  const completed = customerRequests.filter(r => r.status === 'Delivered').length;
  const failed = customerRequests.filter(r => r.status === 'Cancelled').length;
  const sorted = [...customerRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const brandCounts: Record<string, { brand: string; model: string; count: number }> = {};
  const issueCounts: Record<string, number> = {};
  customerRequests.forEach(r => {
    const key = `${r.brandName}||${r.modelName}`;
    if (!brandCounts[key]) brandCounts[key] = { brand: r.brandName, model: r.modelName, count: 0 };
    brandCounts[key].count++;
    issueCounts[r.issue] = (issueCounts[r.issue] || 0) + 1;
  });

  const mostRepaired = Object.values(brandCounts).sort((a, b) => b.count - a.count)[0] || null;
  const mostIssue = Object.entries(issueCounts).sort((a, b) => b[1] - a[1])[0];
  const last = sorted[0];

  return {
    customerPhone: phone,
    customerName: name,
    totalRepairs: total,
    completedRepairs: completed,
    failedRepairs: failed,
    totalPaid: 0,
    averageRepairCost: 0,
    mostRepairedPhone: mostRepaired,
    mostCommonIssue: (mostIssue ? mostIssue[0] : null) as RepairIssue | null,
    lastRepair: last ? { repairCode: last.repairCode, status: last.status, createdAt: last.createdAt } : null,
    repairSuccessRate: total > 0 ? (completed / (total - (customerRequests.filter(r => r.status === 'Pending').length || 1))) * 100 : 0,
    repairIds: customerRequests.map(r => r.id),
  };
}

export const RepairCustomerHistory = memo(function RepairCustomerHistory() {
  const dispatch = useAppDispatch();
  const { t: translate, dir } = useTranslation();
  const t = translate as (key: string) => string;
  const colors = useThemeColors();

  const [phoneInput, setPhoneInput] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allRequests, setAllRequests] = useState<RepairRequest[]>([]);

  useEffect(() => {
    getRepairRepository().getAllRequests().then(setAllRequests);
  }, []);

  const profile = (() => {
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 8) return null;
    return buildCustomerProfile(digits, allRequests);
  })();

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '14px',
    border: `1px solid ${colors.borderLight}`, padding: '1rem',
    marginBottom: '0.75rem',
  };

  const statCardStyle: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '12px',
    border: `1px solid ${colors.borderLight}`, padding: '0.75rem',
    textAlign: 'center',
  };

  const getStatusColor = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warning, 'Received': colors.info,
      'Diagnosing': colors.info, 'Waiting Parts': colors.warning,
      'Repairing': colors.info, 'Ready': colors.success,
      'Delivered': colors.success, 'Cancelled': colors.danger,
    };
    return map[status] || colors.textMuted;
  };

  const getStatusBg = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warningBg, 'Received': colors.infoBg,
      'Diagnosing': colors.infoBg, 'Waiting Parts': colors.warningBg,
      'Repairing': colors.infoBg, 'Ready': colors.successBg,
      'Delivered': colors.successBg, 'Cancelled': colors.dangerBg,
    };
    return map[status] || colors.bgInput;
  };

  return (
    <Screen ariaLabel="Customer history" scroll>
      <div style={{ direction: dir }}>
        <h1 style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: '0 0 1rem' }}>
          {t('repair.customerHistory') || 'سجل العميل'}
        </h1>

        <div style={{ marginBottom: '1rem' }}>
          <AlgerianPhoneInput
            value={phoneInput}
            onChange={v => { setPhoneInput(v); setExpandedId(null); }}
            placeholder={t('repair.searchByPhone') || 'ابحث برقم الهاتف...'}
          />
        </div>

        {profile && (
          <>
            <div style={{ ...cardStyle, marginBottom: '1rem' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.text, marginBottom: '0.25rem' }}>
                {profile.customerName}
              </div>
              <div style={{ fontSize: '0.85rem', color: colors.textSecondary }}>
                {profile.customerPhone}
              </div>
            </div>

            <Grid columns={2} gap="sm" style={{ marginBottom: '1rem' }}>
              <div style={statCardStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.accent }}>{profile.totalRepairs}</div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.15rem' }}>
                  {t('repair.totalRepairs') || 'إجمالي التصليحات'}
                </div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.success }}>{profile.totalPaid} د.ج</div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.15rem' }}>
                  {t('repair.totalPaid') || 'المدفوع'}
                </div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.info }}>
                  {profile.repairSuccessRate.toFixed(1)}%
                </div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.15rem' }}>
                  {t('repair.successRate') || 'معدل النجاح'}
                </div>
              </div>
              <div style={statCardStyle}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.warning }}>{profile.averageRepairCost} د.ج</div>
                <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.15rem' }}>
                  {t('repair.averageCost') || 'متوسط التكلفة'}
                </div>
              </div>
            </Grid>

            <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '0.3rem' }}>
                {t('repair.mostRepairedPhone') || 'أكثر جهاز تم إصلاحه'}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text }}>
                {profile.mostRepairedPhone
                  ? `${profile.mostRepairedPhone.brand} ${profile.mostRepairedPhone.model} (${profile.mostRepairedPhone.count})`
                  : '-'
                }
              </div>
            </div>

            <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '0.3rem' }}>
                {t('repair.mostCommonIssue') || 'أكثر عطل شيوعاً'}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text }}>
                {profile.mostCommonIssue || '-'}
              </div>
            </div>

            {profile.lastRepair && (
              <div style={{ ...cardStyle, marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '0.3rem' }}>
                  {t('repair.lastRepair') || 'آخر تصليح'}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
                  {profile.lastRepair.repairCode}
                </div>
                <HStack gap="sm" style={{ marginTop: '0.2rem' }}>
                  <span style={{
                    padding: '0.15rem 0.6rem', borderRadius: '8px', fontSize: '0.7rem',
                    fontWeight: 600, fontFamily: 'inherit',
                    background: getStatusBg(profile.lastRepair.status),
                    color: getStatusColor(profile.lastRepair.status),
                  }}>
                    {STATUS_ARABIC[profile.lastRepair.status] || profile.lastRepair.status}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: colors.textFaint }}>
                    {new Date(profile.lastRepair.createdAt).toLocaleDateString('ar-SA')}
                  </span>
                </HStack>
              </div>
            )}

            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.text, marginBottom: '0.5rem' }}>
              {t('repair.allRepairs') || 'جميع التصليحات'}
            </div>

            {profile.repairIds.map(id => {
              const req = allRequests.find(r => r.id === id);
              if (!req) return null;
              const isExpanded = expandedId === req.id;

              return (
                <div key={req.id} style={cardStyle}>
                  <div
                    onClick={() => setExpandedId(prev => prev === req.id ? null : req.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <HStack justify="space-between" align="center" style={{ marginBottom: '0.3rem' }}>
                      <span style={{
                        background: colors.accentGlow, color: colors.accent,
                        padding: '0.15rem 0.6rem', borderRadius: '8px',
                        fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
                      }}>
                        {req.repairCode}
                      </span>
                      <span style={{
                        padding: '0.15rem 0.6rem', borderRadius: '8px', fontSize: '0.7rem',
                        fontWeight: 600, fontFamily: 'inherit',
                        background: getStatusBg(req.status), color: getStatusColor(req.status),
                      }}>
                        {STATUS_ARABIC[req.status] || req.status}
                      </span>
                    </HStack>
                    {isExpanded && (
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${colors.borderLight}` }}>
                        <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.15rem' }}>
                          {t('repair.device') || 'الجهاز'}: {req.brandName} {req.modelName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.15rem' }}>
                          {t('repair.issue') || 'العطل'}: {req.issue}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.15rem' }}>
                          {t('repair.description') || 'الوصف'}: {req.description || '-'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: colors.textFaint }}>
                          {new Date(req.createdAt).toLocaleDateString('ar-SA')}
                        </div>
                      </div>
                    )}
                    {!isExpanded && (
                      <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                        {req.brandName} {req.modelName} • {req.issue}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {phoneInput.replace(/\D/g, '').length >= 8 && !profile && (
          <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted, fontSize: '0.85rem' }}>
            {t('repair.noCustomerFound') || 'لم يتم العثور على عميل بهذا الرقم'}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '1rem' }}>
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })}
          style={{
            background: 'none',
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '14px',
            padding: '0.75rem 2rem',
            color: colors.textMuted,
            fontSize: '0.9rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {dir === 'rtl' ? '← العودة للوحة الصيانة' : '← Back to Repair'}
        </button>
      </div>
    </Screen>
  );
});
