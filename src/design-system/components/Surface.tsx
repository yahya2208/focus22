import { memo, type ReactNode } from 'react';
import { useColors } from '../useTokens';
import { radius as radiusToken, type RadiusToken } from '../radius';
import { spacing, type SpacingToken } from '../spacing';
import { elevation, type ElevationToken } from '../shadows';
import { motion } from '../motion';

export type SurfaceVariant = 'base' | 'raised' | 'overlay' | 'glass';

export interface SurfaceProps {
  variant?: SurfaceVariant;
  padding?: SpacingToken | string;
  radius?: RadiusToken | string;
  elevation?: ElevationToken;
  children: ReactNode;
  style?: React.CSSProperties;
}

const variantBg: Record<SurfaceVariant, (c: ReturnType<typeof useColors>) => string> = {
  base: (c) => c.bg,
  raised: (c) => c.bgSurface,
  overlay: (c) => c.bgOverlay,
  glass: (c) => c.glass,
};

export const Surface = memo(function Surface({
  variant = 'raised',
  padding = 'lg',
  radius = 'lg',
  elevation: elevationKey,
  children,
  style,
}: SurfaceProps) {
  const colors = useColors();
  const pad = padding in spacing ? spacing[padding as SpacingToken] : padding;
  const rad = radius in radiusToken ? radiusToken[radius as RadiusToken] : radius;

  return (
    <div
      style={{
        background: variantBg[variant](colors),
        border: variant === 'glass' ? `1px solid ${colors.glassBorder}` : variant === 'base' ? 'none' : `1px solid ${colors.border}`,
        borderRadius: rad,
        padding: pad,
        backdropFilter: variant === 'glass' ? 'blur(20px)' : undefined,
        WebkitBackdropFilter: variant === 'glass' ? 'blur(20px)' : undefined,
        boxShadow: elevationKey ? elevation[elevationKey] : undefined,
        transition: motion.fast,
        ...style,
      }}
    >
      {children}
    </div>
  );
});
