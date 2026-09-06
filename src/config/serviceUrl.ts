export function normalizeServiceBaseUrl(url: string): string {
  let u = (url || '').trim().replace(/\/$/, '');
  while (u.toLowerCase().endsWith('/api')) {
    u = u.slice(0, -4).replace(/\/$/, '');
  }
  return u;
}

export function parseCommaSeparatedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
