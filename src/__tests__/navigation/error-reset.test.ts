import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadModule() {
  return import('../../core/navigation/error-reset');
}

describe('error-reset bridge (Phase 3A)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers and unregisters reset handlers', async () => {
    const { registerAppReset, hasAppResetHandlers, requestInAppReset } = await loadModule();
    const handler = vi.fn();
    const unregister = registerAppReset(handler);
    expect(hasAppResetHandlers()).toBe(true);
    expect(requestInAppReset()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    unregister();
    expect(hasAppResetHandlers()).toBe(false);
    expect(requestInAppReset()).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runs all registered handlers and reports success', async () => {
    const { registerAppReset, requestInAppReset } = await loadModule();
    const a = vi.fn();
    const b = vi.fn();
    registerAppReset(a);
    registerAppReset(b);
    expect(requestInAppReset()).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns false when no handlers are registered (last-resort reload path)', async () => {
    const { hasAppResetHandlers, requestInAppReset } = await loadModule();
    expect(hasAppResetHandlers()).toBe(false);
    expect(requestInAppReset()).toBe(false);
  });

  it('unregister only removes its own handler', async () => {
    const { registerAppReset, requestInAppReset } = await loadModule();
    const a = vi.fn();
    const b = vi.fn();
    registerAppReset(a);
    const unregisterB = registerAppReset(b);
    unregisterB();
    expect(requestInAppReset()).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(0);
  });
});
