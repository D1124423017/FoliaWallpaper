// Native wallpapers use the existing companion. An explicit live-player browser preview may select another local test port.
export function wallpaperServiceUrl(endpoint: string): string {
  const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search), raw = query.get('servicePort');
  const preview = typeof window !== 'undefined' && !window.__foliaWallpaperHost?.native && query.get('player') === '1';
  const candidate = raw && /^\d{4,5}$/.test(raw) ? Number(raw) : 3189;
  const port = preview && candidate >= 1024 && candidate <= 65535 ? candidate : 3189;
  return `http://127.0.0.1:${port}/${endpoint}`;
}
