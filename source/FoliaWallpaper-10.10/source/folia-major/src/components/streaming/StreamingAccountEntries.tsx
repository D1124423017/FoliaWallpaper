import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Music2, Video } from 'lucide-react';
import { useStreamingAccountsStore } from '../../stores/useStreamingAccountsStore';
import { useStreamingPlayerStore } from '../../stores/useStreamingPlayerStore';
import type { StreamingProvider } from '../../types/streamingPlayer';

// Official OAuth account entries beside the existing QR-login providers, in both library layouts.
export default function StreamingAccountEntries({ variant, onClose }: { variant: 'bravais' | 'grid'; onClose?: () => void }) {
    const { t } = useTranslation();
    const statuses = useStreamingAccountsStore(state => state.statuses);
    useEffect(() => { void useStreamingAccountsStore.getState().refresh(); }, []);
    if (!window.electron?.streamingAccountRequest) return null;
    return <>{(['spotify', 'youtube'] as StreamingProvider[]).map(provider => {
        const label = provider === 'spotify' ? 'Spotify' : 'YouTube';
        const status = statuses[provider];
        const detail = status?.connected ? status.displayName : t('streamingAccounts.signIn');
        const Icon = provider === 'spotify' ? Music2 : Video;
        const button = <button type="button" role={variant === 'bravais' ? 'menuitem' : undefined}
            aria-label={t('streamingAccounts.openProvider', { provider: label })} title={detail || label}
            className={variant === 'grid' ? 'flex shrink-0 items-center gap-2 rounded-full border border-current/20 px-3 py-2 text-sm' : undefined}
            onClick={() => { onClose?.(); useStreamingPlayerStore.getState().open(provider); }}>
            <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${provider === 'spotify' ? 'bg-green-600' : 'bg-red-600'}`}><Icon size={22} /></span>
            <span className="is-text"><span className="is-name">{label}</span>{variant === 'bravais' && <span className="is-note">{detail}</span>}</span>
            {variant === 'bravais' && <LogIn aria-hidden className="is-login" />}
        </button>;
        return variant === 'bravais' ? <div key={provider} className="bravais-account-row" data-bravais-account-provider={provider}>{button}</div> : <span key={provider}>{button}</span>;
    })}</>;
}
