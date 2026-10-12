import { describe, expect, it } from 'vitest';
import { parseStreamingLink, STREAMING_APP_ORIGIN } from '../../src/utils/streamingLinks';
import cn from '../../src/i18n/locales/zh-CN';
import tw from '../../src/i18n/locales/zh-TW';
import { createRequire } from 'node:module';

// Public platform links are rebuilt from validated identifiers; locale interpolation must survive translation.
describe('official streaming links', () => {
    const track = '4cOdK2wGLETKBW3PvgPWqT';
    it.each([
        `https://open.spotify.com/track/${track}?si=ignored`,
        `https://open.spotify.com/intl-zh/track/${track}`,
        `spotify:track:${track}`,
    ])('loads a Spotify sharing link %s', value => {
        expect(parseStreamingLink(value)).toEqual({ provider: 'spotify', embedUrl: `https://open.spotify.com/embed/track/${track}?utm_source=generator`, publicUrl: `https://open.spotify.com/track/${track}` });
    });
    it.each(['https://youtu.be/M7lc1UVf-VE', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'https://music.youtube.com/watch?v=M7lc1UVf-VE', 'https://youtube.com/shorts/M7lc1UVf-VE'])('loads a YouTube link %s', value => {
        const result = parseStreamingLink(value)!;
        const embed = new URL(result.embedUrl);
        expect(embed.hostname).toBe('www.youtube-nocookie.com');
        expect(embed.pathname).toBe('/embed/M7lc1UVf-VE');
        expect(embed.searchParams.get('origin')).toBe(STREAMING_APP_ORIGIN);
        expect(embed.searchParams.has('autoplay')).toBe(false);
    });
    it('preserves playlists and start time', () => {
        const result = parseStreamingLink('https://youtube.com/watch?v=M7lc1UVf-VE&list=PLabcdefgh1234&t=42')!;
        expect(new URL(result.embedUrl).searchParams.get('list')).toBe('PLabcdefgh1234');
        expect(new URL(result.embedUrl).searchParams.get('start')).toBe('42');
        expect(new URL(result.publicUrl).searchParams.get('list')).toBe('PLabcdefgh1234');
        expect(parseStreamingLink('https://youtube.com/playlist?list=PLabcdefgh1234')?.embedUrl).toContain('/embed/videoseries?');
    });
    it.each(['javascript:alert(1)', 'file:///C:/test', 'http://youtu.be/M7lc1UVf-VE', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://evil.test/?v=M7lc1UVf-VE', 'https://user:password@youtube.com/watch?v=M7lc1UVf-VE', 'https://youtube.com:444/watch?v=M7lc1UVf-VE', 'https://open.spotify.com/track/invalid', 'https://youtube.com/watch?v=bad', 'https://youtube.com/', 'https://youtube.com/redirect?v=M7lc1UVf-VE'])('rejects invalid or foreign links %s', value => expect(parseStreamingLink(value)).toBeNull());
});

describe('Traditional Chinese dictionary', () => {
    const flatten = (value: Record<string, unknown>, prefix = ''): Record<string, string> => Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? [[prefix + key, item]] : Object.entries(flatten(item as Record<string, unknown>, prefix + key + '.'))));
    it('preserves every key and interpolation parameter', () => {
        const source = flatten(cn), translated = flatten(tw);
        expect(Object.keys(translated)).toEqual(Object.keys(source));
        for (const [key, value] of Object.entries(source)) expect(translated[key].match(/\{\{[^}]+\}\}/g) ?? [], key).toEqual(value.match(/\{\{[^}]+\}\}/g) ?? []);
        expect(tw.options.appLanguageZhTW).toBe('繁體中文（台灣）');
        expect(tw.streaming.load).toBe('載入播放器');
    });
});

describe('Electron streaming isolation', () => {
    const require = createRequire(import.meta.url);
    const { installStreamingEmbedIdentity, protectStreamingNavigation } = require('../../electron/streamingEmbeds.cjs');
    it('sets the documented identity only on YouTube embed requests', () => {
        let filter: any, handler: any;
        installStreamingEmbedIdentity({ webRequest: { onBeforeSendHeaders: (a: any, b: any) => { filter = a; handler = b; } } }, 'top.izuna.foliamajor');
        expect(filter.urls).toEqual(['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*']);
        let response: any;
        handler({ requestHeaders: { referer: 'file://local', 'X-Test': 'kept' } }, (result: any) => { response = result; });
        expect(response.requestHeaders).toEqual({ Referer: STREAMING_APP_ORIGIN + '/', 'X-Test': 'kept' });
    });
    it('opens official links externally and keeps other pages out of the app renderer', () => {
        let popup: any, navigate: any, prevented = false;
        const opened: string[] = [];
        protectStreamingNavigation({ setWindowOpenHandler: (h: any) => { popup = h; }, on: (_: any, h: any) => { navigate = h; } }, { openExternal: (url: string) => { opened.push(url); } });
        expect(popup({ url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' })).toEqual({ action: 'deny' });
        popup({ url: 'file:///C:/Windows/System32/cmd.exe' });
        navigate({ preventDefault: () => { prevented = true; } }, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
        expect(prevented).toBe(true);
        expect(opened).toHaveLength(2);
    });
});
