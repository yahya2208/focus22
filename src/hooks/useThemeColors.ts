import { useTheme } from '../design-system/use-theme';

interface ThemeColors {
  bg: string;
  bgCard: string;
  bgInput: string;
  bgHover: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentLight: string;
  accentGlow: string;
  success: string;
  successBg: string;
  successText: string;
  danger: string;
  dangerBg: string;
  dangerText: string;
  warning: string;
  warningBg: string;
  warningText: string;
  info: string;
  infoBg: string;
  infoText: string;
  progressBg: string;
  shadow: string;
  glass: string;
  glassBorder: string;
  gradient: string;
}

const darkColors: ThemeColors = {
  bg: '#0c0c14',
  bgCard: 'rgba(18, 18, 30, 0.8)',
  bgInput: '#1a1a2e',
  bgHover: '#22223a',
  border: '#1a1a2e',
  borderLight: '#2a2a42',
  text: '#f0f0f5',
  textSecondary: '#a0a0b8',
  textMuted: '#6b6b82',
  textFaint: '#44445a',
  accent: '#00d4aa',
  accentLight: '#33e8c2',
  accentGlow: 'rgba(0, 212, 170, 0.25)',
  success: '#a3e635',
  successBg: 'rgba(163, 230, 53, 0.12)',
  successText: '#a3e635',
  danger: '#ff6b6b',
  dangerBg: 'rgba(255, 107, 107, 0.12)',
  dangerText: '#ff9a9a',
  warning: '#fbbf24',
  warningBg: 'rgba(251, 191, 36, 0.12)',
  warningText: '#fbbf24',
  info: '#38bdf8',
  infoBg: 'rgba(56, 189, 248, 0.12)',
  infoText: '#7dd3fc',
  progressBg: '#1a1a2e',
  shadow: 'rgba(0, 0, 0, 0.4)',
  glass: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  gradient: 'linear-gradient(135deg, #0c0c14 0%, #111128 100%)',
};

const lightColors: ThemeColors = {
  bg: '#f2f2f7',
  bgCard: 'rgba(255, 255, 255, 0.85)',
  bgInput: '#e8e8ed',
  bgHover: '#dcdce2',
  border: '#d1d1d6',
  borderLight: '#c7c7cc',
  text: '#1c1c1e',
  textSecondary: '#636366',
  textMuted: '#8e8e93',
  textFaint: '#aeaeb2',
  accent: '#009e82',
  accentLight: '#00c9a7',
  accentGlow: 'rgba(0, 158, 130, 0.15)',
  success: '#65a30d',
  successBg: 'rgba(101, 163, 13, 0.1)',
  successText: '#3f6212',
  danger: '#e03e3e',
  dangerBg: 'rgba(224, 62, 62, 0.1)',
  dangerText: '#b91c1c',
  warning: '#d97706',
  warningBg: 'rgba(217, 119, 6, 0.1)',
  warningText: '#92400e',
  info: '#0284c7',
  infoBg: 'rgba(2, 132, 199, 0.1)',
  infoText: '#075985',
  progressBg: '#e5e5ea',
  shadow: 'rgba(0, 0, 0, 0.06)',
  glass: 'rgba(255, 255, 255, 0.6)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  gradient: 'linear-gradient(135deg, #f2f2f7 0%, #e8e8ed 100%)',
};

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return theme === 'light' ? lightColors : darkColors;
}
