import type { StreamingTarget } from '../types/streamingPlayer';

// src/utils/streamingLinks.ts — validates links without fetching arbitrary user-supplied URLs.
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'artist', 'episode', 'show']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
export const STREAMING_APP_ORIGIN = 'https://top.izuna.foliamajor';

const spotifyTarget = (kind: string, id: string): StreamingTarget | null => {
    if (!SPOTIFY_KINDS.has(kind) || !/^[A-Za-z0-9]{22}$/.test(id)) return null;
    return {
        provider: 'spotify',
        embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`,
        publicUrl: `https://open.spotify.com/${kind}/${id}`,
    };
};

// Accept only canonical platform hosts and identifiers, then construct fresh embed URLs.
export const parseStreamingLink = (input: string): StreamingTarget | null => {
    const value = input.trim();
    const uri = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{22})$/.exec(value);
    if (uri) return spotifyTarget(uri[1], uri[2]);
    let url: URL;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.split('/').filter(Boolean);
    if (host === 'open.spotify.com') {
        if (/^intl-[a-z-]+$/i.test(path[0] ?? '')) path.shift();
        if (path[0] === 'embed') path.shift();
        return path.length === 2 ? spotifyTarget(path[0], path[1]) : null;
    }
    if (!YOUTUBE_HOSTS.has(host)) return null;
    if (host === 'youtu.be' ? path.length !== 1 : !['watch', 'playlist', 'embed', 'shorts', 'live'].includes(path[0])) return null;
    let video = host === 'youtu.be' ? path[0] : url.searchParams.get('v');
    if (['embed', 'shorts', 'live'].includes(path[0])) video = path[1];
    const playlist = url.searchParams.get('list');
    if (video === 'videoseries') video = null;
    if (video && !/^[A-Za-z0-9_-]{11}$/.test(video)) return null;
    if (playlist && !/^[A-Za-z0-9_-]{10,128}$/.test(playlist)) return null;
    if (!video && !playlist) return null;
    const params = new URLSearchParams({ playsinline: '1', hl: 'zh-TW', enablejsapi: '1', origin: STREAMING_APP_ORIGIN, widget_referrer: STREAMING_APP_ORIGIN });
    if (playlist) params.set('list', playlist);
    const time = url.searchParams.get('t') ?? url.searchParams.get('start');
    if (time && /^\d{1,6}$/.test(time)) params.set('start', String(Number(time)));
    return {
        provider: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${video ?? 'videoseries'}?${params}`,
        publicUrl: video ? `https://www.youtube.com/watch?v=${video}${playlist ? `&list=${playlist}` : ''}` : `https://www.youtube.com/playlist?list=${playlist}`,
    };
};
