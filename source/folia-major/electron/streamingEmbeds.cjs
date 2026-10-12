// electron/streamingEmbeds.cjs — supplies YouTube's documented desktop client identity.
function installStreamingEmbedIdentity(ses, appId) {
    const identity = `https://${appId.toLowerCase()}/`;
    ses.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'] }, (details, callback) => {
        const headers = { ...details.requestHeaders };
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'referer') delete headers[key];
        headers.Referer = identity;
        callback({ requestHeaders: headers });
    });
}

// Keep third-party pages out of the privileged application renderer; user-requested links open externally.
function protectStreamingNavigation(contents, shell) {
    const open = value => {
        try {
            const url = new URL(value);
            // Preserve existing GitHub/help links while refusing executable and local-file protocols.
            if (url.protocol === 'https:' && !url.username && !url.password) void Promise.resolve(shell.openExternal(url.toString())).catch(() => {});
        } catch { /* Invalid links cannot navigate the application window. */ }
    };
    contents.setWindowOpenHandler(({ url }) => { open(url); return { action: 'deny' }; });
    contents.on('will-navigate', (event, url) => {
        if (/^https?:/i.test(url)) { event.preventDefault(); open(url); }
    });
}
module.exports = { installStreamingEmbedIdentity, protectStreamingNavigation };
