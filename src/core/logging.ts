/**
 * DEV-gated logging facade.
 *
 * Production builds never write these messages to the console — they become
 * no-ops (treeshaken where possible). Development builds keep the exact same
 * behaviour as plain console calls so debugging is unchanged.
 *
 * Real user-facing errors are handled by the UI, not by console output.
 */

const IS_DEV = import.meta.env.DEV;

export function devLog(...args: unknown[]): void {
  if (IS_DEV) console.log(...args);
}

export function devInfo(...args: unknown[]): void {
  if (IS_DEV) console.info(...args);
}

export function devWarn(...args: unknown[]): void {
  if (IS_DEV) console.warn(...args);
}

export function devError(...args: unknown[]): void {
  if (IS_DEV) console.error(...args);
}

export function devDebug(...args: unknown[]): void {
  if (IS_DEV) console.debug(...args);
}
