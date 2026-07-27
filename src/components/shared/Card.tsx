import type { ReactNode } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface CardProps {
  children: ReactNode;
  padding?: string;
  elevated?: boolean;
  glass?: boolean;
  glow?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, padding = '1.5rem', elevated = true, glass = true, glow = false, style }: CardProps) {
  const colors = useThemeColors();
  return (
    <div
      role="region"
      style={{
        background: glass ? colors.glass : colors.bgCard,
        borderRadius: '20px',
        padding,
        boxShadow: glow
          ? `0 4px 24px ${colors.accentGlow}, 0 0 60px ${colors.accentGlow}`
          : elevated
            ? `0 4px 16px ${colors.shadow}`
            : 'none',
        border: `1px solid ${colors.glassBorder}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        transition: 'box-shadow 0.3s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface GlassCardProps {
  children: ReactNode;
  padding?: string;
  style?: React.CSSProperties;
}

export function GlassCard({ children, padding = '1.25rem', style }: GlassCardProps) {
  const colors = useThemeColors();
  return (
    <div
      role="region"
      style={{
        background: `linear-gradient(135deg, ${colors.glass} 0%, ${colors.glass} 100%)`,
        borderRadius: '20px',
        padding,
        border: `1px solid ${colors.glassBorder}`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
