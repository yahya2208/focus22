import { memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useColorRoles, useButtonRecipe } from '../useTokens';
import { spacing } from '../spacing';
import { motion } from '../motion';
import { zIndex } from '../z-index';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success' | 'warning' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  children?: ReactNode;
}

export const Button = memo(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const roles = useColorRoles();
  const recipe = useButtonRecipe(variant, size);
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      aria-busy={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        height: recipe.height,
        paddingInline: recipe.padding,
        fontSize: recipe.fontSize,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: recipe.radius,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: motion.fast,
        width: fullWidth ? '100%' : undefined,
        whiteSpace: 'nowrap',
        outline: 'none',
        position: 'relative',
        zIndex: zIndex.base,
        background: recipe.background,
        color: recipe.color,
        border: recipe.border,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = recipe.hoverBg;
          if (recipe.hoverBorder) e.currentTarget.style.border = recipe.hoverBorder;
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = recipe.background;
          e.currentTarget.style.border = recipe.border;
        }
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = `2px solid ${roles.focus.default}`;
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none';
      }}
      {...rest}
    >
      {loading && (
        <span style={{
          width: recipe.fontSize, height: recipe.fontSize, border: '2px solid currentColor',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
          display: 'inline-block',
        }} />
      )}
      {!loading && icon && iconPosition === 'left' && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && <span style={{ display: 'inline-flex' }}>{icon}</span>}
    </button>
  );
});
