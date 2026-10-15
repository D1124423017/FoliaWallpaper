import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicIntegrationCover } from '../../../src/integration/publicMetadata';
import { integrationDisplayCover, clearIntegrationDisplayCover } from '../../../src/integration/displayCover';

// Album art remains usable without passing Subsonic account-bearing URLs into the original frame.
afterEach(() => { clearIntegrationDisplayCover(); vi.unstubAllGlobals(); });
describe('public display cover', () => {
  it('keeps cached and public artwork but rejects account-bearing URLs', () => {
    expect(publicIntegrationCover('blob:current-cover')).toBe('blob:current-cover');
    expect(publicIntegrationCover('https://images.example/art.jpg')).toBe('https://images.example/art.jpg');
    for (const url of ['https://user:pass@music.example/art', 'https://music.example/art?u=qa&t=private&s=salt', 'https://music.example/art?token=private'])
      expect(publicIntegrationCover(url)).toBe('');
  });
  it('publishes bounded image bytes for the current private cover while keeping its URL out of the result', async () => {
    vi.stubGlobal('FileReader', class {
      result = 'data:image/png;base64,QQ=='; onload: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.()); }
    });
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['A'], { type: 'image/png' }) });
    vi.stubGlobal('fetch', fetch);
    const cover = 'https://music.example/art?u=qa&t=private&s=salt';
    expect(integrationDisplayCover(cover)).toBe('');
    await vi.waitFor(() => expect(integrationDisplayCover(cover)).toBe('data:image/png;base64,QQ=='));
    expect(fetch).toHaveBeenCalledOnce();
    expect(integrationDisplayCover(cover)).not.toContain('private');
    clearIntegrationDisplayCover();
  });
});
