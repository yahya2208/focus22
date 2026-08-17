import type { ScreenName } from '../../store/navigation';
import { ALL_SCREEN_NAMES } from '../../store/navigation';
import { BACK_MATRIX } from './back-matrix';

export type EdgeSource = ScreenName | 'deep-link' | 'protected-guard';

/**
 * Inbound-edge table: for every screen, the set of sources that can navigate
 * INTO it (including special entry points). "Orphan" = screen with zero
 * inbound edges. Phase 3A eliminated the orphan condition for every screen;
 * the P0 Correction (Game→Showroom funnel) intentionally made coach /
 * achievements / share unreachable — they are documented orphans with empty
 * edge lists.
 *
 * Sources marked:
 *  - `deep-link`       → entered directly via a deep link / QR (InitialRoute REPLACE)
 *  - `protected-guard` → rendered inline by ProtectedRoute (access-denied)
 */
export const EDGES: Record<ScreenName, readonly EdgeSource[]> = {
  home: [
    'about', 'achievements', 'access-denied', 'admin-setup', 'login',
    'library', 'consent', 'register', 'settings', 'history', 'coach',
    'sticker-studio', 'sticker-scan', 'share', 'showroom', 'research',
    'business-intelligence', 'repair-home', 'repair-request', 'repair-tracking',
    'repair-admin', 'repair-courier', 'repair-customer-history',
    'repair-diagnostics', 'repair-personnel', 'game-intro',
    'design-system-playground',
  ],
  library: ['intro'],
  intro: ['library'],
  calibration: ['intro'],
  countdown: ['home', 'message'],
  game: ['calibration', 'countdown', 'game-intro'],
  'game-intro': ['deep-link'],
  results: ['game'],
  history: ['home'],
  settings: ['home'],
  about: ['home'],
  landing: ['deep-link'],
  share: [],
  register: ['login'],
  consent: ['landing'],
  message: ['consent'],
  research: ['settings', 'home'],
  'business-intelligence': ['settings'],
  coach: [],
  login: ['settings', 'register', 'access-denied', 'home'],
  'admin-setup': ['settings'],
  'access-denied': ['protected-guard'],
  'phone-services': ['home'],
  achievements: [],
  'repair-home': ['home', 'repair-request', 'repair-tracking', 'repair-admin', 'repair-courier', 'repair-customer-history', 'repair-diagnostics', 'repair-personnel'],
  'repair-request': ['repair-home'],
  'repair-tracking': ['repair-home', 'repair-request', 'deep-link'],
  'repair-admin': ['repair-home'],
  'repair-courier': ['repair-home'],
  'repair-customer-history': ['repair-home'],
  'repair-diagnostics': ['repair-home'],
  'repair-personnel': ['repair-admin'],
  'sticker-studio': ['home'],
  'sticker-analytics': ['sticker-studio'],
  'sticker-scan': ['deep-link'],
  showroom: ['home', 'results'],
  'phone-details': ['showroom', 'deep-link'],
  'design-system-playground': ['settings'],
  'catalog-approval': ['settings', 'home'],
};

export function assertNoOrphans(edges: Record<ScreenName, readonly EdgeSource[]> = EDGES): ScreenName[] {
  return ALL_SCREEN_NAMES.filter((screen) => (edges[screen] ?? []).length === 0);
}

export function assertNoDeadEnds(): ScreenName[] {
  return ALL_SCREEN_NAMES.filter((screen) => !BACK_MATRIX[screen]);
}

export function isEdgeComplete(edges: Record<ScreenName, readonly EdgeSource[]> = EDGES): boolean {
  return ALL_SCREEN_NAMES.every((screen) => (edges[screen] ?? []).length > 0);
}
