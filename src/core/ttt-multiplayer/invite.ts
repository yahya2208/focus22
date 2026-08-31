import { getAbsoluteBaseUrl } from '../base-path';

/**
 * Builds a deep-linkable invitation URL for a friend-play game.
 * The app uses hash routing, so the invite lands on the ttt-invite-landing
 * screen with the token in the query string:
 *   {origin}/#/ttt-invite-landing?invite=TOKEN
 */
export function buildTttInviteUrl(inviteToken: string, base = getAbsoluteBaseUrl()): string {
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  const token = encodeURIComponent(inviteToken);
  return `${normalized}/#/ttt-invite-landing?invite=${token}`;
}

/** Parses an invite token from a raw app hash path (`#/ttt-invite-landing?invite=...`). */
export function parseInviteFromHash(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const rest = hash.slice(2);
  const queryIndex = rest.indexOf('?');
  const screenPart = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  if (screenPart !== 'ttt-invite-landing') return null;
  const queryPart = queryIndex === -1 ? '' : rest.slice(queryIndex + 1);
  const params = new URLSearchParams(queryPart);
  return params.get('invite');
}

/** Copies an arbitrary string to the clipboard (returns true on success). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for environments without async clipboard (e.g. older/insecure contexts)
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Shares via the native Web Share API when supported.
 * Returns true when the share sheet was invoked; false when the API is
 * unavailable, the feature flag is off, or the user cancelled — the caller
 * falls back to copyText in those cases.
 */
export async function nativeShare(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
    await navigator.share(data);
    return true;
  } catch {
    return false;
  }
}
