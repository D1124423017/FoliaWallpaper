import type { StreamingProvider } from './streamingPlayer';

// Renderer-facing account data excludes access tokens, refresh tokens and client secrets.
export type StreamingAccountStatus = { provider: StreamingProvider; configured: boolean; connected: boolean; connecting: boolean; displayName: string | null; premium: boolean; clientId: string };
export type StreamingLibraryItem = { id: string; title: string; subtitle: string; publicUrl: string; playable: boolean; uri?: string };
export type StreamingLibraryPage = { items: StreamingLibraryItem[]; next: string | null };
export type SpotifyDevice = { id: string; name: string; active: boolean };
export type StreamingAccountRequest = {
    provider: StreamingProvider;
    action: 'status' | 'configure' | 'connect' | 'cancel' | 'disconnect' | 'playlists' | 'tracks' | 'devices' | 'play' | 'pause' | 'next' | 'previous';
    config?: { clientId: string; clientSecret?: string };
    cursor?: string;
    playlistId?: string;
    deviceId?: string;
    uri?: string;
};
export type StreamingAccountResponse = { ok: true; data: unknown } | { ok: false; error: string };
