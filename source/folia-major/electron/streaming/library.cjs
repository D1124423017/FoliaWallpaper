const { failure } = require('./oauth.cjs');

// Fixed official API routes. Tokens stay in the main process and never reach iframes or renderer storage.
function createStreamingLibrary(request) {
    const spotifyId = value => {
        if (!/^[A-Za-z0-9]{22}$/.test(value ?? '')) throw failure('invalid_request');
        return value;
    };
    const youtubeId = value => {
        if (!/^[A-Za-z0-9_-]{10,128}$/.test(value ?? '')) throw failure('invalid_request');
        return value;
    };
    const cursor = value => {
        const result = String(value ?? '');
        if (result.length > 1024 || /[^A-Za-z0-9_=-]/.test(result)) throw failure('invalid_request');
        return result;
    };
    const offset = value => {
        const result = Number(value || 0);
        if (!Number.isInteger(result) || result < 0 || result > 100000) throw failure('invalid_request');
        return result;
    };
    const page = (provider, data, items, position) => ({ items, next: provider === 'spotify' ? data.next ? String(position + data.items.length) : null : data.nextPageToken ?? null });
    return {
        async profile(provider) {
            if (provider === 'spotify') {
                const data = await request(provider, '/me');
                return { displayName: data.display_name || data.id || 'Spotify', premium: data.product === 'premium' };
            }
            const data = await request(provider, '/channels?part=snippet&mine=true');
            return { displayName: data.items?.[0]?.snippet?.title || 'YouTube', premium: false };
        },
        async playlists(provider, value) {
            if (provider === 'spotify') {
                const position = offset(value), data = await request(provider, `/me/playlists?limit=50&offset=${position}`);
                return page(provider, data, (data.items ?? []).filter(Boolean).map(item => ({ id: item.id, title: item.name, subtitle: item.owner?.display_name || '', publicUrl: `https://open.spotify.com/playlist/${item.id}`, playable: true })), position);
            }
            const data = await request(provider, `/playlists?part=snippet,status&mine=true&maxResults=50&pageToken=${encodeURIComponent(cursor(value))}`);
            return page(provider, data, (data.items ?? []).map(item => ({ id: item.id, title: item.snippet?.title || '', subtitle: item.status?.privacyStatus || '', publicUrl: `https://www.youtube.com/playlist?list=${item.id}`, playable: item.status?.privacyStatus !== 'private' })), 0);
        },
        async tracks(provider, playlistId, value) {
            if (provider === 'spotify') {
                const position = offset(value), route = playlistId === 'saved' ? '/me/tracks' : `/playlists/${spotifyId(playlistId)}/items`;
                const data = await request(provider, `${route}?limit=50&offset=${position}`);
                const items = (data.items ?? []).flatMap(entry => {
                    const item = entry.item ?? entry.track;
                    if (!item || entry.is_local || !item.id || !['track', 'episode'].includes(item.type)) return [];
                    return [{ id: item.id, title: item.name, subtitle: item.artists?.map(artist => artist.name).join(', ') || item.show?.name || '', publicUrl: `https://open.spotify.com/${item.type}/${item.id}`, uri: `spotify:${item.type}:${item.id}`, playable: item.is_playable !== false }];
                });
                return page(provider, data, items, position);
            }
            const data = await request(provider, `/playlistItems?part=snippet,contentDetails,status&playlistId=${youtubeId(playlistId)}&maxResults=50&pageToken=${encodeURIComponent(cursor(value))}`);
            return page(provider, data, (data.items ?? []).flatMap(item => {
                const id = item.contentDetails?.videoId;
                if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? '')) return [];
                return [{ id, title: item.snippet?.title || '', subtitle: item.snippet?.videoOwnerChannelTitle || '', publicUrl: `https://www.youtube.com/watch?v=${id}`, playable: item.status?.privacyStatus !== 'private' && !['Private video', 'Deleted video'].includes(item.snippet?.title) }];
            }), 0);
        },
        async devices() {
            const data = await request('spotify', '/me/player/devices');
            return (data.devices ?? []).filter(device => device.id && !device.is_restricted).map(device => ({ id: device.id, name: device.name, active: device.is_active }));
        },
        async playback(action, deviceId, uri) {
            if (deviceId && !/^[A-Za-z0-9_-]{1,256}$/.test(deviceId)) throw failure('invalid_request');
            const route = { play: 'play', pause: 'pause', next: 'next', previous: 'previous' }[action];
            if (!route) throw failure('invalid_request');
            const suffix = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
            let body;
            if (uri) {
                if (!/^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(uri)) throw failure('invalid_request');
                body = { uris: [uri] };
            }
            await request('spotify', `/me/player/${route}${suffix}`, { method: ['next', 'previous'].includes(action) ? 'POST' : 'PUT', ...(action === 'play' && body ? { body } : {}) });
            return true;
        },
    };
}
module.exports = { createStreamingLibrary };
