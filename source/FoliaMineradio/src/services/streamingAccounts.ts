import type { StreamingAccountRequest } from '../types/streamingAccounts';

// The fixed IPC surface handles official API requests in Electron, outside all third-party iframes.
export async function requestStreamingAccount<T>(request: StreamingAccountRequest): Promise<T> {
    if (!window.electron?.streamingAccountRequest) throw new Error('desktop_required');
    const result = await window.electron.streamingAccountRequest(request);
    if (!result.ok) throw new Error(result.error);
    return result.data as T;
}
