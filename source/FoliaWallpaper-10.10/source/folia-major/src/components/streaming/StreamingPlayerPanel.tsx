import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Music2, Play, X } from 'lucide-react';
import { parseStreamingLink } from '../../utils/streamingLinks';
import type { StreamingTarget } from '../../types/streamingPlayer';
import { useStreamingPlayerStore } from '../../stores/useStreamingPlayerStore';
import StreamingAccountPanel from './StreamingAccountPanel';
import type { StreamingProvider } from '../../types/streamingPlayer';

// src/components/streaming/StreamingPlayerPanel.tsx — user-loaded official Spotify/YouTube players.
export default function StreamingPlayerPanel() {
    const { t } = useTranslation();
    const close = useStreamingPlayerStore(state => state.close);
    const selectedProvider = useStreamingPlayerStore(state => state.selectedProvider);
    const [view, setView] = useState<StreamingProvider | 'link'>(selectedProvider);
    const [link, setLink] = useState('');
    const [target, setTarget] = useState<StreamingTarget | null>(null);
    const [loadCount, setLoadCount] = useState(0);
    const [error, setError] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const panel = useRef<HTMLElement>(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        (input.current ?? panel.current?.querySelector<HTMLElement>('button'))?.focus();
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key === 'Tab') {
                const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], iframe') ?? []);
                const first = items[0], last = items.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', escape, true);
        return () => {
            document.removeEventListener('keydown', escape, true);
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, [close]);
    useEffect(() => { setView(selectedProvider); setTarget(null); }, [selectedProvider]);
    const load = (event: React.FormEvent) => {
        event.preventDefault();
        const parsed = parseStreamingLink(link);
        setError(!parsed);
        if (parsed) { setTarget(parsed); setLoadCount(count => count + 1); }
    };
    return (
        <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="streaming-player-title"
            className="absolute inset-0 z-[10001] flex flex-col overflow-y-auto p-5 sm:p-8"
            style={{ background: 'var(--bg-color, #09090b)', color: 'var(--text-primary, white)', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <header className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3"><Music2 size={24} /><h1 id="streaming-player-title" className="text-xl font-semibold">{t('streaming.title')}</h1></div>
                    <button type="button" onClick={close} aria-label={t('streaming.close')} title={t('streaming.close')} className="rounded-lg p-2 hover:bg-white/10"><X /></button>
                </header>
                <nav aria-label={t('streamingAccounts.title')} className="flex flex-wrap gap-2">
                    {(['spotify', 'youtube', 'link'] as const).map(tab => <button key={tab} type="button" aria-pressed={view === tab} className={`rounded-lg border border-current/20 px-4 py-2 text-sm ${view === tab ? 'bg-current/10' : ''}`} onClick={() => { setView(tab); setTarget(null); }}>
                        {tab === 'link' ? t('streamingAccounts.linkTab') : tab === 'spotify' ? 'Spotify' : 'YouTube'}
                    </button>)}
                </nav>
                {view !== 'link' && <StreamingAccountPanel key={view} provider={view} onStopEmbed={() => setTarget(null)} onPlay={next => { setTarget(next); setLoadCount(count => count + 1); }} />}
                {view === 'link' && <>
                <p className="text-sm opacity-70">{t('streaming.description')}</p>
                <form onSubmit={load} className="flex flex-wrap gap-3">
                    <label htmlFor="streaming-link" className="sr-only">{t('streaming.linkLabel')}</label>
                    <input id="streaming-link" ref={input} value={link} onChange={event => setLink(event.target.value)} type="text" autoComplete="off"
                        placeholder={t('streaming.placeholder')} className="min-w-64 flex-1 rounded-xl border border-current/20 bg-transparent px-4 py-3 text-sm" />
                    <button type="submit" className="flex items-center gap-2 rounded-xl border border-current/25 px-5 py-3 hover:bg-white/10"><Play size={18} />{t('streaming.load')}</button>
                </form>
                {error && <p role="alert" className="text-sm">{t('streaming.invalidLink')}</p>}
                </>}
                {target ? (
                    <div className="flex flex-col gap-3">
                        <iframe key={loadCount} title={t('streaming.frameTitle', { provider: target.provider === 'spotify' ? 'Spotify' : 'YouTube' })}
                            src={target.embedUrl} className="w-full rounded-xl border-0" style={{ height: target.provider === 'spotify' ? 352 : 'auto', aspectRatio: target.provider === 'youtube' ? '16/9' : undefined, minHeight: target.provider === 'youtube' ? 240 : 352 }}
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="eager" referrerPolicy="strict-origin-when-cross-origin" />
                        <p className="text-sm opacity-70">{t(target.provider === 'spotify' ? 'streaming.spotifyNote' : 'streaming.youtubeNote')}</p>
                        <a href={target.publicUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-2 self-start text-sm underline"><ExternalLink size={15} />{t('streaming.openOfficial')}</a>
                    </div>
                ) : view === 'link' ? (
                    <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-current/15 p-8 text-center">
                        <Music2 size={40} className="opacity-50" /><p>{t('streaming.empty')}</p>
                        <p className="max-w-xl text-sm opacity-60">{t('streaming.examples')}</p>
                    </div>
                ) : null}
                {(target || view === 'link') && <p className="text-xs opacity-60">{t('streaming.controlNote')}</p>}
            </div>
        </section>
    );
}
