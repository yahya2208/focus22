import { useThemeColors } from '../../hooks/useThemeColors';

interface ConfidenceBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceBadge({ score, size = 'md' }: ConfidenceBadgeProps) {
  const colors = useThemeColors();
  const clamped = Math.max(0, Math.min(100, score));

  const config = clamped >= 80
    ? { label: 'عالية', bg: '#0d3b1f', text: colors.success }
    : clamped >= 50
    ? { label: 'متوسطة', bg: '#0d2b4f', text: colors.info }
    : clamped >= 30
    ? { label: 'منخفضة', bg: '#3d2d0d', text: colors.warning }
    : { label: 'ضعيفة جداً', bg: '#3d0d0d', text: colors.danger };

  const sizeStyles = {
    sm: { padding: '2px 8px', fontSize: '0.6rem', gap: '3px' },
    md: { padding: '4px 12px', fontSize: '0.72rem', gap: '5px' },
    lg: { padding: '6px 18px', fontSize: '0.85rem', gap: '7px' },
  };

  const ss = sizeStyles[size];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: config.bg, color: config.text,
      borderRadius: '20px', fontWeight: 700, direction: 'ltr',
      padding: ss.padding, fontSize: ss.fontSize, gap: ss.gap,
    }}>
      <span>{clamped}%</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{config.label}</span>
    </span>
  );
}
