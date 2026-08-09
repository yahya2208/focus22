import type { ScreenName } from '../../store/navigation';

export type BackTarget = ScreenName | 'root' | 'previous';

export type BackBehavior =
  | 'back'
  | 'double-exit'
  | 'step-back'
  | 'guard'
  | 'replace';

export interface BackMatrixRow {
  readonly screen: ScreenName;
  /** What the back action leads to. 'root' = home is the app root (double-exit). 'previous' = the previous stack entry. */
  readonly backTarget: BackTarget;
  /** Can the user natively leave the app from here (double-exit on home / native handoff screens)? */
  readonly exitAllowed: boolean;
  readonly browserBack: BackBehavior;
  readonly androidBack: BackBehavior;
  /** Does the screen already render its own in-content back/home control (no global affordance needed)? */
  readonly hasInContentBackButton: boolean;
  readonly note?: string;
}

export const BACK_MATRIX: Record<ScreenName, BackMatrixRow> = {
  home: { screen: 'home', backTarget: 'root', exitAllowed: true, browserBack: 'double-exit', androidBack: 'double-exit', hasInContentBackButton: false },
  library: { screen: 'library', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  intro: { screen: 'intro', backTarget: 'library', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  calibration: { screen: 'calibration', backTarget: 'game-intro', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false, note: 'fullscreen — affordance hidden; hardware back pops' },
  countdown: { screen: 'countdown', backTarget: 'game-intro', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false, note: 'fullscreen; 3s auto-advance — back = previous (confirm dialog deferred)' },
  game: { screen: 'game', backTarget: 'home', exitAllowed: false, browserBack: 'guard', androidBack: 'guard', hasInContentBackButton: false, note: 'back → Stop & Save / Resume dialog (beforeBack guard); stop → home (RESET)' },
  'game-intro': { screen: 'game-intro', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false },
  results: { screen: 'results', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'P0 Game→Showroom: result displays briefly then REPLACEs to showroom; back → home (beforeBack guard RESETs); Home button also clears the stack' },
  history: { screen: 'history', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  settings: { screen: 'settings', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  about: { screen: 'about', backTarget: 'settings', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  landing: { screen: 'landing', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false },
  share: { screen: 'share', backTarget: 'results', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false },
  register: { screen: 'register', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false, note: 'reachable from results CTA or login no-account — back = previous (results or login)' },
  consent: { screen: 'consent', backTarget: 'intro', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  message: { screen: 'message', backTarget: 'game-intro', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false },
  research: { screen: 'research', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected; internal dashboards (priority 5 tab) wired in Phase 7 item #10' },
  'business-intelligence': { screen: 'business-intelligence', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected' },
  coach: { screen: 'coach', backTarget: 'results', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  login: { screen: 'login', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false, note: 'post-auth success REPLACEs to intendedScreen/previous' },
  'admin-setup': { screen: 'admin-setup', backTarget: 'login', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  'access-denied': { screen: 'access-denied', backTarget: 'previous', exitAllowed: false, browserBack: 'replace', androidBack: 'replace', hasInContentBackButton: true },
  'phone-services': { screen: 'phone-services', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false },
  achievements: { screen: 'achievements', backTarget: 'results', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
  'repair-home': { screen: 'repair-home', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'section root' },
  'repair-request': { screen: 'repair-request', backTarget: 'repair-home', exitAllowed: false, browserBack: 'step-back', androidBack: 'step-back', hasInContentBackButton: true, note: 'wizard steps wired in Phase 7 item #10' },
  'repair-tracking': { screen: 'repair-tracking', backTarget: 'repair-home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false },
  'repair-admin': { screen: 'repair-admin', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected' },
  'repair-courier': { screen: 'repair-courier', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected' },
  'repair-customer-history': { screen: 'repair-customer-history', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected' },
  'repair-diagnostics': { screen: 'repair-diagnostics', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false, note: 'protected' },
  'repair-personnel': { screen: 'repair-personnel', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected' },
  'sticker-studio': { screen: 'sticker-studio', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'protected' },
  'sticker-analytics': { screen: 'sticker-analytics', backTarget: 'previous', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: false, note: 'protected' },
  'sticker-scan': { screen: 'sticker-scan', backTarget: 'home', exitAllowed: false, browserBack: 'replace', androidBack: 'replace', hasInContentBackButton: false, note: 'auto handler; CTA REPLACEs home (Phase 7 item #1)' },
  showroom: { screen: 'showroom', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'section root; in-content Back → home' },
  'phone-details': { screen: 'phone-details', backTarget: 'showroom', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true, note: 'sales page; in-content Back → showroom (restores scroll/search/filters/sort)' },
  'design-system-playground': { screen: 'design-system-playground', backTarget: 'home', exitAllowed: false, browserBack: 'back', androidBack: 'back', hasInContentBackButton: true },
};

export function getBackMatrixRow(screen: ScreenName): BackMatrixRow | undefined {
  return BACK_MATRIX[screen];
}

/** Should the global back affordance render for this screen? */
export function shouldShowBackAffordance(
  screen: ScreenName,
  navStack: readonly ScreenName[],
): boolean {
  const row = BACK_MATRIX[screen];
  if (!row) return false;
  if (row.backTarget === 'root') return false;
  if (row.hasInContentBackButton) return false;
  return navStack.length > 1 || screen !== 'home';
}
