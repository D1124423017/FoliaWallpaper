const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { failure, validProvider, validateConfig, tokenRequest, createLoginSession } = require('./oauth.cjs');
const { createStreamingLibrary } = require('./library.cjs');

// Credentials use Electron safeStorage (Windows DPAPI). Only sanitized status/library results cross IPC.
const STORAGE_KEY = 'OFFICIAL_STREAMING_ACCOUNTS_V1';
function createStreamingAccounts({ store, safeStorage, shell, fetcher = fetch }) {
    const accounts = {}, sessions = new Map(), refreshes = new Map(), versions = { spotify: 0, youtube: 0 };
    for (const provider of ['spotify', 'youtube']) {
        try {
            const encrypted = store.get(`${STORAGE_KEY}.${provider}`);
            accounts[provider] = encrypted ? JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))) : {};
        } catch { accounts[provider] = {}; }
    }
    const save = provider => {
        if (!safeStorage.isEncryptionAvailable()) throw failure('encryption_unavailable');
        store.set(`${STORAGE_KEY}.${provider}`, safeStorage.encryptString(JSON.stringify(accounts[provider])).toString('base64'));
    };
    const status = provider => ({ provider, configured: !!accounts[provider]?.config, connected: !!accounts[provider]?.tokens, displayName: accounts[provider]?.profile?.displayName ?? null, premium: !!accounts[provider]?.profile?.premium, clientId: accounts[provider]?.config?.clientId ?? '', connecting: sessions.has(provider) });
    const cancel = provider => { versions[provider]++; sessions.get(provider)?.cancel(); sessions.delete(provider); };
    const getToken = async provider => {
        const account = accounts[provider];
        if (!account?.tokens || !account?.config) throw failure('not_connected');
        if (account.tokens.expiresAt > Date.now() + 30000) return account.tokens.accessToken;
        if (!account.tokens.refreshToken) throw failure('not_connected');
        if (!refreshes.has(provider)) {
            const version = versions[provider];
            refreshes.set(provider, (async () => {
                const fresh = await tokenRequest(provider, account.config, { grant_type: 'refresh_token', refresh_token: account.tokens.refreshToken }, fetcher);
                if (versions[provider] !== version) throw failure('auth_cancelled');
                account.tokens = { ...fresh, refreshToken: fresh.refreshToken || account.tokens.refreshToken };
                save(provider);
                return fresh.accessToken;
            })().finally(() => refreshes.delete(provider)));
        }
        return refreshes.get(provider);
    };
    const request = async (provider, route, options = {}, retry = true) => {
        const token = await getToken(provider);
        const origin = provider === 'spotify' ? 'https://api.spotify.com/v1' : 'https://www.googleapis.com/youtube/v3';
        let response;
        try { response = await fetcher(origin + route, { method: options.method || 'GET', headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000) }); }
        catch { throw failure('network_error'); }
        if (response.status === 401 && retry) { accounts[provider].tokens.expiresAt = 0; return request(provider, route, options, false); }
        if (!response.ok) throw failure({ 401: 'not_connected', 403: 'api_forbidden', 404: 'not_available', 429: 'rate_limited' }[response.status] || 'network_error');
        return response.status === 204 ? {} : response.json();
    };
    const library = createStreamingLibrary(request);
    const execute = async payload => {
        const provider = payload?.provider;
        if (!validProvider(provider)) throw failure('invalid_request');
        switch (payload.action) {
            case 'status': return status(provider);
            case 'configure': {
                const config = validateConfig(provider, payload.config);
                if (!safeStorage.isEncryptionAvailable()) throw failure('encryption_unavailable');
                cancel(provider); accounts[provider] = { config }; save(provider); return status(provider);
            }
            case 'connect': {
                if (!accounts[provider].config) throw failure('not_configured');
                if (sessions.has(provider)) throw failure('already_connecting');
                if (!safeStorage.isEncryptionAvailable()) throw failure('encryption_unavailable');
                const version = ++versions[provider];
                const account = accounts[provider];
                const pending = createLoginSession(provider, account.config, url => shell.openExternal(url), { fetcher });
                sessions.set(provider, { cancel: () => { void pending.then(session => session.cancel()).catch(() => {}); } });
                try {
                    const session = await pending;
                    const tokens = await session.result;
                    if (version !== versions[provider]) throw failure('auth_cancelled');
                    account.tokens = tokens;
                    try { account.profile = await library.profile(provider); }
                    catch (error) { delete account.tokens; throw error; }
                    if (version !== versions[provider]) throw failure('auth_cancelled');
                    save(provider); return { ...status(provider), connecting: false };
                } finally { if (version === versions[provider]) sessions.delete(provider); }
            }
            case 'cancel': cancel(provider); return status(provider);
            case 'disconnect': cancel(provider); accounts[provider] = { config: accounts[provider].config }; save(provider); return status(provider);
            case 'playlists': return library.playlists(provider, payload.cursor);
            case 'tracks': return library.tracks(provider, payload.playlistId, payload.cursor);
            case 'devices': if (provider !== 'spotify') throw failure('invalid_request'); return library.devices();
            case 'play': case 'pause': case 'next': case 'previous':
                if (provider !== 'spotify') throw failure('invalid_request');
                return library.playback(payload.action, payload.deviceId, payload.uri);
            default: throw failure('invalid_request');
        }
    };
    return { execute, dispose: () => { for (const provider of ['spotify', 'youtube']) cancel(provider); } };
}
function trustedSender(event, appPath) {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
    try {
        const actual = new URL(event.senderFrame.url), expected = pathToFileURL(path.join(appPath, 'dist/index.html'));
        return actual.protocol === 'file:' && actual.pathname.toLowerCase() === expected.pathname.toLowerCase();
    } catch { return false; }
}
function registerStreamingAccountIpc({ ipcMain, app, store, safeStorage, shell }) {
    const accounts = createStreamingAccounts({ store, safeStorage, shell });
    ipcMain.handle('streaming-account-request', async (event, payload) => {
        if (!trustedSender(event, app.getAppPath())) return { ok: false, error: 'invalid_request' };
        try { return { ok: true, data: await accounts.execute(payload) }; }
        catch (error) { return { ok: false, error: error.code || 'network_error' }; }
    });
    app.on('before-quit', accounts.dispose);
}
module.exports = { createStreamingAccounts, trustedSender, registerStreamingAccountIpc };
