import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StreamingProvider, StreamingTarget } from '../../types/streamingPlayer';
import type { SpotifyDevice, StreamingAccountStatus, StreamingLibraryItem, StreamingLibraryPage } from '../../types/streamingAccounts';
import { requestStreamingAccount } from '../../services/streamingAccounts';
import { useStreamingAccountsStore } from '../../stores/useStreamingAccountsStore';
import { parseStreamingLink } from '../../utils/streamingLinks';
import StreamingAccountSetup from './StreamingAccountSetup';

// Account-specific library browsing and Spotify Connect transport; embedded video uses only validated public IDs.
export default function StreamingAccountPanel({ provider, onPlay, onStopEmbed }: { provider: StreamingProvider; onPlay: (target: StreamingTarget) => void; onStopEmbed: () => void }) {
    const { t } = useTranslation();
    const status = useStreamingAccountsStore(state => state.statuses[provider]);
    const [editSetup, setEditSetup] = useState(false), [busy, setBusy] = useState(false), [connecting, setConnecting] = useState(false);
    const [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [playlists, setPlaylists] = useState<StreamingLibraryItem[]>([]), [tracks, setTracks] = useState<StreamingLibraryItem[]>([]);
    const [playlistNext, setPlaylistNext] = useState<string | null>(null), [trackNext, setTrackNext] = useState<string | null>(null);
    const [selected, setSelected] = useState<StreamingLibraryItem | null>(null);
    const [devices, setDevices] = useState<SpotifyDevice[]>([]), [deviceId, setDeviceId] = useState('');
    const alive = useRef(true);
    useEffect(() => { alive.current = true; void useStreamingAccountsStore.getState().refresh(); return () => { alive.current = false; }; }, []);
    const run = async (operation: () => Promise<void>) => {
        setBusy(true); setError(''); setNotice('');
        try { await operation(); } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : 'network_error'); }
        finally { if (alive.current) setBusy(false); }
    };
    const loadPlaylists = async (cursor = '') => {
        const page = await requestStreamingAccount<StreamingLibraryPage>({ provider, action: 'playlists', cursor });
        if (!alive.current) return;
        const saved = provider === 'spotify' ? [{ id: 'saved', title: t('streamingAccounts.savedSongs'), subtitle: 'Spotify', publicUrl: 'https://open.spotify.com/collection/tracks', playable: true }] : [];
        setPlaylists(previous => cursor ? [...previous, ...page.items] : [...saved, ...page.items]); setPlaylistNext(page.next); setSelected(null);
    };
    const loadTracks = async (playlist: StreamingLibraryItem, cursor = '') => {
        const page = await requestStreamingAccount<StreamingLibraryPage>({ provider, action: 'tracks', playlistId: playlist.id, cursor });
        if (!alive.current) return;
        setSelected(playlist); setTracks(previous => cursor ? [...previous, ...page.items] : page.items); setTrackNext(page.next);
    };
    const loadDevices = async () => {
        const next = await requestStreamingAccount<SpotifyDevice[]>({ provider, action: 'devices' });
        if (!alive.current) return;
        setDevices(next); setDeviceId(previous => next.some(item => item.id === previous) ? previous : next.find(item => item.active)?.id ?? next[0]?.id ?? '');
    };
    useEffect(() => {
        if (status?.connected) void run(async () => { await loadPlaylists(); if (provider === 'spotify') await loadDevices(); });
        else { setPlaylists([]); setTracks([]); setDevices([]); setSelected(null); }
    }, [status?.connected]);
    const accountAction = async (action: 'connect' | 'cancel' | 'disconnect') => {
        if (action === 'connect') setConnecting(true);
        try { useStreamingAccountsStore.getState().update(await requestStreamingAccount<StreamingAccountStatus>({ provider, action })); }
        finally { if (alive.current) setConnecting(false); }
    };
    const play = async (item: StreamingLibraryItem) => {
        if (provider === 'spotify') {
            onStopEmbed();
            await requestStreamingAccount({ provider, action: 'play', deviceId, uri: item.uri });
            if (alive.current) setNotice(t('streamingAccounts.playing', { title: item.title }));
        } else {
            const target = parseStreamingLink(item.publicUrl);
            if (target) onPlay(target);
        }
    };
    const buttonClass = 'rounded-lg border border-current/25 px-3 py-2 text-sm disabled:opacity-40 hover:bg-current/5';
    const items = selected ? tracks : playlists;
    const errorText = error ? t(`streamingAccounts.errors.${error}`, { defaultValue: t('streamingAccounts.errors.network_error') }) : '';
    return <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{provider === 'spotify' ? 'Spotify' : 'YouTube'}</h2>
            <span className="text-sm opacity-70">{status?.connected ? t('streamingAccounts.connectedAs', { name: status.displayName }) : t('streamingAccounts.signIn')}</span>
            {status?.configured && !status.connected && <button type="button" className={buttonClass} disabled={busy} onClick={() => void run(() => accountAction('connect'))}>{t('streamingAccounts.connect')}</button>}
            {connecting && <button type="button" className={buttonClass} onClick={() => void run(() => accountAction('cancel'))}>{t('streamingAccounts.cancel')}</button>}
            {status?.connected && <><button type="button" className={buttonClass} disabled={busy} onClick={() => void run(() => loadPlaylists())}>{t('streamingAccounts.refresh')}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => void run(async () => { onStopEmbed(); await accountAction('disconnect'); })}>{t('streamingAccounts.disconnect')}</button></>}
            {status?.configured && <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditSetup(value => !value)}>{t('streamingAccounts.editSetup')}</button>}
        </div>
        {connecting && <p role="status" className="text-sm">{t('streamingAccounts.waiting')}</p>}
        {errorText && <p role="alert" className="text-sm">{errorText}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {(!status?.configured || editSetup) && <StreamingAccountSetup provider={provider} status={status} busy={busy} onError={setError} onSave={config => run(async () => {
            useStreamingAccountsStore.getState().update(await requestStreamingAccount<StreamingAccountStatus>({ provider, action: 'configure', config }));
            if (alive.current) { setEditSetup(false); setNotice(t('streamingAccounts.settingsSaved')); }
        })} />}
        <p className="text-sm leading-6 opacity-75">{t(provider === 'spotify' ? 'streamingAccounts.spotifyNote' : 'streamingAccounts.youtubeNote')}</p>
        {status?.connected && provider === 'spotify' && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-current/20 p-4">
            <label className="text-sm">{t('streamingAccounts.spotifyDevice')}<select value={deviceId} onChange={event => setDeviceId(event.target.value)} className="ml-2 rounded-lg border border-current/20 p-2" style={{ background: 'var(--bg-color)' }}>{devices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void run(loadDevices)}>{t('streamingAccounts.devices')}</button>
            {(['previous', 'play', 'pause', 'next'] as const).map(action => <button key={action} type="button" disabled={busy || !deviceId} className={buttonClass} onClick={() => void run(async () => { onStopEmbed(); await requestStreamingAccount({ provider, action, deviceId }); })}>{t(`streamingAccounts.${action}`)}</button>)}
            {!devices.length && <p className="w-full text-sm opacity-70">{t('streamingAccounts.noDevices')}</p>}
        </div>}
        {status?.connected && <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3"><h3 className="font-semibold">{selected?.title ?? t('streamingAccounts.playlists')}</h3>{selected && <button type="button" className={buttonClass} disabled={busy} onClick={() => setSelected(null)}>{t('streamingAccounts.back')}</button>}</div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-current/10 rounded-xl border border-current/20">
                {items.map((item, index) => <li key={`${item.id}-${index}`} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0"><a className="block truncate text-sm underline" href={item.publicUrl} target="_blank" rel="noopener">{item.title}</a><p className="truncate text-xs opacity-60">{item.subtitle}</p></div>
                    <button type="button" className={buttonClass} disabled={busy || !!selected && (!item.playable || provider === 'spotify' && !deviceId)} title={selected && !item.playable ? t('streamingAccounts.unavailable') : undefined} onClick={() => void run(() => selected ? play(item) : loadTracks(item))}>{t(selected ? 'streamingAccounts.play' : 'streamingAccounts.tracks')}</button>
                </li>)}
            </ul>
            {!items.length && !busy && <p className="text-sm opacity-60">{t('streamingAccounts.empty')}</p>}
            {(selected ? trackNext : playlistNext) !== null && <button type="button" disabled={busy} className={`${buttonClass} self-start`} onClick={() => void run(() => selected ? loadTracks(selected, trackNext!) : loadPlaylists(playlistNext!))}>{t('streamingAccounts.more')}</button>}
        </div>}
        <p className="text-xs leading-5 opacity-60">{t('streamingAccounts.authorizationNote')}</p>
    </div>;
}
