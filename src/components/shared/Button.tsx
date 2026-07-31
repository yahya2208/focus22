import { memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useThemeStyles } from '../../hooks/useThemeStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  glow?: boolean;
  children: ReactNode;
}

export const Button = memo(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  glow = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const colors = useThemeColors();
  const styles = useThemeStyles();

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      ...styles.btnPrimary,
      background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`,
      boxShadow: glow ? `0 4px 24px ${colors.accentGlow}, 0 0 48px ${colors.accentGlow}` : `0 2px 12px ${colors.accentGlow}`,
    },
    secondary: {
      ...styles.btnSecondary,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    },
    danger: {
      ...styles.btnDanger,
      background: `linear-gradient(135deg, ${colors.danger} 0%, ${colors.danger}dd 100%)`,
      boxShadow: `0 2px 12px ${colors.dangerBg}`,
    },
    ghost: {
      ...styles.ghostBtn,
      color: colors.textSecondary,
      border: 'none',
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '12px' },
    md: { padding: '0.75rem 1.5rem', fontSize: '0.9rem', borderRadius: '14px' },
    lg: { padding: '1rem 2rem', fontSize: '1rem', borderRadius: '16px' },
    xl: { padding: '1.25rem 2.5rem', fontSize: '1.1rem', borderRadius: '20px' },
  };

  return (
    <button
      aria-label={typeof children === 'string' ? children : undefined}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        fontWeight: 600,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        transform: disabled ? 'none' : undefined,
        letterSpacing: '0.01em',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLElement).style.filter = 'brightness(1.08)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.filter = 'brightness(1)';
      }}
      {...rest}
    >
      {loading && (
        <span style={{
          width: '16px', height: '16px',
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
        }} />
      )}
      {children}
    </button>
  );
});
