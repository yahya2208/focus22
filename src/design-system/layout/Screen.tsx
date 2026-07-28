import { type ReactNode } from 'react';
import { useColors } from '../useTokens';
import { layout, spacing } from '../tokens';

// ============================================================================
// Screen — Root layout wrapper for every consumer screen
// ============================================================================
//
// Replaces the ad-hoc <nav> pattern used across all screens.
// Provides:
//   - <main> semantics (accessibility)
//   - Centered max-width container
//   - Safe-area-inset padding (notch, home indicator)
//   - Configurable scrolling
//   - Consistent background color
//
// Usage:
//   <Screen>
//     <ScreenHeader title="Home" />
//     {/* content */}
//   </Screen>
//
//   <Screen scroll={false}>  {/* for game, overlay */}
//     {/* fixed layout */}
//   </Screen>
//
// ============================================================================

export interface ScreenProps {
  /** Screen content */
  children: ReactNode;
  /** Enable vertical scrolling (default: true) */
  scroll?: boolean;
  /** Override max-width (default: layout.containerMax = 480px) */
  maxWidth?: string;
  /** Override horizontal padding (default: layout.containerPadding = 20px) */
  padding?: string;
  /** Additional bottom padding for fixed elements like nav bars */
  bottomPad?: string;
  /** Override background color (default: colors.bg) */
  background?: string;
  /** Additional style overrides */
  style?: React.CSSProperties;
  /** Accessibility label */
  ariaLabel?: string;
  /** CSS class name */
  className?: string;
}

export function Screen({
  children,
  scroll = true,
  maxWidth = layout.containerMax,
  padding = layout.containerPadding,
  bottomPad,
  background,
  style,
  ariaLabel,
  className,
}: ScreenProps) {
  const colors = useColors();

  const rootStyle: React.CSSProperties = {
    minHeight: '100dvh',
    background: background ?? colors.bg,
    color: colors.text,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    ...(scroll
      ? {
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as const,
        }
      : {
          overflow: 'hidden',
        }),
    ...style,
  };

  const innerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth,
    /* Safe area insets — accounts for notch, status bar, home indicator */
    paddingTop: `env(safe-area-inset-top, ${spacing.lg})`,
    paddingLeft: `env(safe-area-inset-left, ${padding})`,
    paddingRight: `env(safe-area-inset-right, ${padding})`,
    paddingBottom: bottomPad
      ? `calc(env(safe-area-inset-bottom, ${spacing.lg}) + ${bottomPad})`
      : `env(safe-area-inset-bottom, ${spacing.lg})`,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    boxSizing: 'border-box' as const,
  };

  return (
    <main
      style={rootStyle}
      aria-label={ariaLabel}
      className={className}
    >
      <div style={innerStyle}>
        {children}
      </div>
    </main>
  );
}
