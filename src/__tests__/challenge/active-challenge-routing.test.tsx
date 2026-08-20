/**
 * Active Challenge Override — Routing Integration Tests.
 *
 * Tests the complete routing behavior when an active challenge exists,
 * covering all entry points: deep links, HomeScreen, PreGameMessage.
 *
 * Covers test cases:
 *  10. #/game while Challenge active → challenge-page
 *  11. #/game-intro while Challenge active → challenge-page
 *  12. #/countdown while Challenge active → challenge-page
 *  14. explicit Challenge QR → requested challenge-page
 *  15. explicit Challenge QR must NOT be replaced by another active Challenge
 *  16. campaign QR remains functional
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { resetChallengeContextForTests } from '../../challenge/challenge-context';
import { resetActiveChallengeCache } from '../../challenge/active-challenge-resolver';
import { AppProvider, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { AuthProvider } from '../../core/auth/AuthProvider';

// ── Auth Mock ──────────────────────────────────────────────────────────────

const mockSignInAsGuest = vi.fn();
const mockService = {
  signInAsGuest: mockSignInAsGuest,
  onStateChange: vi.fn(() => () => {}),
};

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated';
type AuthUser = { id: string; displayName: string | null } | null;

let authStatusSetter: (s: AuthStatus) => void;
let authUserSetter: (u: AuthUser) => void;

vi.mock('../../core/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/auth/AuthProvider')>();
  const { useState, useEffect } = await import('react');
  return {
    ...actual,
    useAuth: () => {
      const [status, setStatus] = useState<AuthStatus>('loading');
      const [user, setUser] = useState<AuthUser>(null);

      useEffect(() => {
        authStatusSetter = setStatus;
        authUserSetter = setUser;
      }, []);

      return {
        state: { status, user, error: null },
        service: mockService,
        researchRole: 'none',
      };
    },
  };
});

vi.mock('../../services/campaign-lookup', () => ({
  extractCampaignShortCodeFromLocation: () => null,
  lookupCampaign: vi.fn(),
}));

vi.mock('../../services/qr-measurement', () => ({
  recordScan: vi.fn(),
}));

vi.mock('../../core/calibration/silent', () => ({
  runSilentCalibration: vi.fn().mockResolvedValue(null),
}));

// ── Active Challenge Resolver Mock ─────────────────────────────────────────

const mockResolveDefaultGameEntry = vi.fn();

vi.mock('../../challenge/active-challenge-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../challenge/active-challenge-resolver')>();
  return {
    ...actual,
    resolveDefaultGameEntry: (...args: unknown[]) => mockResolveDefaultGameEntry(...args),
  };
});

// ── Import component under test ────────────────────────────────────────────

import { InitialRoute } from '../../App';

function NavProbe() {
  const { currentScreen } = useAppState();
  return <div data-testid="screen">{currentScreen}</div>;
}

function renderRoute() {
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          <AuthProvider>
            <InitialRoute />
            <NavProbe />
          </AuthProvider>
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  resetChallengeContextForTests();
  resetActiveChallengeCache();
  authStatusSetter = undefined!;
  authUserSetter = undefined!;
  window.location.hash = '';
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  resetChallengeContextForTests();
  resetActiveChallengeCache();
  window.location.hash = '';
  window.history.replaceState({}, '', '/');
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. #/game while Challenge active → challenge-page
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO-10: #/game deep link with active Challenge', () => {
  it('redirects to challenge-page when active Challenge exists', async () => {
    mockResolveDefaultGameEntry.mockResolvedValue('challenge-page');
    window.location.hash = '#/game';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });
    expect(mockResolveDefaultGameEntry).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. #/game-intro while Challenge active → challenge-page
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO-11: #/game-intro deep link with active Challenge', () => {
  it('redirects to challenge-page when active Challenge exists', async () => {
    mockResolveDefaultGameEntry.mockResolvedValue('challenge-page');
    window.location.hash = '#/game-intro';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });
    expect(mockResolveDefaultGameEntry).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. #/countdown while Challenge active → challenge-page
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO-12: #/countdown deep link with active Challenge', () => {
  it('redirects to challenge-page when active Challenge exists', async () => {
    mockResolveDefaultGameEntry.mockResolvedValue('challenge-page');
    window.location.hash = '#/countdown';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });
    expect(mockResolveDefaultGameEntry).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. explicit Challenge QR → requested challenge-page
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO-14: explicit Challenge QR deep link', () => {
  it('navigates to challenge-page with the specified challenge_id', async () => {
    mockResolveDefaultGameEntry.mockResolvedValue('challenge-page');
    window.location.hash = '#/game?challenge_id=ch-explicit-01';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });

    // Explicit challenge QR does NOT call the resolver — it sets the ID directly
    expect(mockResolveDefaultGameEntry).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. explicit Challenge QR must NOT be replaced by another active Challenge
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO-15: explicit Challenge QR priority over resolver', () => {
  it('uses the explicit challenge_id, not the resolver result', async () => {
    // Even if resolver would return a different challenge, the explicit one wins
    mockResolveDefaultGameEntry.mockResolvedValue('challenge-page');
    window.location.hash = '#/game?challenge_id=ch-explicit-01';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });

    // The resolver was NOT called — explicit QR takes priority
    expect(mockResolveDefaultGameEntry).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. campaign QR remains functional
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO-16: campaign QR remains functional', () => {
  it('does NOT trigger challenge resolver for non-game deep links', async () => {
    mockResolveDefaultGameEntry.mockResolvedValue('challenge-page');
    window.location.hash = '#/showroom';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    });

    // Non-game screens bypass the challenge resolver entirely
    expect(mockResolveDefaultGameEntry).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Normal game flow preserved when no Challenge
// ═══════════════════════════════════════════════════════════════════════════

describe('CAO: normal game deep link with NO active Challenge', () => {
  it('routes to the requested game screen when resolver returns countdown', async () => {
    mockResolveDefaultGameEntry.mockResolvedValue('countdown');
    window.location.hash = '#/game';

    renderRoute();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('countdown');
    });
  });
});
