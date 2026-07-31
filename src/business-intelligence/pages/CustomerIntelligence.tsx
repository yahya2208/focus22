import { useState, useEffect } from 'react';
import { createBusinessAPI, type BusinessAPI } from '../api';
import type { CustomerProfile, Opportunity } from '../types';
import { useThemeColors } from '../../hooks/useThemeColors';

const api: BusinessAPI = createBusinessAPI();

export function CustomerIntelligence() {
  const colors = useThemeColors();
  const [customers, setCustomers] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    api.getCustomerList().then(setCustomers);
  }, []);

  useEffect(() => {
    if (selectedId) {
      api.getCustomerProfile(selectedId).then(setProfile);
    }
  }, [selectedId]);

  return (
    <div style={{ display: 'flex', gap: '12px', height: 'calc(100vh - 120px)' }}>
      {/* Customer List */}
      <div style={{
        width: '300px', flexShrink: 0, overflowY: 'auto',
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '8px',
      }}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 8px' }}>الزوار</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {customers.map(c => (
            <button
              key={c.userId}
              onClick={() => setSelectedId(c.userId)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', borderRadius: '8px', border: 'none',
                background: selectedId === c.userId ? colors.bgHover : 'transparent',
                color: selectedId === c.userId ? colors.accent : colors.text,
                cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right',
                fontFamily: 'inherit',
              }}
            >
              <div>
                <div>{c.displayName}</div>
                <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>
                  {c.visitCount} زيارات · {c.gameCount} ألعاب
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {c.tradeRequested && <span style={{ color: colors.success, fontSize: '0.65rem' }}>استبدال</span>}
                {c.whatsappClicked && <span style={{ color: colors.success, fontSize: '0.65rem' }}>واتساب</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Profile Detail */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!profile ? (
          <div style={{ color: colors.textMuted, textAlign: 'center', padding: '4rem' }}>
            اختر زائرا لعرض ملفه الكامل
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Profile Header */}
            <div style={{
              background: colors.bgCard, border: `1px solid ${colors.border}`,
              borderRadius: '12px', padding: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>{profile.displayName}</h2>
                  <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '4px' }}>ID: {profile.userId}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {profile.tradeRequested && <span style={{ background: colors.successBg, color: colors.success, padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>طلب استبدال</span>}
                  {profile.returnedAfterWeek && <span style={{ background: colors.infoBg, color: colors.info, padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>عاد بعد أسبوع</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', marginTop: '12px' }}>
                {[
                  { label: 'أول زيارة', value: new Date(profile.firstVisit).toLocaleDateString('ar') },
                  { label: 'آخر زيارة', value: new Date(profile.lastVisit).toLocaleDateString('ar') },
                  { label: 'عدد الزيارات', value: profile.totalVisits },
                  { label: 'عدد الألعاب', value: profile.totalGames },
                  { label: 'أفضل نتيجة', value: profile.bestFocusScore.toFixed(1) },
                  { label: 'متوسط التركيز', value: profile.avgFocusScore.toFixed(1) },
                  { label: 'متوسط RT', value: `${profile.avgReactionTime}ms` },
                  { label: 'الهاتف', value: `${profile.deviceBrand} ${profile.deviceModel}` },
                  { label: 'ضغطات واتساب', value: profile.whatsappClickCount },
                  { label: 'مشاهدة عرض', value: profile.tradeOfferViewCount },
                  { label: 'طلب استبدال', value: profile.tradeRequested ? 'نعم' : 'لا' },
                  { label: 'آخر حملة', value: profile.lastCampaign ?? '—' },
                ].map(item => (
                  <div key={item.label} style={{ background: colors.bgInput, borderRadius: '6px', padding: '6px 10px' }}>
                    <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{item.label}</div>
                    <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div style={{
              background: colors.bgCard, border: `1px solid ${colors.border}`,
              borderRadius: '12px', padding: '16px',
            }}>
              <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>Timeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {profile.timeline.slice(0, 50).map((entry, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                    padding: '6px 0', borderBottom: i < profile.timeline.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                  }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', marginTop: '4px',
                      background: entry.eventType.includes('complete') || entry.eventType.includes('granted')
                        ? colors.success : entry.eventType.includes('failed') || entry.eventType.includes('abandon')
                        ? colors.danger : colors.info,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: colors.text, fontSize: '0.8rem' }}>{entry.eventType}</div>
                      <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>
                        {new Date(entry.timestamp).toLocaleString('ar')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sessions Table */}
            <div style={{
              background: colors.bgCard, border: `1px solid ${colors.border}`,
              borderRadius: '12px', padding: '16px',
            }}>
              <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>الجلسات</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {profile.sessions.slice(0, 20).map(s => (
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '100px 60px 60px 60px 60px 60px auto',
                    gap: '8px', padding: '6px 10px', borderRadius: '6px',
                    background: colors.bgInput, alignItems: 'center', fontSize: '0.75rem',
                  }}>
                    <span style={{ color: colors.textMuted }}>{new Date(s.createdAt).toLocaleDateString('ar')}</span>
                    <span style={{ color: s.status === 'completed' ? colors.success : colors.danger }}>{s.status}</span>
                    <span style={{ color: colors.text }}>{s.avgRt}ms</span>
                    <span style={{ color: colors.text }}>{s.focusScore}</span>
                    <span style={{ color: colors.accent }}>{s.grade}</span>
                    <span style={{ color: colors.textMuted }}>{s.consistencyRating}</span>
                    <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{s.campaignSource ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
