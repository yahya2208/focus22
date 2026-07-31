import type { ThemeId } from './use-theme';

export interface ColorTokens {
  bg: string;
  bgSurface: string;
  bgSurfaceHover: string;
  bgInput: string;
  bgOverlay: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  border: string;
  borderFocus: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;
  shadow: string;
  glass: string;
  glassBorder: string;
  overlay: string;
}

export interface SemanticColors {
  surfaceBase: string;
  surfaceRaised: string;
  surfaceOverlay: string;
  interactiveDefault: string;
  interactiveHover: string;
  interactiveActive: string;
  interactiveDisabled: string;
  focusRing: string;
  focusRingOffset: string;
  statusSuccess: string;
  statusSuccessMuted: string;
  statusWarning: string;
  statusWarningMuted: string;
  statusDanger: string;
  statusDangerMuted: string;
  statusInfo: string;
  statusInfoMuted: string;
}

const midnight: ColorTokens = {
  bg: '#0a0a12',
  bgSurface: 'rgba(16, 16, 28, 0.85)',
  bgSurfaceHover: '#1c1c38',
  bgInput: '#14142a',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f0f0f6',
  textSecondary: '#a8a8c0',
  textMuted: '#6868a0',
  accent: '#00e4b8',
  accentLight: '#40ffc8',
  accentMuted: 'rgba(0, 228, 184, 0.15)',
  border: '#181830',
  borderFocus: 'rgba(0, 228, 184, 0.5)',
  success: '#b8f24c',
  successMuted: 'rgba(184, 242, 76, 0.10)',
  warning: '#ffc244',
  warningMuted: 'rgba(255, 194, 68, 0.10)',
  danger: '#ff6b7a',
  dangerMuted: 'rgba(255, 107, 122, 0.10)',
  info: '#4cc4f0',
  infoMuted: 'rgba(76, 196, 240, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(255, 255, 255, 0.035)',
  glassBorder: 'rgba(255, 255, 255, 0.07)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const ocean: ColorTokens = {
  bg: '#07111e',
  bgSurface: 'rgba(12, 22, 38, 0.85)',
  bgSurfaceHover: '#142a44',
  bgInput: '#0e1e34',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#e8f0f8',
  textSecondary: '#8aaac8',
  textMuted: '#507090',
  accent: '#00b4ff',
  accentLight: '#40ccff',
  accentMuted: 'rgba(0, 180, 255, 0.15)',
  border: '#0f2038',
  borderFocus: 'rgba(0, 180, 255, 0.5)',
  success: '#44d88c',
  successMuted: 'rgba(68, 216, 140, 0.10)',
  warning: '#ffba3c',
  warningMuted: 'rgba(255, 186, 60, 0.10)',
  danger: '#ff6070',
  dangerMuted: 'rgba(255, 96, 112, 0.10)',
  info: '#38a0e8',
  infoMuted: 'rgba(56, 160, 232, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(100, 180, 255, 0.04)',
  glassBorder: 'rgba(100, 180, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const emerald: ColorTokens = {
  bg: '#060f0a',
  bgSurface: 'rgba(10, 22, 16, 0.85)',
  bgSurfaceHover: '#122c1c',
  bgInput: '#0c1e14',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#e8f8f0',
  textSecondary: '#88c8a4',
  textMuted: '#50906c',
  accent: '#00e488',
  accentLight: '#40ffa0',
  accentMuted: 'rgba(0, 228, 136, 0.15)',
  border: '#0e2418',
  borderFocus: 'rgba(0, 228, 136, 0.5)',
  success: '#a0f060',
  successMuted: 'rgba(160, 240, 96, 0.10)',
  warning: '#ffc040',
  warningMuted: 'rgba(255, 192, 64, 0.10)',
  danger: '#ff6878',
  dangerMuted: 'rgba(255, 104, 120, 0.10)',
  info: '#3cc0b0',
  infoMuted: 'rgba(60, 192, 176, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(100, 240, 180, 0.035)',
  glassBorder: 'rgba(100, 240, 180, 0.07)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const carbon: ColorTokens = {
  bg: '#111111',
  bgSurface: 'rgba(22, 22, 22, 0.9)',
  bgSurfaceHover: '#242424',
  bgInput: '#1a1a1a',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f0f0f0',
  textSecondary: '#a0a0a0',
  textMuted: '#666666',
  accent: '#ffffff',
  accentLight: '#ffffff',
  accentMuted: 'rgba(255, 255, 255, 0.10)',
  border: '#1e1e1e',
  borderFocus: 'rgba(255, 255, 255, 0.4)',
  success: '#4ade80',
  successMuted: 'rgba(74, 222, 128, 0.10)',
  warning: '#facc15',
  warningMuted: 'rgba(250, 204, 21, 0.10)',
  danger: '#f87171',
  dangerMuted: 'rgba(248, 113, 113, 0.10)',
  info: '#60a5fa',
  infoMuted: 'rgba(96, 165, 250, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const purple: ColorTokens = {
  bg: '#0c0818',
  bgSurface: 'rgba(18, 12, 36, 0.85)',
  bgSurfaceHover: '#201840',
  bgInput: '#160e30',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f0eaf8',
  textSecondary: '#a898c8',
  textMuted: '#706098',
  accent: '#c080ff',
  accentLight: '#d4a0ff',
  accentMuted: 'rgba(192, 128, 255, 0.15)',
  border: '#18102c',
  borderFocus: 'rgba(192, 128, 255, 0.5)',
  success: '#80e8a0',
  successMuted: 'rgba(128, 232, 160, 0.10)',
  warning: '#ffc060',
  warningMuted: 'rgba(255, 192, 96, 0.10)',
  danger: '#ff7088',
  dangerMuted: 'rgba(255, 112, 136, 0.10)',
  info: '#80b0ff',
  infoMuted: 'rgba(128, 176, 255, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(180, 120, 255, 0.04)',
  glassBorder: 'rgba(180, 120, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const sunrise: ColorTokens = {
  bg: '#120a06',
  bgSurface: 'rgba(26, 16, 8, 0.85)',
  bgSurfaceHover: '#2c1c10',
  bgInput: '#1e120a',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f8f0e8',
  textSecondary: '#c8a888',
  textMuted: '#907050',
  accent: '#ff8c40',
  accentLight: '#ffaa68',
  accentMuted: 'rgba(255, 140, 64, 0.15)',
  border: '#20140c',
  borderFocus: 'rgba(255, 140, 64, 0.5)',
  success: '#80e080',
  successMuted: 'rgba(128, 224, 128, 0.10)',
  warning: '#ffc840',
  warningMuted: 'rgba(255, 200, 64, 0.10)',
  danger: '#ff6060',
  dangerMuted: 'rgba(255, 96, 96, 0.10)',
  info: '#60b8e0',
  infoMuted: 'rgba(96, 184, 224, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(255, 180, 100, 0.04)',
  glassBorder: 'rgba(255, 180, 100, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const light: ColorTokens = {
  bg: '#f4f4f8',
  bgSurface: 'rgba(255, 255, 255, 0.92)',
  bgSurfaceHover: '#e0e0e8',
  bgInput: '#ecedf2',
  bgOverlay: 'rgba(0, 0, 0, 0.3)',
  text: '#1a1a24',
  textSecondary: '#4a4a5c',
  textMuted: '#7c7c90',
  accent: '#00886e',
  accentLight: '#00a888',
  accentMuted: 'rgba(0, 136, 110, 0.10)',
  border: '#d4d4dc',
  borderFocus: 'rgba(0, 136, 110, 0.5)',
  success: '#16803c',
  successMuted: 'rgba(22, 128, 60, 0.08)',
  warning: '#a07000',
  warningMuted: 'rgba(160, 112, 0, 0.08)',
  danger: '#c82020',
  dangerMuted: 'rgba(200, 32, 32, 0.08)',
  info: '#0068a8',
  infoMuted: 'rgba(0, 104, 168, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.05)',
  glass: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.3)',
};

export const themeColors: Record<ThemeId, ColorTokens> = {
  midnight,
  ocean,
  emerald,
  carbon,
  purple,
  sunrise,
  light,
};

export interface ColorRoles {
  text: {
    primary: string;
    secondary: string;
    inverse: string;
    muted: string;
  };
  surface: {
    default: string;
    hover: string;
    active: string;
    disabled: string;
  };
  action: {
    primary: string;
    secondary: string;
    danger: string;
  };
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  border: {
    default: string;
    subtle: string;
  };
  focus: {
    default: string;
  };
  overlay: {
    default: string;
  };
}

export function buildColorRoles(colors: ColorTokens): ColorRoles {
  return {
    text: {
      primary: colors.text,
      secondary: colors.textSecondary,
      inverse: colors.bg,
      muted: colors.textMuted,
    },
    surface: {
      default: colors.bgSurface,
      hover: colors.bgSurfaceHover,
      active: colors.bgSurfaceHover,
      disabled: colors.textMuted,
    },
    action: {
      primary: colors.accent,
      secondary: colors.accentLight,
      danger: colors.danger,
    },
    status: {
      success: colors.success,
      warning: colors.warning,
      error: colors.danger,
      info: colors.info,
    },
    border: {
      default: colors.border,
      subtle: colors.borderFocus,
    },
    focus: {
      default: colors.borderFocus,
    },
    overlay: {
      default: colors.overlay,
    },
  };
}

export function buildSemanticColors(colors: ColorTokens): SemanticColors {
  return {
    surfaceBase: colors.bg,
    surfaceRaised: colors.bgSurface,
    surfaceOverlay: colors.bgOverlay,
    interactiveDefault: colors.accent,
    interactiveHover: colors.accentLight,
    interactiveActive: colors.accent,
    interactiveDisabled: colors.textMuted,
    focusRing: colors.borderFocus,
    focusRingOffset: colors.bg,
    statusSuccess: colors.success,
    statusSuccessMuted: colors.successMuted,
    statusWarning: colors.warning,
    statusWarningMuted: colors.warningMuted,
    statusDanger: colors.danger,
    statusDangerMuted: colors.dangerMuted,
    statusInfo: colors.info,
    statusInfoMuted: colors.infoMuted,
  };
}
