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
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});
