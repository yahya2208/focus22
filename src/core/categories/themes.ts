import type { CategoryTheme } from './types';

/**
 * Category theme presets — a fixed set of 7 visual identities applied to
 * category covers, accent tints and pills. They are a designed part of the
 * category system (00050) and render through the usual inline design-system
 * styles; no ad-hoc CSS.
 */
export interface CategoryThemePreset {
  readonly id: CategoryTheme;
  /** Primary accent used for highlights, CTAs, count badges. */
  readonly accent: string;
  /** Brighter variant (gradients, hover states). */
  readonly accentLight: string;
  /** Translucent accent background (badges, pill). */
  readonly accentSoft: string;
  /** CSS gradient for hero covers. */
  readonly gradient: string;
}

export const CATEGORY_THEME_PRESETS: Record<CategoryTheme, CategoryThemePreset> = {
  fresh: {
    id: 'fresh',
    accent: '#22c55e',
    accentLight: '#4ade80',
    accentSoft: 'rgba(34, 197, 94, 0.14)',
    gradient: 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 120%)',
  },
  technology: {
    id: 'technology',
    accent: '#0ea5e9',
    accentLight: '#38bdf8',
    accentSoft: 'rgba(14, 165, 233, 0.14)',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 55%, #38bdf8 120%)',
  },
  premium: {
    id: 'premium',
    accent: '#e9d5a1',
    accentLight: '#f5e3b8',
    accentSoft: 'rgba(233, 213, 161, 0.14)',
    gradient: 'linear-gradient(135deg, #1e1b2e 0%, #3b3150 55%, #8b5cf6 120%)',
  },
  playful: {
    id: 'playful',
    accent: '#e879f9',
    accentLight: '#f0abfc',
    accentSoft: 'rgba(232, 121, 249, 0.14)',
    gradient: 'linear-gradient(135deg, #4a044e 0%, #a21caf 55%, #f472b6 120%)',
  },
  elegant: {
    id: 'elegant',
    accent: '#f9a8d4',
    accentLight: '#fbcfe8',
    accentSoft: 'rgba(249, 168, 212, 0.14)',
    gradient: 'linear-gradient(135deg, #3b0764 0%, #9d174d 55%, #f9a8d4 120%)',
  },
  warm: {
    id: 'warm',
    accent: '#f59e0b',
    accentLight: '#fbbf24',
    accentSoft: 'rgba(245, 158, 11, 0.16)',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 55%, #fbbf24 120%)',
  },
  minimal: {
    id: 'minimal',
    accent: '#94a3b8',
    accentLight: '#cbd5e1',
    accentSoft: 'rgba(148, 163, 184, 0.16)',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #64748b 120%)',
  },
};

export function getCategoryThemePreset(theme: CategoryTheme): CategoryThemePreset {
  return CATEGORY_THEME_PRESETS[theme] ?? CATEGORY_THEME_PRESETS.fresh;
}