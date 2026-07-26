import type { ReactNode } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface CardProps {
  children: ReactNode;
  padding?: string;
  elevated?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, padding = '1.5rem', elevated = true, style }: CardProps) {
  const colors = useThemeColors();
  return (
    <div
      role="region"
      style={{
        background: colors.bgCard,
        borderRadius: '12px',
        padding,
        boxShadow: elevated ? `0 4px 12px ${colors.shadow}` : 'none',
        border: `1px solid ${colors.border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
