import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WallpaperSelect } from './WallpaperSelect';
import { automaticMediaSelection, mediaSelectionKey, readMediaSelection, isBrowserApplication, type MediaSourcesSnapshot } from './mediaSources';
import { wallpaperServiceUrl } from './serviceUrl';

// src/wallpaper/WallpaperSourceControls.tsx — live source picker; one selection shared by this machine's wallpapers.
export function WallpaperSourceControls({ isDaylight }: { isDaylight: boolean }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MediaSourcesSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const request = async (selection?: unknown, signal?: AbortSignal) => {
    const response = await fetch(wallpaperServiceUrl(selection ? 'media-source' : 'media-sources'), {
      method: selection ? 'POST' : 'GET', credentials: 'omit',
      ...(selection ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) } : {}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Source service unavailable');
    const value = await response.json() as MediaSourcesSnapshot;
    if (value.app !== 'FoliaWallpaperSources' || value.schema !== 1 || !readMediaSelection(value.selection)
      || !Array.isArray(value.sources) || value.sources.length > 24 || value.sources.some(source =>
        !readMediaSelection(source) || readMediaSelection(source)?.kind === 'auto' || typeof source.label !== 'string' || source.label.length > 300
        || typeof source.title !== 'string' || source.title.length > 500 || typeof source.artist !== 'string' || source.artist.length > 300
        || typeof source.playing !== 'boolean' || source.connected !== undefined && typeof source.connected !== 'boolean')) throw new Error('Invalid source service');
    return value;
  };
  useEffect(() => {
    const job = new AbortController(); alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!busy.current) try {
        const before = revision.current;
        const next = await request(undefined, job.signal);
        if (!job.signal.aborted && !busy.current && before === revision.current) { setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); setError(false); }
      } catch { if (!job.signal.aborted && !busy.current) setError(true); }
      if (!job.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => { alive.current = false; job.abort(); clearTimeout(timer); };
  }, []);
  const choose = async (key: string) => {
    if (busy.current) return;
    const selection = [automaticMediaSelection(), ...(snapshot?.sources ?? []), ...(snapshot ? [snapshot.selection] : [])]
      .find(value => mediaSelectionKey(value) === key);
    if (!selection) return;
    busy.current = true; revision.current++; setSaving(true);
    try { const next = await request({ kind: selection.kind, id: selection.id }); if (alive.current) {
      window.__foliaWallpaperHost?.emit('media-source-changed', next.selection);
      setSnapshot(next); setError(false);
    } }
    catch { if (alive.current) setError(true); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const selected = snapshot?.selection ?? automaticMediaSelection();
  const selectedSource = snapshot?.sources.find(value => mediaSelectionKey(value) === mediaSelectionKey(selected));
  const options = [{ value: mediaSelectionKey(automaticMediaSelection()), label: t('wallpaper.sourcesAuto') },
    ...(snapshot?.sources ?? []).map(source => ({ value: mediaSelectionKey(source), label:
      `${t(source.kind === 'browser' ? 'wallpaper.sourcesTab' : isBrowserApplication(source.id) ? 'wallpaper.sourcesWholeBrowser' : 'wallpaper.sourcesApp')} · ${source.label} · ${source.title}${source.connected === false ? ` · ${t('wallpaper.sourcesDisconnected')}` : ''}` }))];
  if (selected.kind !== 'auto' && !selectedSource) options.push({ value: mediaSelectionKey(selected), label: `${t('wallpaper.sourcesDisconnected')} · ${selected.kind === 'browser' ? t('wallpaper.sourcesTab') : selected.id}` });
  return <section className="wallpaper-source-controls" aria-label={t('wallpaper.sourcesTitle')}>
    <label>{t('wallpaper.sourcesTitle')}</label>
    <WallpaperSelect label={t('wallpaper.sourcesTitle')} value={mediaSelectionKey(selected)} options={options}
      onChange={value => void choose(value)} isDaylight={isDaylight} />
    <p role="status">{error ? t('wallpaper.sourcesError') : saving ? t('wallpaper.sourcesSaving')
      : selected.kind === 'auto' ? t('wallpaper.sourcesAutoHint') : !selectedSource || selectedSource.connected === false ? t('wallpaper.sourcesOfflineHint')
      : `${t(selectedSource.playing ? 'wallpaper.sourcesPlaying' : 'wallpaper.sourcesPaused')} · ${selectedSource.artist || selectedSource.title}`}</p>
    <small>{t('wallpaper.sourcesHint')}</small>
    {selected.kind === 'application' && isBrowserApplication(selected.id) && <p>{t('wallpaper.sourcesBrowserHint')}</p>}
    {!snapshot?.sources.some(source => source.kind === 'browser' && /youtube/i.test(source.label)) && <small>{t('wallpaper.sourcesYoutubeHint')}</small>}
  </section>;
}
