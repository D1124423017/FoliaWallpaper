import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// OAuth and official library integration are exercised without real accounts, credentials or remote requests.
const require = createRequire(import.meta.url);
const { createPkce, validateConfig, buildAuthorizationUrl, validateCallback, createLoginSession } = require('../../electron/streaming/oauth.cjs');
const { createStreamingLibrary } = require('../../electron/streaming/library.cjs');
const { createStreamingAccounts, trustedSender } = require('../../electron/streaming/accounts.cjs');
const clientId = '0123456789abcdef0123456789abcdef';
describe('desktop OAuth', () => {
    it('generates unpredictable state and an S256 challenge', () => {
        const pkce = createPkce();
        expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
        expect(createHash('sha256').update(pkce.verifier).digest('base64url')).toBe(pkce.challenge);
        expect(createPkce().state).not.toBe(pkce.state);
        const authorization = new URL(buildAuthorizationUrl('spotify', { clientId }, 'http://127.0.0.1:43821/callback/spotify', pkce));
        expect(authorization.origin).toBe('https://accounts.spotify.com');
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
        expect(authorization.searchParams.has('client_secret')).toBe(false);
    });
    it('rejects wrong state, wrong paths and denied consent', () => {
        expect(() => validateCallback(new URL('http://127.0.0.1/callback/spotify?state=wrong&code=x'), '/callback/spotify', 'expected')).toThrow('invalid_callback');
        expect(() => validateCallback(new URL('http://127.0.0.1/wrong?state=expected&code=x'), '/callback/spotify', 'expected')).toThrow('invalid_callback');
        expect(() => validateCallback(new URL('http://127.0.0.1/callback/spotify?state=expected&error=access_denied'), '/callback/spotify', 'expected')).toThrow('oauth_denied');
    });
    it('validates configuration and rejects web-client JSON formats', () => {
        expect(validateConfig('spotify', { clientId, clientSecret: 'unused' })).toEqual({ clientId });
        expect(validateConfig('youtube', { clientId: '123-example.apps.googleusercontent.com', clientSecret: 'GOCSPX-example' })).toHaveProperty('clientSecret');
        expect(() => validateConfig('spotify', { clientId: 'not-a-client' })).toThrow('invalid_client');
        expect(() => validateConfig('evil', { clientId })).toThrow('invalid_request');
    });
    it('completes a real loopback exchange only after a valid callback', async () => {
        let authorization: URL | undefined;
        const fetcher = vi.fn(async (_url: string, options: any) => {
            expect(options.body.get('code')).toBe('test-code');
            expect(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url')).toBe(authorization!.searchParams.get('code_challenge'));
            return new Response(JSON.stringify({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600 }), { status: 200 });
        });
        const session = await createLoginSession('spotify', { clientId }, async (url: string) => {
            authorization = new URL(url);
            const callback = new URL(authorization.searchParams.get('redirect_uri')!);
            callback.search = new URLSearchParams({ state: 'wrong', code: 'attacker-code' }).toString();
            expect((await fetch(callback)).status).toBe(400);
            expect(fetcher).not.toHaveBeenCalled();
            callback.search = new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'test-code' }).toString();
            expect((await fetch(callback)).status).toBe(200);
        }, { port: 0, fetcher });
        expect((await session.result).refreshToken).toBe('test-refresh-token');
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it('cancels a pending login and closes its listener', async () => {
        const session = await createLoginSession('youtube', { clientId: '123-example.apps.googleusercontent.com' }, async () => {}, { port: 0 });
        session.cancel();
        await expect(session.result).rejects.toThrow('auth_cancelled');
    });
});
describe('official library routes', () => {
    it('uses the current Spotify items endpoint and normalizes tracks', async () => {
        const request = vi.fn(async () => ({ items: [{ item: { id: clientId.slice(0, 22), type: 'track', name: 'Song', artists: [{ name: 'Artist' }] } }], next: 'next' }));
        const library = createStreamingLibrary(request);
        const page = await library.tracks('spotify', '4cOdK2wGLETKBW3PvgPWqT', '50');
        expect(request).toHaveBeenCalledWith('spotify', '/playlists/4cOdK2wGLETKBW3PvgPWqT/items?limit=50&offset=50');
        expect(page.next).toBe('51');
        expect(page.items[0].subtitle).toBe('Artist');
    });
    it('marks private YouTube videos as unavailable for anonymous embeds', async () => {
        const library = createStreamingLibrary(async () => ({ items: [{ contentDetails: { videoId: 'M7lc1UVf-VE' }, status: { privacyStatus: 'private' }, snippet: { title: 'Private video' } }] }));
        expect((await library.tracks('youtube', 'PLabcdefgh1234')).items[0].playable).toBe(false);
    });
    it('rejects URL injection before issuing an API request', async () => {
        const request = vi.fn(); const library = createStreamingLibrary(request);
        await expect(library.tracks('spotify', '../me/player')).rejects.toThrow('invalid_request');
        await expect(library.tracks('youtube', 'PLabcdefgh1234', 'https://evil.test')).rejects.toThrow('invalid_request');
        await expect(library.playback('play', 'device', 'https://evil.test')).rejects.toThrow('invalid_request');
        expect(request).not.toHaveBeenCalled();
    });
    it('sends playback commands to the selected official device', async () => {
        const request = vi.fn(async () => ({}));
        const library = createStreamingLibrary(request);
        await library.playback('play', 'device123', 'spotify:track:4cOdK2wGLETKBW3PvgPWqT');
        expect(request).toHaveBeenCalledWith('spotify', '/me/player/play?device_id=device123', { method: 'PUT', body: { uris: ['spotify:track:4cOdK2wGLETKBW3PvgPWqT'] } });
    });
});
describe('credential and IPC boundaries', () => {
    it('encrypts settings and returns only a sanitized status', async () => {
        const values = new Map();
        const encryptString = vi.fn(() => Buffer.from('opaque-encrypted-value'));
        const accounts = createStreamingAccounts({ store: { get: (key: string) => values.get(key), set: (key: string, value: string) => values.set(key, value) }, safeStorage: { isEncryptionAvailable: () => true, encryptString }, shell: {} });
        const status = await accounts.execute({ provider: 'youtube', action: 'configure', config: { clientId: '123-example.apps.googleusercontent.com', clientSecret: 'GOCSPX-private-value' } });
        expect(encryptString).toHaveBeenCalledOnce();
        expect(JSON.stringify(status)).not.toContain('private-value');
        expect(JSON.stringify([...values])).not.toContain('private-value');
        expect(status.connected).toBe(false);
        accounts.dispose();
    });
    it('refuses unencrypted persistence', async () => {
        const set = vi.fn();
        const accounts = createStreamingAccounts({ store: { get: () => undefined, set }, safeStorage: { isEncryptionAvailable: () => false }, shell: {} });
        await expect(accounts.execute({ provider: 'spotify', action: 'configure', config: { clientId } })).rejects.toThrow('encryption_unavailable');
        expect(set).not.toHaveBeenCalled(); accounts.dispose();
    });
    it('rejects iframe, remote and unrelated file senders', () => {
        const root = process.cwd(); const frame = { url: pathToFileURL(path.join(root, 'dist/index.html')).toString() };
        expect(trustedSender({ senderFrame: frame, sender: { mainFrame: frame } }, root)).toBe(true);
        expect(trustedSender({ senderFrame: frame, sender: { mainFrame: {} } }, root)).toBe(false);
        const remote = { url: 'https://open.spotify.com' };
        expect(trustedSender({ senderFrame: remote, sender: { mainFrame: remote } }, root)).toBe(false);
        const foreign = { url: pathToFileURL(path.join(root, 'foreign.html')).toString() };
        expect(trustedSender({ senderFrame: foreign, sender: { mainFrame: foreign } }, root)).toBe(false);
    });
});
