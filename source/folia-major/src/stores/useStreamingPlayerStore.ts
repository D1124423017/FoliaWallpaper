import { create } from 'zustand';
import type { StreamingProvider } from '../types/streamingPlayer';

// src/stores/useStreamingPlayerStore.ts — transient player visibility, separate from local music data.
type StreamingPlayerState = { isOpen: boolean; selectedProvider: StreamingProvider; open: (provider?: StreamingProvider) => void; close: () => void };
export const useStreamingPlayerStore = create<StreamingPlayerState>(set => ({
    isOpen: false,
    selectedProvider: 'spotify',
    open: (provider = 'spotify') => set({ isOpen: true, selectedProvider: provider }),
    close: () => set({ isOpen: false }),
}));
