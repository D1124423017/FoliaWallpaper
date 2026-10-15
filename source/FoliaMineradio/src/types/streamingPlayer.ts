// src/types/streamingPlayer.ts — public links accepted by the official embedded players.
export type StreamingProvider = 'spotify' | 'youtube';
export type StreamingTarget = {
    provider: StreamingProvider;
    embedUrl: string;
    publicUrl: string;
};
