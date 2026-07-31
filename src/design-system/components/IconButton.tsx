import { memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useColorRoles } from '../useTokens';
import { focusRing, focusRingReset } from '../focus';
import { radius as radiusToken, type RadiusToken } from '../radius';
import { fontSize as fs } from '../typography';
import { motion } from '../motion';

export type IconButtonVariant = 'solid' | 'ghost' | 'outline';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  radius?: RadiusToken | string;
  icon: ReactNode;
  'aria-label': string;
}

type IconButtonSize = 'sm' | 'md' | 'lg';

const sizeMap: Partial<Record<IconButtonSize, { size: string; icon: string }>> = {
  sm: { size: '32px', icon: fs.caption },
  md: { size: '40px', icon: fs.body },
  lg: { size: '48px', icon: fs.title },
};

export const IconButton = memo(function IconButton({
  variant = 'ghost',
  size = 'md' as IconButtonSize,
  radius = 'md',
  icon,
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const roles = useColorRoles();
  const sz = sizeMap[size]!;
  const rad = radius in radiusToken ? radiusToken[radius as RadiusToken] : radius;

  const variantStyle: React.CSSProperties = (() => {
    switch (variant) {
      case 'solid':
        return { background: roles.action.primary, color: roles.text.inverse, border: 'none' };
      case 'ghost':
        return { background: 'transparent', color: roles.text.secondary, border: 'none' };
      case 'outline':
        return { background: 'transparent', color: roles.action.primary, border: `1px solid ${roles.action.primary}40` };
    }
  })();

  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sz.size,
        height: sz.size,
        fontSize: sz.icon,
        borderRadius: rad,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: motion.fast,
        flexShrink: 0,
        ...variantStyle,
        ...style,
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusRing(roles))}
      onBlur={(e) => Object.assign(e.currentTarget.style, focusRingReset())}
      {...rest}
    >
      {icon}
    </button>
  );
});
