import { memo, type ReactNode } from 'react';
import { useColors } from '../useTokens';
import { spacing } from '../spacing';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: React.CSSProperties;
}

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  const colors = useColors();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing['3xl'],
        textAlign: 'center',
        gap: spacing.sm,
        ...style,
      }}
    >
      {icon && (
        <div style={{
          fontSize: '2.5rem',
          marginBottom: spacing.xs,
          opacity: 0.6,
        }}>
          {icon}
        </div>
      )}
      <p style={{
        fontSize: '1rem',
        fontWeight: 700,
        color: colors.text,
        margin: 0,
      }}>
        {title}
      </p>
      {description && (
        <p style={{
          fontSize: '0.875rem',
          color: colors.textMuted,
          margin: 0,
          maxWidth: '280px',
          lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}
      {action && (
        <div style={{ marginTop: spacing.sm }}>
          {action}
        </div>
      )}
    </div>
  );
});
