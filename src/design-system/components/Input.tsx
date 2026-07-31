import { memo, type InputHTMLAttributes, forwardRef } from 'react';
import { useColorRoles, useInputRecipe } from '../useTokens';
import { focusRing, focusRingReset } from '../focus';
import { type RadiusToken } from '../radius';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  radius?: RadiusToken | string;
  error?: boolean;
}

export const Input = memo(forwardRef<HTMLInputElement, InputProps>(function Input({
  radius = 'md',
  error = false,
  style,
  ...rest
}, ref) {
  const roles = useColorRoles();
  const recipe = useInputRecipe(radius);

  return (
    <input
      ref={ref}
      style={{
        width: '100%',
        padding: recipe.padding,
        fontSize: recipe.fontSize,
        fontFamily: 'inherit',
        color: recipe.fontColor,
        background: recipe.background,
        border: error ? recipe.borderError : recipe.border,
        borderRadius: recipe.radius,
        outline: 'none',
        transition: 'border-color 150ms, box-shadow 150ms',
        boxSizing: 'border-box',
        ...(rest.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      onFocus={(e) => {
        Object.assign(e.currentTarget.style, focusRing(roles));
        e.currentTarget.style.borderColor = error ? roles.status.error : roles.focus.default;
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        Object.assign(e.currentTarget.style, focusRingReset());
        e.currentTarget.style.borderColor = error ? roles.status.error : roles.border.default;
        rest.onBlur?.(e);
      }}
      {...rest}
    />
  );
}));
