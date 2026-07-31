import { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ActionButton {
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  onClick: () => void;
}

interface ActionCardProps {
  title: string;
  subtitle?: string;
  value?: string;
  valueLabel?: string;
  children?: React.ReactNode;
  actions?: ActionButton[];
  badge?: { label: string; color: string };
  expanded?: boolean;
}

export function ActionCard({ title, subtitle, value, valueLabel, children, actions, badge, expanded: defaultExpanded }: ActionCardProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  const variantColors: Record<string, { bg: string; text: string }> = {
    primary: { bg: colors.accent, text: '#fff' },
    secondary: { bg: colors.bgInput, text: colors.text },
    danger: { bg: '#e74c3c', text: '#fff' },
    success: { bg: colors.success, text: '#fff' },
  };

  return (
    <div style={{
      background: colors.bgCard,
      border: `1px solid ${badge ? badge.color + '40' : colors.border}`,
      borderRadius: '12px',
      padding: '14px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }}
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {badge && (
              <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700,
                background: badge.color + '20', color: badge.color,
              }}>
                {badge.label}
              </span>
            )}
            <span style={{ color: colors.text, fontSize: '0.88rem', fontWeight: 600 }}>{title}</span>
          </div>
          {subtitle && <div style={{ color: colors.textSecondary, fontSize: '0.78rem', marginTop: '3px' }}>{subtitle}</div>}
          {value && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: colors.accent }}>{value}</span>
              {valueLabel && <span style={{ fontSize: '0.7rem', color: colors.textMuted }}>{valueLabel}</span>}
            </div>
          )}
        </div>
        <span style={{ color: colors.textMuted, fontSize: '0.8rem', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : '' }}>
          ▼
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '12px', borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
          {children}
          {actions && actions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {actions.map((action, i) => {
                const vc = variantColors[action.variant ?? 'primary'] ?? { bg: colors.accent, text: '#fff' };
                return (
                  <button key={i} onClick={(e) => { e.stopPropagation(); action.onClick(); }} style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '6px 14px', borderRadius: '6px', border: 'none',
                    background: vc.bg, color: vc.text, fontSize: '0.74rem',
                    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {action.icon && <span>{action.icon}</span>}
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {children}
    </div>
  );
}
