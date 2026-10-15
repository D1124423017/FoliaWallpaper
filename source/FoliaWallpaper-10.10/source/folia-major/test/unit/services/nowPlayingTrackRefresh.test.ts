import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NowPlayingProvider } from '@/services/nowPlayingProvider';

// test/unit/services/nowPlayingTrackRefresh.test.ts

class FakeSocket {
    static instances: FakeSocket[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor(_url: string) { FakeSocket.instances.push(this); }
    close() {}
    track(title: string, duration = 0) {
        this.onmessage?.({ data: JSON.stringify({ event: 'Track', data: { title, author: 'Artist', duration } }) });
    }
}

describe('Now Playing browser metadata refresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeSocket);
        vi.stubGlobal('window', { setTimeout, clearTimeout });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('fills a delayed browser duration without polling tracks that already have one', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ title: 'Song', author: 'Artist', duration: 200 }) });
        vi.stubGlobal('fetch', fetchMock);
        const provider = new NowPlayingProvider({}, { wsUrl: 'ws://127.0.0.1:9863/api/ws/lyric' });
        provider.start();
        FakeSocket.instances[0].track('Song');
        await vi.advanceTimersByTimeAsync(600);
        expect(provider.getSnapshot().track?.durationMs).toBe(200000);
        expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:9863/api/query/track');
        FakeSocket.instances[0].track('Next song', 180);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        provider.stop();
    });

    it('cannot resurrect old metadata after a song change or stopping the source', async () => {
        let finish!: (value: unknown) => void;
        vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
        const provider = new NowPlayingProvider();
        provider.start();
        FakeSocket.instances[0].track('Old song');
        await vi.advanceTimersByTimeAsync(600);
        FakeSocket.instances[0].track('New song', 180);
        finish({ ok: true, json: async () => ({ title: 'Old song', author: 'Artist', duration: 200 }) });
        await vi.advanceTimersByTimeAsync(0);
        expect(provider.getSnapshot().track?.title).toBe('New song');
        FakeSocket.instances[0].track('Pending song');
        await vi.advanceTimersByTimeAsync(600);
        provider.stop();
        finish({ ok: true, json: async () => ({ title: 'Pending song', author: 'Artist', duration: 200 }) });
        await vi.advanceTimersByTimeAsync(0);
        expect(provider.getSnapshot().track).toBeNull();
    });
});
