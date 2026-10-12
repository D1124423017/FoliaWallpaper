import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StreamingProvider } from '../../types/streamingPlayer';
import type { StreamingAccountStatus } from '../../types/streamingAccounts';

// The user creates their own official app; secrets are entered here locally, never copied into chat.
export default function StreamingAccountSetup({ provider, status, busy, onSave, onError }: {
    provider: StreamingProvider; status?: StreamingAccountStatus; busy: boolean;
    onSave: (config: { clientId: string; clientSecret?: string }) => Promise<void>; onError: (code: string) => void;
}) {
    const { t } = useTranslation();
    const [clientId, setClientId] = useState(status?.clientId ?? '');
    const [clientSecret, setClientSecret] = useState('');
    useEffect(() => { setClientId(status?.clientId ?? ''); }, [status?.clientId]);
    return <form className="flex flex-col gap-3 rounded-xl border border-current/20 p-4" onSubmit={event => { event.preventDefault(); void onSave({ clientId, clientSecret }); }}>
        <h2 className="font-semibold">{t('streamingAccounts.setup')}</h2>
        <p className="whitespace-pre-line text-sm leading-6 opacity-75">{t(provider === 'spotify' ? 'streamingAccounts.setupSpotify' : 'streamingAccounts.setupYoutube')}</p>
        <a href={provider === 'spotify' ? 'https://developer.spotify.com/dashboard' : 'https://console.cloud.google.com/apis/dashboard'} target="_blank" rel="noopener" className="self-start text-sm underline">{t('streamingAccounts.dashboard')}</a>
        {provider === 'youtube' && <label className="text-sm">{t('streamingAccounts.importGoogle')}
            <input type="file" accept=".json,application/json" disabled={busy} className="mt-2 block w-full text-sm" onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 32768) { onError('invalid_client'); return; }
                void file.text().then(text => {
                    const installed = JSON.parse(text)?.installed;
                    if (typeof installed?.client_id !== 'string') throw new Error('invalid_client');
                    setClientId(installed.client_id); setClientSecret(typeof installed.client_secret === 'string' ? installed.client_secret : '');
                }).catch(() => onError('invalid_client'));
            }} />
        </label>}
        <label className="text-sm">{t('streamingAccounts.clientId')}<input value={clientId} onChange={event => setClientId(event.target.value)} disabled={busy} autoComplete="off" className="mt-2 w-full rounded-lg border border-current/20 bg-transparent p-3" /></label>
        {provider === 'youtube' && <label className="text-sm">{t('streamingAccounts.clientSecret')}<input type="password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} disabled={busy} autoComplete="off" className="mt-2 w-full rounded-lg border border-current/20 bg-transparent p-3" /></label>}
        <p className="text-xs opacity-60">{t('streamingAccounts.setupChangeNote')}</p>
        <button type="submit" disabled={busy || !clientId.trim()} className="self-start rounded-lg border border-current/25 px-4 py-2 text-sm disabled:opacity-40">{t('streamingAccounts.save')}</button>
    </form>;
}
