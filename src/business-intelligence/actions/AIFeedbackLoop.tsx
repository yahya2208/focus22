import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { generateId } from '../data-source';

interface FeedbackEntry {
  id: string;
  recId: string;
  recTitle: string;
  accepted: boolean;
  timestamp: string;
}

const STORAGE_KEY = 'bi_ai_feedback';

function loadFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FeedbackEntry[];
  } catch { /* ignore */ }
  return [];
}

function saveFeedback(feedback: FeedbackEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(feedback));
}

export function AIFeedbackLoop({ recommendations }: { recommendations: Array<{ id: string; title: string }> }) {
  const colors = useThemeColors();
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);

  useEffect(() => {
    setFeedback(loadFeedback());
  }, []);

  const recordFeedback = useCallback((recId: string, recTitle: string, accepted: boolean) => {
    setFeedback(prev => {
      const filtered = prev.filter(f => f.recId !== recId);
      const entry: FeedbackEntry = {
        id: generateId(),
        recId,
        recTitle,
        accepted,
        timestamp: new Date().toISOString(),
      };
      const next = [entry, ...filtered];
      saveFeedback(next);
      return next;
    });
  }, []);

  const hasVoted = (recId: string) => feedback.find(f => f.recId === recId);

  const totalFeedback = feedback.length;
  const acceptedCount = feedback.filter(f => f.accepted).length;
  const rejectedCount = totalFeedback - acceptedCount;
  const acceptanceRate = totalFeedback > 0 ? Math.round((acceptedCount / totalFeedback) * 100) : 0;

  const recentEntries = [...feedback].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>حلقة التغذية الراجعة للذكاء الاصطناعي</h2>
        <span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>
          {totalFeedback} تقييم
        </span>
      </div>

      {recommendations.map(rec => {
        const voted = hasVoted(rec.id);
        return (
          <div key={rec.id} style={{
            background: colors.bgCard, border: `1px solid ${colors.border}`,
            borderRadius: '12px', padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 500 }}>{rec.title}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => recordFeedback(rec.id, rec.title, true)}
                style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                  background: voted?.accepted ? colors.success : colors.bgInput,
                  color: voted?.accepted ? '#000' : colors.textSecondary,
                  transition: 'all 0.2s',
                }}
              >
                👍 استفدت
              </button>
              <button
                onClick={() => recordFeedback(rec.id, rec.title, false)}
                style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                  background: voted && !voted.accepted ? colors.danger : colors.bgInput,
                  color: voted && !voted.accepted ? '#fff' : colors.textSecondary,
                  transition: 'all 0.2s',
                }}
              >
                👎 لا
              </button>
            </div>
          </div>
        );
      })}

      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '14px 16px',
      }}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 10px 0' }}>إحصائيات التغذية الراجعة</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>معدل القبول</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colors.accent, marginTop: '2px' }}>{acceptanceRate}%</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>مقبول</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colors.success, marginTop: '2px' }}>{acceptedCount}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>مرفوض</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colors.danger, marginTop: '2px' }}>{rejectedCount}</div>
          </div>
        </div>
        <div style={{
          height: '6px', borderRadius: '3px', background: colors.progressBg, overflow: 'hidden',
        }}>
          <div style={{
            width: `${acceptanceRate}%`, height: '100%',
            borderRadius: '3px', background: colors.accent,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {recentEntries.length > 0 && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '12px', padding: '14px 16px',
        }}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 10px 0' }}>آخر النشاطات</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentEntries.map(entry => (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '6px 10px', borderRadius: '8px',
                background: colors.bgHover,
              }}>
                <span style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: entry.accepted ? colors.success : colors.danger,
                  flexShrink: 0,
                }} />
                <span style={{ flex: 1, color: colors.text, fontSize: '0.78rem' }}>
                  {entry.recTitle}
                </span>
                <span style={{
                  color: entry.accepted ? colors.successText : colors.dangerText,
                  fontSize: '0.7rem', fontWeight: 600,
                }}>
                  {entry.accepted ? 'مقبول' : 'مرفوض'}
                </span>
                <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>
                  {new Date(entry.timestamp).toLocaleDateString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
