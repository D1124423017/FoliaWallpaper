import { create } from 'zustand';
import type { StreamingProvider } from '../types/streamingPlayer';
import type { StreamingAccountStatus } from '../types/streamingAccounts';
import { requestStreamingAccount } from '../services/streamingAccounts';

// Only non-secret connection summaries are shared with account menu entries.
type StreamingAccountsState = {
    statuses: Partial<Record<StreamingProvider, StreamingAccountStatus>>;
    update: (status: StreamingAccountStatus) => void;
    refresh: () => Promise<void>;
};
export const useStreamingAccountsStore = create<StreamingAccountsState>((set, get) => ({
    statuses: {},
    update: status => set(state => ({ statuses: { ...state.statuses, [status.provider]: status } })),
    refresh: async () => {
        if (!window.electron?.streamingAccountRequest) return;
        await Promise.all(['spotify', 'youtube'].map(async provider => {
            try { get().update(await requestStreamingAccount<StreamingAccountStatus>({ provider: provider as StreamingProvider, action: 'status' })); }
            catch { /* Opening a menu must still work when the backend cannot read the encrypted store. */ }
        }));
    },
}));
