import pkg from '../../package.json';

export const APP_NAME = 'FOCUS';

declare const __BUILD_COMMIT__: string | undefined;

export const APP_VERSION: string = pkg.version;
export const APP_BUILD_COMMIT: string = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';

export function versionLabel(): string {
  return `${APP_NAME} v${APP_VERSION}`;
}

export function buildLabel(): string {
  return APP_BUILD_COMMIT ? `Build ${APP_BUILD_COMMIT.slice(0, 7)}` : '';
}
