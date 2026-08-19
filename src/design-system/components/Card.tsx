import { memo, useCallback, useRef, type ReactNode, type HTMLAttributes } from 'react';
import { useCardRecipe } from '../useTokens';
import { type SpacingToken } from '../spacing';
import { shadows, type ShadowToken } from '../shadows';
import { motion } from '../motion';

export type CardVariant = 'surface' | 'glass' | 'outlined' | 'elevated' | 'interactive';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: SpacingToken | string;
  shadow?: ShadowToken;
  radius?: string;
  hoverable?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
}

export const Card = memo(function Card({
  variant = 'surface',
  padding = 'lg',
  shadow,
  radius,
  hoverable = false,
  onClick,
  children,
  style,
  ...rest
}: CardProps) {
  const recipe = useCardRecipe(variant, padding, radius);
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if ((hoverable || variant === 'interactive') && ref.current) {
      if (recipe.hoverShadow) ref.current.style.boxShadow = recipe.hoverShadow;
      if (recipe.hoverTransform) ref.current.style.transform = recipe.hoverTransform;
      if (recipe.hoverBg) ref.current.style.background = recipe.hoverBg;
      if (recipe.hoverBorder) ref.current.style.border = recipe.hoverBorder;
    }
  }, [hoverable, variant, recipe]);

  const handleMouseLeave = useCallback(() => {
    if ((hoverable || variant === 'interactive') && ref.current) {
      ref.current.style.boxShadow = shadow ? (shadows[shadow] ?? shadow) : 'none';
      ref.current.style.transform = 'translateY(0)';
      ref.current.style.background = recipe.background;
      ref.current.style.border = recipe.border;
    }
  }, [hoverable, variant, recipe, shadow]);

  return (
    <div
      ref={ref}
      {...rest}
      {...(onClick ? { onClick, role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } } : {})}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        borderRadius: recipe.radius,
        padding: recipe.padding,
        transition: `${motion.fast}, transform 0.2s ease`,
        background: recipe.background,
        border: recipe.border,
        backdropFilter: recipe.backdropFilter,
        WebkitBackdropFilter: recipe.backdropFilter,
        cursor: onClick || variant === 'interactive' ? 'pointer' : undefined,
        ...(shadow ? { boxShadow: shadows[shadow] ?? shadow } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
});
