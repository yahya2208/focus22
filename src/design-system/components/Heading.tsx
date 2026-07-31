import { memo, type ReactNode } from 'react';
import { useColors } from '../useTokens';
import { typography } from '../typography';

export type HeadingVariant = 'h1' | 'h2' | 'h3' | 'display';

export interface HeadingProps {
  variant?: HeadingVariant;
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
  style?: React.CSSProperties;
}

const headingMap: Record<HeadingVariant, { tag: 'h1' | 'h2' | 'h3' | 'h1'; token: keyof typeof typography }> = {
  display: { tag: 'h1', token: 'display' },
  h1: { tag: 'h1', token: 'h1' },
  h2: { tag: 'h2', token: 'h2' },
  h3: { tag: 'h3', token: 'h3' },
};

export const Heading = memo(function Heading({
  variant = 'h1',
  align,
  children,
  style,
}: HeadingProps) {
  const colors = useColors();
  const { tag: Tag, token: tokenKey } = headingMap[variant];
  const t = typography[tokenKey] as Record<string, string>;
  return (
    <Tag
      style={{
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        color: colors.text,
        textAlign: align,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
});
