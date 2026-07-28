import { useTheme, type ThemeId } from '../design-system/use-theme';
export type { ThemeId } from '../design-system/use-theme';

export interface ThemeColors {
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

const midnight: ThemeColors = {
  bg: '#0a0a12',
  bgCard: 'rgba(16, 16, 28, 0.85)',
  bgInput: '#14142a',
  bgHover: '#1c1c38',
  border: '#181830',
  borderLight: '#24243e',
  text: '#f0f0f6',
  textSecondary: '#a8a8c0',
  textMuted: '#6868a0',
  textFaint: '#3c3c68',
  accent: '#00e4b8',
  accentLight: '#40ffc8',
  accentGlow: 'rgba(0, 228, 184, 0.22)',
  success: '#b8f24c',
  successBg: 'rgba(184, 242, 76, 0.10)',
  successText: '#b8f24c',
  danger: '#ff6b7a',
  dangerBg: 'rgba(255, 107, 122, 0.10)',
  dangerText: '#ff9aa5',
  warning: '#ffc244',
  warningBg: 'rgba(255, 194, 68, 0.10)',
  warningText: '#ffd06a',
  info: '#4cc4f0',
  infoBg: 'rgba(76, 196, 240, 0.10)',
  infoText: '#7ad4f5',
  progressBg: '#14142a',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(255, 255, 255, 0.035)',
  glassBorder: 'rgba(255, 255, 255, 0.07)',
  gradient: 'linear-gradient(160deg, #0a0a12 0%, #10102a 100%)',
};

const ocean: ThemeColors = {
  bg: '#07111e',
  bgCard: 'rgba(12, 22, 38, 0.85)',
  bgInput: '#0e1e34',
  bgHover: '#142a44',
  border: '#0f2038',
  borderLight: '#1a3050',
  text: '#e8f0f8',
  textSecondary: '#8aaac8',
  textMuted: '#507090',
  textFaint: '#304860',
  accent: '#00b4ff',
  accentLight: '#40ccff',
  accentGlow: 'rgba(0, 180, 255, 0.22)',
  success: '#44d88c',
  successBg: 'rgba(68, 216, 140, 0.10)',
  successText: '#44d88c',
  danger: '#ff6070',
  dangerBg: 'rgba(255, 96, 112, 0.10)',
  dangerText: '#ff8890',
  warning: '#ffba3c',
  warningBg: 'rgba(255, 186, 60, 0.10)',
  warningText: '#ffcc66',
  info: '#38a0e8',
  infoBg: 'rgba(56, 160, 232, 0.10)',
  infoText: '#60b8f0',
  progressBg: '#0e1e34',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(100, 180, 255, 0.04)',
  glassBorder: 'rgba(100, 180, 255, 0.08)',
  gradient: 'linear-gradient(160deg, #07111e 0%, #0e2040 100%)',
};

const emerald: ThemeColors = {
  bg: '#060f0a',
  bgCard: 'rgba(10, 22, 16, 0.85)',
  bgInput: '#0c1e14',
  bgHover: '#122c1c',
  border: '#0e2418',
  borderLight: '#183824',
  text: '#e8f8f0',
  textSecondary: '#88c8a4',
  textMuted: '#50906c',
  textFaint: '#306848',
  accent: '#00e488',
  accentLight: '#40ffa0',
  accentGlow: 'rgba(0, 228, 136, 0.22)',
  success: '#a0f060',
  successBg: 'rgba(160, 240, 96, 0.10)',
  successText: '#a0f060',
  danger: '#ff6878',
  dangerBg: 'rgba(255, 104, 120, 0.10)',
  dangerText: '#ff9098',
  warning: '#ffc040',
  warningBg: 'rgba(255, 192, 64, 0.10)',
  warningText: '#ffd068',
  info: '#3cc0b0',
  infoBg: 'rgba(60, 192, 176, 0.10)',
  infoText: '#60d8c8',
  progressBg: '#0c1e14',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(100, 240, 180, 0.035)',
  glassBorder: 'rgba(100, 240, 180, 0.07)',
  gradient: 'linear-gradient(160deg, #060f0a 0%, #0c2418 100%)',
};

const carbon: ThemeColors = {
  bg: '#111111',
  bgCard: 'rgba(22, 22, 22, 0.9)',
  bgInput: '#1a1a1a',
  bgHover: '#242424',
  border: '#1e1e1e',
  borderLight: '#2e2e2e',
  text: '#f0f0f0',
  textSecondary: '#a0a0a0',
  textMuted: '#666666',
  textFaint: '#444444',
  accent: '#ffffff',
  accentLight: '#ffffff',
  accentGlow: 'rgba(255, 255, 255, 0.12)',
  success: '#4ade80',
  successBg: 'rgba(74, 222, 128, 0.10)',
  successText: '#4ade80',
  danger: '#f87171',
  dangerBg: 'rgba(248, 113, 113, 0.10)',
  dangerText: '#f87171',
  warning: '#facc15',
  warningBg: 'rgba(250, 204, 21, 0.10)',
  warningText: '#facc15',
  info: '#60a5fa',
  infoBg: 'rgba(96, 165, 250, 0.10)',
  infoText: '#60a5fa',
  progressBg: '#1a1a1a',
  shadow: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  gradient: 'linear-gradient(160deg, #111111 0%, #1a1a1a 100%)',
};

const purple: ThemeColors = {
  bg: '#0c0818',
  bgCard: 'rgba(18, 12, 36, 0.85)',
  bgInput: '#160e30',
  bgHover: '#201840',
  border: '#18102c',
  borderLight: '#281c48',
  text: '#f0eaf8',
  textSecondary: '#a898c8',
  textMuted: '#706098',
  textFaint: '#483868',
  accent: '#c080ff',
  accentLight: '#d4a0ff',
  accentGlow: 'rgba(192, 128, 255, 0.22)',
  success: '#80e8a0',
  successBg: 'rgba(128, 232, 160, 0.10)',
  successText: '#80e8a0',
  danger: '#ff7088',
  dangerBg: 'rgba(255, 112, 136, 0.10)',
  dangerText: '#ff98b0',
  warning: '#ffc060',
  warningBg: 'rgba(255, 192, 96, 0.10)',
  warningText: '#ffd488',
  info: '#80b0ff',
  infoBg: 'rgba(128, 176, 255, 0.10)',
  infoText: '#a0c8ff',
  progressBg: '#160e30',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(180, 120, 255, 0.04)',
  glassBorder: 'rgba(180, 120, 255, 0.08)',
  gradient: 'linear-gradient(160deg, #0c0818 0%, #1a1040 100%)',
};

const sunrise: ThemeColors = {
  bg: '#120a06',
  bgCard: 'rgba(26, 16, 8, 0.85)',
  bgInput: '#1e120a',
  bgHover: '#2c1c10',
  border: '#20140c',
  borderLight: '#342418',
  text: '#f8f0e8',
  textSecondary: '#c8a888',
  textMuted: '#907050',
  textFaint: '#684830',
  accent: '#ff8c40',
  accentLight: '#ffaa68',
  accentGlow: 'rgba(255, 140, 64, 0.22)',
  success: '#80e080',
  successBg: 'rgba(128, 224, 128, 0.10)',
  successText: '#80e080',
  danger: '#ff6060',
  dangerBg: 'rgba(255, 96, 96, 0.10)',
  dangerText: '#ff8888',
  warning: '#ffc840',
  warningBg: 'rgba(255, 200, 64, 0.10)',
  warningText: '#ffd868',
  info: '#60b8e0',
  infoBg: 'rgba(96, 184, 224, 0.10)',
  infoText: '#80d0f0',
  progressBg: '#1e120a',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(255, 180, 100, 0.04)',
  glassBorder: 'rgba(255, 180, 100, 0.08)',
  gradient: 'linear-gradient(160deg, #120a06 0%, #201410 100%)',
};

const light: ThemeColors = {
  bg: '#f4f4f8',
  bgCard: 'rgba(255, 255, 255, 0.92)',
  bgInput: '#ecedf2',
  bgHover: '#e0e0e8',
  border: '#d4d4dc',
  borderLight: '#c8c8d2',
  text: '#1a1a24',
  textSecondary: '#4a4a5c',
  textMuted: '#7c7c90',
  textFaint: '#a8a8b8',
  accent: '#00886e',
  accentLight: '#00a888',
  accentGlow: 'rgba(0, 136, 110, 0.12)',
  success: '#16803c',
  successBg: 'rgba(22, 128, 60, 0.08)',
  successText: '#15803c',
  danger: '#c82020',
  dangerBg: 'rgba(200, 32, 32, 0.08)',
  dangerText: '#a01818',
  warning: '#a07000',
  warningBg: 'rgba(160, 112, 0, 0.08)',
  warningText: '#805800',
  info: '#0068a8',
  infoBg: 'rgba(0, 104, 168, 0.08)',
  infoText: '#005890',
  progressBg: '#e4e4ea',
  shadow: 'rgba(0, 0, 0, 0.05)',
  glass: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  gradient: 'linear-gradient(160deg, #f4f4f8 0%, #ecedf2 100%)',
};

const THEMES: Record<ThemeId, ThemeColors> = {
  midnight, ocean, emerald, carbon, purple, sunrise, light,
};

export const THEME_IDS: ThemeId[] = ['midnight', 'ocean', 'emerald', 'carbon', 'purple', 'sunrise', 'light'];

export const THEME_META: Record<ThemeId, { label: string; preview: string[] }> = {
  midnight: { label: 'Midnight', preview: ['#0a0a12', '#00e4b8', '#10102a'] },
  ocean:    { label: 'Ocean',    preview: ['#07111e', '#00b4ff', '#0e2040'] },
  emerald:  { label: 'Emerald',  preview: ['#060f0a', '#00e488', '#0c2418'] },
  carbon:   { label: 'Carbon',   preview: ['#111111', '#ffffff', '#1a1a1a'] },
  purple:   { label: 'Purple',   preview: ['#0c0818', '#c080ff', '#1a1040'] },
  sunrise:  { label: 'Sunrise',  preview: ['#120a06', '#ff8c40', '#201410'] },
  light:    { label: 'Light',    preview: ['#f4f4f8', '#00886e', '#ffffff'] },
};

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return THEMES[theme] ?? THEMES.midnight;
}
