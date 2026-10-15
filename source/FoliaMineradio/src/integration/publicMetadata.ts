// Cover references are presentation data; account-bearing Subsonic or signed URLs stay in the host.
export function publicIntegrationCover(value: string | null | undefined): string {
  if (!value) return '';
  if (!/^https?:/i.test(value)) return /^(blob:|data:image\/|file:|folia-cover:)/i.test(value) ? value : '';
  try {
    const url = new URL(value);
    if (url.username || url.password || [...url.searchParams.keys()].some(key => /^(u|t|s)$|token|secret|password|auth|cookie|credential|signature|api.?key/i.test(key))) return '';
    return value;
  } catch { return ''; }
}
