import { type ReactNode } from 'react';
import { spacing, type SpacingToken } from '../tokens';
import { useColors } from '../useTokens';

// ============================================================================
// Spacer — Flex grow/shrink spacer
// ============================================================================
//
// Pushes adjacent elements apart in a flex container.
//
// Usage:
//   <HStack>
//     <Text>Left</Text>
//     <Spacer />
//     <Text>Right</Text>
//   </HStack>
//
//   <Spacer size="lg" />  {/* fixed vertical space */}
//
// ============================================================================

export interface SpacerProps {
  /** Fixed size (if provided, acts as a fixed-height/width block) */
  size?: SpacingToken | string;
  /** Flex grow factor (default: 1 when no size, 0 otherwise) */
  grow?: number;
  /** Flex shrink factor (default: 1) */
  shrink?: number;
  /** Direction hint: 'vertical' adds height, 'horizontal' adds width */
  direction?: 'vertical' | 'horizontal';
  style?: React.CSSProperties;
}

export function Spacer({
  size,
  grow,
  shrink = 1,
  direction = 'vertical',
  style,
}: SpacerProps) {
  const sizeValue = size
    ? (size in spacing ? spacing[size as SpacingToken] : size)
    : undefined;

  const isFixed = sizeValue !== undefined;

  const spacerStyle: React.CSSProperties = {
    flexGrow: grow ?? (isFixed ? 0 : 1),
    flexShrink: shrink,
    ...(direction === 'vertical'
      ? { height: sizeValue ?? 0, width: '100%' }
      : { width: sizeValue ?? 0, height: '100%' }),
    minHeight: 0,
    minWidth: 0,
    ...style,
  };

  return <div style={spacerStyle} aria-hidden="true" />;
}

// ============================================================================
// Divider — Visual separation line
// ============================================================================
//
// Usage:
//   <Divider />
//   <Divider inset="lg" />
//   <Divider vertical height="24px" />
//
// ============================================================================

export interface DividerProps {
  /** Horizontal inset (default: none) */
  inset?: SpacingToken | string;
  /** Vertical divider (default: false = horizontal) */
  vertical?: boolean;
  /** Fixed height for vertical divider */
  height?: string;
  /** Additional style overrides */
  style?: React.CSSProperties;
}

export function Divider({
  inset,
  vertical = false,
  height,
  style,
}: DividerProps) {
  const colors = useColors();

  const insetValue = inset
    ? (inset in spacing ? spacing[inset as SpacingToken] : inset)
    : undefined;

  if (vertical) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: '1px',
          height: height ?? '100%',
          backgroundColor: colors.border,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        height: '1px',
        backgroundColor: colors.border,
        flexShrink: 0,
        marginLeft: insetValue,
        marginRight: insetValue,
        ...style,
      }}
    />
  );
}

// ============================================================================
// Section — Content grouping with optional title
// ============================================================================
//
// Usage:
//   <Section title="Performance">
//     <Card>...</Card>
//   </Section>
//
//   <Section>
//     <Card>...</Card>
//   </Section>
//
// ============================================================================

export interface SectionProps {
  children: ReactNode;
  /** Section title (optional) */
  title?: string;
  /** Gap between title and content (default: spacing.sm = 8px) */
  gap?: SpacingToken | string;
  /** Top margin (default: spacing.xl = 20px) */
  marginTop?: SpacingToken | string;
  /** Additional style overrides */
  style?: React.CSSProperties;
  className?: string;
}

export function Section({
  children,
  title,
  gap = 'sm',
  marginTop = 'xl',
  style,
  className,
}: SectionProps) {
  const colors = useColors();
  const gapValue = gap in spacing ? spacing[gap as SpacingToken] : gap;
  const marginTopValue = marginTop in spacing ? spacing[marginTop as SpacingToken] : marginTop;

  return (
    <section
      style={{
        marginTop: title ? marginTopValue : 0,
        ...style,
      }}
      className={className}
    >
      {title && (
        <h2
          style={{
            fontSize: '0.6875rem',
            fontWeight: '600',
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: colors.textMuted,
            marginBottom: gapValue,
            paddingLeft: '2px',
          }}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
