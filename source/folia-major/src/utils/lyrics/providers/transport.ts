// src/utils/lyrics/providers/transport.ts — optional host transport; providers keep parsing and normalization.
export type LyricProviderTransport = (url: string, init: RequestInit) => Promise<Response>;
