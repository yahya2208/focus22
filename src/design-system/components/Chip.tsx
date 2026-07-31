import { memo, type ReactNode } from 'react';
import { useColors } from '../useTokens';
import { radius } from '../radius';
import { spacing } from '../spacing';
import { fontSize, fontWeight } from '../typography';
import { motion } from '../motion';

export type ChipVariant = 'filter' | 'tag' | 'selectable' | 'clickable' | 'status';

export interface ChipProps {
  variant?: ChipVariant;
  selected?: boolean;
  onSelect?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  style?: React.CSSProperties;
}

export const Chip = memo(function Chip({
  variant = 'tag',
  selected = false,
  onSelect,
  children,
  icon,
  style,
}: ChipProps) {
  const colors = useColors();
  const isInteractive = variant === 'filter' || variant === 'selectable' || variant === 'clickable';

  const bg = selected ? colors.accentMuted : colors.bgSurface;
  const border = selected ? `1px solid ${colors.accent}40` : `1px solid ${colors.border}`;
  const textColor = selected ? colors.accent : colors.textSecondary;

  return (
    <span
      {...(isInteractive && onSelect ? {
        onClick: onSelect,
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSelect(); },
      } : {})}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: spacing.xs,
        padding: `4px ${spacing.sm}`,
        borderRadius: radius.pill,
        fontSize: fontSize.label, fontWeight: fontWeight.medium,
        background: bg, color: textColor,
        border,
        cursor: isInteractive ? 'pointer' : 'default',
        transition: motion.fast,
        userSelect: 'none',
        ...style,
      }}
    >
      {icon && <span style={{ display: 'inline-flex', fontSize: '0.75em' }}>{icon}</span>}
      {children}
      {(variant === 'filter' || variant === 'tag') && (
        <span style={{ marginLeft: spacing.xs, opacity: 0.5 }}>×</span>
      )}
    </span>
  );
});
