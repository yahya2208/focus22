import { memo, type ReactNode, type ElementType } from 'react';
import { useColors } from '../useTokens';
import { typography, type TypographyToken } from '../typography';

export type TextVariant = TypographyToken;
export type TextColor = 'primary' | 'secondary' | 'muted' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'inherit';

export interface TextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: 'left' | 'center' | 'right';
  as?: ElementType;
  children: ReactNode;
  style?: React.CSSProperties;
}

const colorMap: Record<TextColor, (c: ReturnType<typeof useColors>) => string> = {
  primary: (c) => c.text,
  secondary: (c) => c.textSecondary,
  muted: (c) => c.textMuted,
  accent: (c) => c.accent,
  success: (c) => c.success,
  warning: (c) => c.warning,
  danger: (c) => c.danger,
  info: (c) => c.info,
  inherit: () => 'inherit',
};

const ffMap: Partial<Record<TextVariant, string>> = {
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export const Text = memo(function Text({
  variant = 'body',
  color = 'primary',
  align,
  as: Tag = 'span',
  children,
  style,
}: TextProps) {
  const colors = useColors();
  const token = typography[variant] as Record<string, string>;
  return (
    <Tag
      style={{
        fontFamily: ffMap[variant],
        fontSize: token.fontSize,
        fontWeight: token.fontWeight,
        lineHeight: token.lineHeight,
        letterSpacing: token.letterSpacing,
        color: colorMap[color](colors),
        textAlign: align,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
});
