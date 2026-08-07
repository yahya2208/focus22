import { type ReactNode } from 'react';
import { spacing, type SpacingToken } from '../tokens';

// ============================================================================
// Grid — CSS Grid with configurable columns and gap
// ============================================================================
//
// Replaces repeated gridTemplateColumns patterns.
//
// Usage:
//   <Grid columns={2} gap="md">
//     <Card>Stat 1</Card>
//     <Card>Stat 2</Card>
//   </Grid>
//
//   <Grid columns={3} gap="sm">
//     <Badge>A</Badge>
//     <Badge>B</Badge>
//     <Badge>C</Badge>
//   </Grid>
//
// ============================================================================

export interface GridProps {
  children: ReactNode;
  /** Number of columns (default: 2) */
  columns?: number;
  /** Gap between items (default: spacing.md = 12px) */
  gap?: SpacingToken | string;
  /** Row gap override (if different from column gap) */
  rowGap?: SpacingToken | string;
  /** Minimum column width instead of fixed columns */
  minColumnWidth?: string;
  /** Additional style overrides */
  style?: React.CSSProperties;
  className?: string;
}

export function Grid({
  children,
  columns = 2,
  gap = 'md',
  rowGap,
  minColumnWidth,
  style,
  className,
}: GridProps) {
  const gapValue = gap in spacing ? spacing[gap as SpacingToken] : gap;
  const rowGapValue = rowGap
    ? (rowGap in spacing ? spacing[rowGap as SpacingToken] : rowGap)
    : gapValue;

  const gridStyle: React.CSSProperties = minColumnWidth
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}), 1fr))`,
        gap: `${rowGapValue} ${gapValue}`,
        ...style,
      }
    : {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${rowGapValue} ${gapValue}`,
        ...style,
      };

  return (
    <div style={gridStyle} className={className}>
      {children}
    </div>
  );
}
