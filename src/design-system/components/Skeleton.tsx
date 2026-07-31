import { memo } from 'react';
import { useColors } from '../useTokens';
import { radius as radiusToken, type RadiusToken } from '../radius';
import { motion } from '../motion';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  radius?: RadiusToken | string;
  style?: React.CSSProperties;
}

export const Skeleton = memo(function Skeleton({
  variant = 'text',
  width,
  height,
  radius = 'sm',
  style,
}: SkeletonProps) {
  const colors = useColors();
  const rad = radius in radiusToken ? radiusToken[radius as RadiusToken] : radius;

  const dims: React.CSSProperties = variant === 'circle'
    ? { width: width ?? '40px', height: height ?? '40px', borderRadius: '50%' }
    : variant === 'text'
      ? { width: width ?? '100%', height: height ?? '14px', borderRadius: rad }
      : { width: width ?? '100%', height: height ?? '80px', borderRadius: rad };

  return (
    <div
      aria-hidden="true"
      style={{
        background: colors.glassBorder,
        animation: `pulse 1.5s ${motion.easeIn} infinite`,
        ...dims,
        ...style,
      }}
    />
  );
});
