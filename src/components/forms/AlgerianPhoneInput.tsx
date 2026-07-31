import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

export interface AlgerianPhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

const STORAGE_FORMAT = /^0(5|6|7)\d{8}$/;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && /^(213)/.test(digits)) {
    return '0' + digits.slice(3);
  }
  if (digits.length === 13 && /^(213)/.test(digits)) {
    return '0' + digits.slice(3);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 9 && /^[567]/.test(digits)) {
    return '0' + digits;
  }
  return digits;
}

export function isValidAlgerianPhone(phone: string): boolean {
  return STORAGE_FORMAT.test(phone);
}

export function toInternationalFormat(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith('0')) return '213' + normalized.slice(1);
  return normalized;
}

export const AlgerianPhoneInput = memo(function AlgerianPhoneInput({ value, onChange, placeholder, label, error, disabled }: AlgerianPhoneInputProps) {
  const colors = useThemeColors();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 10) return;
    onChange(digits);
  };

  const inputStyle: Record<string, string | number> = {
    width: '100%',
    padding: '0.85rem',
    borderRadius: '14px',
    border: error ? `1.5px solid ${colors.danger}` : 'none',
    background: colors.bgInput,
    color: colors.text,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {label && (
        <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
          {label}
        </label>
      )}
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={handleChange}
        placeholder={placeholder || '05XX XX XX XX'}
        disabled={disabled}
        style={inputStyle}
        maxLength={10}
      />
      {error && (
        <p style={{ color: colors.danger, fontSize: '0.75rem', margin: '0.2rem 0 0' }}>{error}</p>
      )}
    </div>
  );
});
