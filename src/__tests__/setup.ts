import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Vitest is configured with `pool: forks, singleFork: true`, which reuses a
// single jsdom process across test files. A prior file's rendered DOM can
// occasionally bleed into the next file, making tests flaky (e.g. a leftover
// "running" Badge from the design-system snapshots failing a getByText).
// Unmount any RTL tree and hard-reset the DOM after every test so each file
// always starts from a clean document.
//
// The same single-fork reuse also persists `window.location` (pathname, search
// and hash) between test files. `App`'s InitialRoute reads `location.hash` on
// boot and REPLACEs to that screen, so a prior file leaving `#/showroom`
// (e.g. useScrollPreservation) made an App-rendering test land on Showroom
// instead of Home. Reset the URL to the bare path after every test too.
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});
