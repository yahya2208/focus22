export function getBasePath(): string {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return base === '' ? '/' : base;
}

export function buildAppUrl(path: string): string {
  const base = getBasePath();
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}${path.replace(/^\//, '')}`;
}

export function getAbsoluteBaseUrl(): string {
  return new URL(buildAppUrl(''), window.location.origin).toString();
}
