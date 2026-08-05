import { describe, it, expect } from 'vitest';
import { APP_NAME, APP_VERSION, APP_BUILD_COMMIT, versionLabel, buildLabel } from '../../core/version';

describe('version (single source from package.json)', () => {
  it('exposes the launch version and label', () => {
    expect(APP_NAME).toBe('FOCUS');
    expect(APP_VERSION).toBe('2.0.1');
    expect(versionLabel()).toBe('FOCUS v2.0.1');
  });

  it('build label is safe when no build commit is injected', () => {
    expect(typeof APP_BUILD_COMMIT).toBe('string');
    expect(buildLabel()).toBe('');
  });
});
