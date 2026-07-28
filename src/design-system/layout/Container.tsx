import { type ReactNode } from 'react';
import { layout } from '../tokens';

// ============================================================================
// Container — Centered content wrapper with max-width
// ============================================================================
//
// Use inside Screen when you need a narrower content area
// or when Screen's default max-width doesn't apply.
//
// Usage:
//   <Container>
//     <p>Narrow content</p>
//   </Container>
//
//   <Container maxWidth="320px" padding="12px">
//     <p>Custom sizing</p>
//   </Container>
//
// ============================================================================

export interface ContainerProps {
  children: ReactNode;
  /** Max width (default: layout.containerMax = 480px) */
  maxWidth?: string;
  /** Horizontal padding (default: layout.containerPadding = 20px) */
  padding?: string;
  /** Center horizontally (default: true) */
  center?: boolean;
  /** Additional style overrides */
  style?: React.CSSProperties;
  className?: string;
}

export function Container({
  children,
  maxWidth = layout.containerMax,
  padding = layout.containerPadding,
  center = true,
  style,
  className,
}: ContainerProps) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        paddingLeft: padding,
        paddingRight: padding,
        marginLeft: center ? 'auto' : undefined,
        marginRight: center ? 'auto' : undefined,
        boxSizing: 'border-box' as const,
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
}
