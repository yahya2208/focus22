import { memo } from 'react';
import focusIcon from '../../assets/brand/focus-icon.svg';
import { useThemeColors } from '../../hooks/useThemeColors';

export interface BrandLogoProps {
  size?: number;
  showText?: boolean;
  showSubtitle?: boolean;
  subtitle?: string;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
}

export const BrandLogo = memo(function BrandLogo({
  size = 44,
  showText = true,
  showSubtitle = false,
  subtitle,
  align = 'left',
  style,
}: BrandLogoProps) {
  const colors = useThemeColors();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}>
      <img
        src={focusIcon}
        alt="FOCUS"
        width={size}
        height={size}
        draggable={false}
        style={{
          display: 'block',
          borderRadius: Math.round(size * 0.22),
          boxShadow: `0 4px 20px ${colors.accentGlow}`,
          flexShrink: 0,
        }}
      />
      {showText && (
        <div style={{ textAlign: align, lineHeight: 1 }}>
          <span style={{
            fontSize: size * 0.45,
            fontWeight: 800,
            color: colors.text,
            letterSpacing: '-0.02em',
            display: 'block',
          }}>
            FOCUS
          </span>
          {showSubtitle && (
            <span style={{
              display: 'block',
              fontSize: Math.max(8, Math.round(size * 0.19)),
              color: colors.textMuted,
              letterSpacing: '0.16em',
              fontWeight: 500,
              marginTop: 4,
              textTransform: 'uppercase' as const,
            }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
