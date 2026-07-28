import { type ReactNode } from 'react';
import { spacing, type SpacingToken } from '../tokens';

// ============================================================================
// Stack — Vertical flex layout with gap
// ============================================================================
//
// Replaces the repeated pattern:
//   <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//
// Usage:
//   <Stack gap="lg">
//     <Card>...</Card>
//     <Card>...</Card>
//   </Stack>
//
//   <Stack gap="md" align="center">
//     <Button>Save</Button>
//   </Stack>
//
// ============================================================================

type Align = 'stretch' | 'center' | 'flex-start' | 'flex-end' | 'baseline';
type Justify = 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';

export interface StackProps {
  children: ReactNode;
  /** Gap between items (default: spacing.md = 12px) */
  gap?: SpacingToken | string;
  /** Horizontal alignment (default: stretch) */
  align?: Align;
  /** Vertical justification (default: flex-start) */
  justify?: Justify;
  /** Flex wrap (default: nowrap) */
  wrap?: boolean;
  /** Additional style overrides */
  style?: React.CSSProperties;
  className?: string;
}

export function Stack({
  children,
  gap = 'md',
  align = 'stretch',
  justify = 'flex-start',
  wrap = false,
  style,
  className,
}: StackProps) {
  const gapValue = gap in spacing ? spacing[gap as SpacingToken] : gap;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        justifyContent: justify,
        gap: gapValue,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
}

// ============================================================================
// HStack — Horizontal flex layout with gap
// ============================================================================
//
// Usage:
//   <HStack gap="sm" align="center">
//     <Icon />
//     <Text>Name</Text>
//     <Spacer />
//     <Chevron />
//   </HStack>
//
// ============================================================================

export interface HStackProps {
  children: ReactNode;
  /** Gap between items (default: spacing.sm = 8px) */
  gap?: SpacingToken | string;
  /** Vertical alignment (default: center) */
  align?: Align;
  /** Horizontal justification (default: flex-start) */
  justify?: Justify;
  /** Flex wrap (default: nowrap) */
  wrap?: boolean;
  /** Additional style overrides */
  style?: React.CSSProperties;
  className?: string;
}

export function HStack({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  style,
  className,
}: HStackProps) {
  const gapValue = gap in spacing ? spacing[gap as SpacingToken] : gap;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: align,
        justifyContent: justify,
        gap: gapValue,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
}

// ============================================================================
// VStack — Alias for Stack (vertical)
// ============================================================================

export type VStackProps = StackProps;
export const VStack = Stack;
