import { memo, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import type { TranslationKey } from '../../i18n';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { loadAchievements, getCompletedChallengeCount, type Achievement } from '../../core/gamification';

const ANIM_KEYFRAMES = `
@keyframes badgePop { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.08  );
}); 100% { transform: scale(1); opacity: 1; } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
`;

type Category = 'all' | Achievement['category'];

const CATEGORIES: { id: Category; labelKey: TranslationKey }[] = [
  { id: 'all', labelKey: 'achievements.all' },
  { id: 'milestone', labelKey: 'achievements.milestone' },
  { id: 'speed', labelKey: 'achievements.speed' },
  { id: 'consistency', labelKey: 'achievements.consistency' },
  { id: 'challenge', labelKey: 'achievements.challenge' },
  { id: 'streak', labelKey: 'achievements.streak' },
];

function AchievementBadge({ achievement, index }: { achievement: Achievement; index: number }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const unlocked = !!achievement.unlockedAt;

  return (
    <div style={{
      background: unlocked ? colors.glass : `${colors.glass}66`,
      border: `1px solid ${unlocked ? colors.accent + '33' : colors.glassBorder}`,
      borderRadius: '14px',
      padding: '0.85rem',
      opacity: unlocked ? 1 : 0.45,
      animation: `badgePop 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 50}ms both`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {unlocked && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: `linear-gradient(90deg, transparent, ${colors.accent}66, transparent)`,
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <span style={{
          fontSize: '1.5rem',
          filter: unlocked ? 'none' : 'grayscale(1)',
          width: '36px', height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: unlocked ? `${colors.accent}15` : colors.progressBg,
          borderRadius: '10px', flexShrink: 0,
        }}>
          {achievement.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            color: unlocked ? colors.text : colors.textFaint,
            fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.1rem',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {achievement.title}
          </p>
          <p style={{
            color: colors.textMuted, fontSize: '0.65rem', margin: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {achievement.description}
          </p>
        </div>
        {unlocked && (
          <span style={{
            color: colors.accent, fontSize: '0.55rem', fontWeight: 700,
            textTransform: 'uppercase' as const, letterSpacing: '0.05em',
            background: `${colors.accent}15`,
            padding: '0.15rem 0.4rem', borderRadius: '6px',
            flexShrink: 0,
          }}>
            {t('achievements.unlocked')}
          </span>
        )}
      </div>
    </div>
  );
}

export const AchievementsScreen = memo(function AchievementsScreen() {
  const dispatch = useAppDispatch();
  const { sessions } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  const achievements = useMemo(() => loadAchievements(), []);
  const completedChallenges = getCompletedChallengeCount();
  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return achievements;
    return achievements.filter((a) => a.category === activeCategory);
  }, [achievements, activeCategory]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM_KEYFRAMES }} />
      <nav aria-label="Achievements" style={{ padding: '2rem 1.5rem', maxWidth: '480px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 'bold', color: colors.text, margin: 0 }}>{t('achievements.pageTitle')}</h1>
          <span style={{
            color: colors.textFaint, fontSize: '0.7rem',
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '8px', padding: '0.25rem 0.5rem',
          }}>{unlockedCount}/{achievements.length}</span>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {[
            { labelKey: 'achievements.unlocked' as TranslationKey, value: `${unlockedCount}`, color: colors.accent },
            { labelKey: 'achievements.challenges' as TranslationKey, value: `${completedChallenges}`, color: colors.success },
            { labelKey: 'achievements.sessions' as TranslationKey, value: `${sessions.length}`, color: colors.warning },
          ].map(({ labelKey, value, color }: { labelKey: TranslationKey; value: string; color: string }) => (
            <div key={labelKey} style={{
              background: colors.glass, border: `1px solid ${colors.glassBorder}`,
              borderRadius: '12px', padding: '0.6rem', textAlign: 'center',
            }}>
              <p style={{ color: colors.textMuted, fontSize: '0.55rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 0.15rem' }}>{t(labelKey)}</p>
              <p style={{ color, fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '2px' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '0.35rem 0.7rem',
                borderRadius: '9999px',
                border: activeCategory === cat.id ? `1px solid ${colors.accent}44` : `1px solid ${colors.glassBorder}`,
                background: activeCategory === cat.id ? colors.accent : colors.glass,
                color: activeCategory === cat.id ? '#fff' : colors.textMuted,
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: activeCategory === cat.id ? 600 : 400,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {t(cat.labelKey)}
            </button>
          ))}
        </div>

        {/* Achievement list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {filtered.map((a, i) => (
            <AchievementBadge key={a.id} achievement={a} index={i} />
          ))}
        </div>

        <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ width: '100%' }}>
          {t('coach.backToHome')}
        </Button>
      </nav>
    </>
  );
});
