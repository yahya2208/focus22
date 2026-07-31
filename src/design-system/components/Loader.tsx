import { memo } from 'react';
import { useColors } from '../useTokens';

export type LoaderSize = 'sm' | 'md' | 'lg';

export interface LoaderProps {
  size?: LoaderSize;
  color?: 'accent' | 'current';
  style?: React.CSSProperties;
}

const sizeMap: Record<LoaderSize, string> = {
  sm: '16px',
  md: '24px',
  lg: '36px',
};

export const Loader = memo(function Loader({
  size = 'md',
  color = 'accent',
  style,
}: LoaderProps) {
  const colors = useColors();
  const dim = sizeMap[size];
  const borderWidth = size === 'sm' ? '2px' : '3px';

  return (
    <div
      aria-busy="true"
      role="status"
      aria-label="Loading"
      style={{
        width: dim,
        height: dim,
        border: `${borderWidth} solid ${color === 'current' ? 'currentColor' : colors.accent}22`,
        borderTopColor: color === 'current' ? 'currentColor' : colors.accent,
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
        ...style,
      }}
    />
  );
});
