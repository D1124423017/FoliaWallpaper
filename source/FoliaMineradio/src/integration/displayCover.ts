import { publicIntegrationCover } from './publicMetadata';

// Resolve only the current host-owned cover. The original view receives image bytes, never an authenticated URL.
let coverKey = '', inlineCover = '', job: AbortController | null = null;
export function integrationDisplayCover(cover: string | null): string {
  const publicCover = publicIntegrationCover(cover);
  if (publicCover || !cover || !/^https?:/i.test(cover) || typeof FileReader === 'undefined') {
    if (coverKey !== (cover || '')) clearIntegrationDisplayCover();
    return publicCover;
  }
  if (coverKey !== cover) {
    job?.abort(); coverKey = cover; inlineCover = '';
    const request = job = new AbortController();
    void fetch(cover, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) }).then(async response => {
      if (!response.ok) return;
      const blob = await response.blob();
      if (blob.size > 500000 || !/^image\/(?:png|jpeg|webp)$/.test(blob.type)) return;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Cover unavailable')); reader.readAsDataURL(blob);
      });
      if (!request.signal.aborted && job === request) inlineCover = data;
    }).catch(() => { /* A denied or oversized cover uses the original fallback artwork. */ });
  }
  return inlineCover;
}
export function clearIntegrationDisplayCover() { job?.abort(); job = null; coverKey = ''; inlineCover = ''; }
