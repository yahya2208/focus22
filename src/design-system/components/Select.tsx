import { memo, type SelectHTMLAttributes } from 'react';
import { useColorRoles, useInputRecipe } from '../useTokens';
import { focusRing, focusRingReset } from '../focus';
import { type RadiusToken } from '../radius';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  placeholder?: string;
  radius?: RadiusToken | string;
  error?: boolean;
}

export const Select = memo(function Select({
  options,
  placeholder,
  radius = 'md',
  error = false,
  style,
  ...rest
}: SelectProps) {
  const roles = useColorRoles();
  const recipe = useInputRecipe(radius);

  return (
    <select
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
        cursor: 'pointer',
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
    >
      {placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
});
