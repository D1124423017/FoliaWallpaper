const crypto = require('node:crypto');
const http = require('node:http');

// Official desktop OAuth: system browser, loopback callback, state validation and PKCE; no embedded login page.
const definitions = {
    spotify: { authorize: 'https://accounts.spotify.com/authorize', token: 'https://accounts.spotify.com/api/token', scope: 'user-read-private user-library-read playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state', port: 43821 },
    youtube: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/youtube.readonly', port: 0 },
};
const failure = code => Object.assign(new Error(code), { code });
const validProvider = provider => Object.hasOwn(definitions, provider);
function validateConfig(provider, input) {
    if (!validProvider(provider)) throw failure('invalid_request');
    const clientId = String(input?.clientId ?? '').trim();
    const clientSecret = String(input?.clientSecret ?? '').trim();
    if (provider === 'spotify' ? !/^[a-f0-9]{32}$/i.test(clientId) : !/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw failure('invalid_client');
    if (clientSecret.length > 512 || /[\x00-\x20]/.test(clientSecret)) throw failure('invalid_client');
    return { clientId, ...(provider === 'youtube' && clientSecret ? { clientSecret } : {}) };
}
function createPkce() {
    const verifier = crypto.randomBytes(48).toString('base64url');
    return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), state: crypto.randomBytes(32).toString('base64url') };
}
function buildAuthorizationUrl(provider, config, redirect, pkce) {
    const definition = definitions[provider];
    const url = new URL(definition.authorize);
    url.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: redirect, scope: definition.scope, state: pkce.state, code_challenge: pkce.challenge, code_challenge_method: 'S256', ...(provider === 'youtube' ? { access_type: 'offline', prompt: 'consent' } : {}) }).toString();
    return url.toString();
}
function validateCallback(url, expectedPath, state) {
    if (url.pathname !== expectedPath) throw failure('invalid_callback');
    const received = Buffer.from(url.searchParams.get('state') ?? '');
    const expected = Buffer.from(state);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw failure('invalid_callback');
    if (url.searchParams.has('error')) throw failure('oauth_denied');
    const code = url.searchParams.get('code');
    if (!code || code.length > 4096) throw failure('invalid_callback');
    return code;
}
async function tokenRequest(provider, config, fields, fetcher = fetch) {
    const body = new URLSearchParams({ client_id: config.clientId, ...fields });
    if (provider === 'youtube' && config.clientSecret) body.set('client_secret', config.clientSecret);
    let response;
    try { response = await fetcher(definitions[provider].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw failure('network_error'); }
    if (!response.ok) throw failure(response.status === 400 || response.status === 401 ? 'authorization_failed' : 'network_error');
    const data = await response.json();
    if (typeof data.access_token !== 'string' || data.access_token.length < 8 || !Number.isFinite(data.expires_in)) throw failure('authorization_failed');
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
async function createLoginSession(provider, config, openExternal, options = {}) {
    const pkce = createPkce(), callbackPath = `/callback/${provider}`;
    let settle, reject, completed = false, timer;
    const codePromise = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
    // Cancellation can happen while the system browser is opening; always attach a rejection observer.
    void codePromise.catch(() => {});
    const complete = (error, code) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        server.close();
        if (error) reject(error); else settle(code);
    };
    const server = http.createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        const host = `127.0.0.1:${server.address()?.port}`;
        if (request.method !== 'GET' || request.headers.host !== host) { response.writeHead(400).end('Invalid callback'); return; }
        let code;
        try { code = validateCallback(new URL(request.url, `http://${host}`), callbackPath, pkce.state); }
        catch (error) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('授權未完成，請返回 Folia。');
            if (error.code === 'oauth_denied') complete(error);
            return;
        }
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('已收到授權。請關閉這個分頁，返回 Folia 等待帳號連線完成。');
        complete(null, code);
    });
    await new Promise((resolve, fail) => {
        server.once('error', error => { fail(failure(error.code === 'EADDRINUSE' ? 'port_in_use' : 'network_error')); });
        server.listen(options.port ?? definitions[provider].port, '127.0.0.1', resolve);
    });
    const redirect = `http://127.0.0.1:${server.address().port}${callbackPath}`;
    timer = setTimeout(() => complete(failure('auth_timeout')), options.timeout ?? 300000);
    timer.unref();
    const result = (async () => {
        try {
            await openExternal(buildAuthorizationUrl(provider, config, redirect, pkce));
            const code = await codePromise;
            return await tokenRequest(provider, config, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: pkce.verifier }, options.fetcher);
        } catch (error) { complete(error); throw error; }
    })();
    return { result, cancel: () => complete(failure('auth_cancelled')) };
}
module.exports = { definitions, failure, validProvider, validateConfig, createPkce, buildAuthorizationUrl, validateCallback, tokenRequest, createLoginSession };
