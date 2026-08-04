import { memo, type ReactNode, type CSSProperties } from 'react';
import { useBadgeRecipe } from '../useTokens';
import { spacing } from '../spacing';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'processing' | 'running' | 'completed' | 'pending';

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  style?: React.CSSProperties;
}

export const Badge = memo(function Badge({
  variant = 'neutral',
  dot = false,
  children,
  style,
}: BadgeProps) {
  const recipe = useBadgeRecipe(variant);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: recipe.padding,
        fontSize: recipe.fontSize,
        fontWeight: recipe.fontWeight as CSSProperties['fontWeight'],
        borderRadius: recipe.radius,
        background: recipe.background,
        color: recipe.color,
        border: recipe.border,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: recipe.dotBg,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  );
});
