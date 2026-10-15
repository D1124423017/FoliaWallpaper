import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, X, RotateCcw, Settings2 } from 'lucide-react';
import type { Theme, VisualizerMode, VisualizerBackgroundMode } from '../types';
import type { WebLyricSourceState } from '../types/webLyricSource';
import { getVisualizerModeLabel, getVisualizerRegistryEntry, VISUALIZER_REGISTRY } from '../components/visualizer/registry';
import { getVisualizerBackgroundModeLabel, getVisualizerBackgroundRegistryEntry, VISUALIZER_BACKGROUND_REGISTRY } from '../components/visualizer/backgrounds/registry';
import { VisualizerModeGlyph, BackgroundModeGlyph } from '../components/visualizer/modeGlyphs';
import ModeStepperRow from '../components/panelTab/controls/ModeStepperRow';
import { QuickControlChip } from '../components/shared/QuickControlChip';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { colorWithAlpha } from '../components/visualizer/colorMix';
import { useWallpaperPreferences } from './preferences';
import { wallpaperAppearance } from './appearance';
import { WallpaperControlBasics } from './WallpaperControlBasics';
import { WallpaperAppearanceTransfer } from './WallpaperAppearanceTransfer';
import type { WallpaperSettings } from './settings';
import { MineradioControls } from './mineradio/MineradioControls';
import { WallpaperControlScroll } from './WallpaperControlScroll';
import { WallpaperSourceControls } from './WallpaperSourceControls';

// src/wallpaper/WallpaperControls.tsx — original Folia mode pickers/panels in a compact desktop menu.
type Section = 'basic' | 'lyrics' | 'background';
interface Props { settings: WallpaperSettings; theme: Theme; track: WebLyricSourceState['track'] }
export const WallpaperControls = memo(function WallpaperControls({ settings, theme, track }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(settings.showSettings || settings.showSources);
  const [section, setSection] = useState<Section>('basic');
  const close = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const change = useWallpaperPreferences(state => state.change);
  const restoreEngine = useWallpaperPreferences(state => state.restoreEngine);
  const visual = useVisualizerSettingsStore();
  const assets = useVisualizerAssetStore();
  const appearance = useMemo(() => wallpaperAppearance(visual, assets, settings), [visual, assets, settings]);
  const modes = useMemo(() => VISUALIZER_REGISTRY.map(entry => ({ value: entry.mode, label: getVisualizerModeLabel(entry.mode, t) })), [t]);
  const backgrounds = useMemo(() => VISUALIZER_BACKGROUND_REGISTRY.filter(entry => entry.mode !== 'url')
    .map(entry => ({ value: entry.mode, label: getVisualizerBackgroundModeLabel(entry.mode, t) })), [t]);
  const entry = getVisualizerRegistryEntry(settings.mode);
  const backgroundEntry = getVisualizerBackgroundRegistryEntry(settings.background);
  const isDaylight = settings.themeVariant === 'light';
  useEffect(() => setOpen(settings.showSettings), [settings.showSettings]);
  useEffect(() => { if (settings.showSources) setOpen(true); }, [settings.showSources]);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const intensity = settings.animationIntensity === 'auto' ? theme.animationIntensity : settings.animationIntensity;
  const cycleIntensity = () => {
    const values = ['calm', 'normal', 'chaotic'];
    change({ animationintensity: values[(values.indexOf(intensity) + 1) % values.length] });
  };
  const step = (options: { value: string }[], current: string, direction: number) =>
    options[(options.findIndex(option => option.value === current) + direction + options.length) % options.length].value;
  const commonProps = { t: (key: string) => t(key), theme, isDaylight,
    controlCardBg: colorWithAlpha(theme.secondaryColor, .06), rangeInputClass: 'wallpaper-control-range w-full' };
  const style = { '--text-primary': theme.primaryColor, '--text-secondary': theme.secondaryColor,
    '--wallpaper-text': theme.primaryColor, '--wallpaper-background': theme.backgroundColor,
    '--wallpaper-accent': theme.accentColor, '--control-border': colorWithAlpha(theme.secondaryColor, .22) } as CSSProperties;
  return <div className="wallpaper-controls" style={style}>
    {settings.settingsButton && <button ref={trigger} className="wallpaper-controls-trigger" aria-label={t('wallpaper.controlsOpen')}
      aria-expanded={open} title={t('wallpaper.controlsOpen')} onClick={() => setOpen(value => !value)}><SlidersHorizontal size={19} /></button>}
    {open && <aside role="dialog" aria-label={t('wallpaper.controlsTitle')} aria-modal="false" className="wallpaper-controls-panel">
      <header><div><strong>{t('wallpaper.controlsTitle')}</strong><small>{t('wallpaper.controlsSaved')}</small></div>
        <button ref={close} aria-label={t('wallpaper.controlsClose')} onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={19} /></button>
      </header>
      <WallpaperControlScroll>
        <WallpaperSourceControls isDaylight={isDaylight} />
        <div className="wallpaper-controls-track">
          {track?.coverUrl ? <img src={track.coverUrl} alt="" /> : <div className="wallpaper-controls-cover-placeholder"><SlidersHorizontal size={36} /></div>}
          <strong>{track?.name ?? 'Folia Wallpaper'}</strong><small>{track?.artist ?? t('wallpaper.waiting')}</small>
        </div>
        <MineradioControls settings={settings} />
        <ModeStepperRow<VisualizerMode> value={settings.mode} options={modes}
          onSelect={mode => change({ visualizer: mode })} onStep={direction => change({ visualizer: step(modes, settings.mode, direction) })}
          renderGlyph={mode => <VisualizerModeGlyph mode={mode} />} ariaLabel={t('ui.animationMode')} moreLabel={t('wallpaper.controlsMore')}
          onOpenMore={() => setSection('lyrics')} isDaylight={isDaylight} primaryColor={theme.primaryColor}
          trailing={<QuickControlChip label={t(`animation.${intensity}`)} title={t('wallpaper.controlsIntensity')} isDaylight={isDaylight} onClick={cycleIntensity} />} />
        {settings.visualSystem === 'folia' && <ModeStepperRow<VisualizerBackgroundMode> value={settings.background} options={backgrounds}
          onSelect={mode => change({ background: mode })} onStep={direction => change({ background: step(backgrounds, settings.background, direction) })}
          renderGlyph={mode => <BackgroundModeGlyph mode={mode} />} ariaLabel={t('options.visualizerBackgroundMode')} moreLabel={t('wallpaper.controlsMore')}
          onOpenMore={() => setSection('background')} isDaylight={isDaylight} primaryColor={theme.primaryColor}
          trailing={backgroundEntry.renderQuickControls?.({ t: commonProps.t, theme, isDaylight, config: appearance.background, actions: appearance.actions })} />}
        <nav aria-label={t('wallpaper.controlsSections')}>
          {(['basic', 'lyrics', 'background'] as const).map(value => <button key={value} aria-pressed={section === value} onClick={() => setSection(value)}>
            <Settings2 size={14} />{t(`wallpaper.controls_${value}`)}</button>)}
        </nav>
        {section === 'basic' && <><WallpaperControlBasics settings={settings} /><WallpaperAppearanceTransfer settings={settings} />
          <button className="wallpaper-controls-reset" onClick={restoreEngine}><RotateCcw size={14} />{t('wallpaper.controlsRestoreEngine')}</button></>}
        {section === 'lyrics' && <>
          {entry.renderSettingsPanel?.({ ...commonProps, ...appearance.panel }) ?? <p>{t('wallpaper.controlsNoExtra')}</p>}
          {entry.resetSettings && <button className="wallpaper-controls-reset" onClick={() => entry.resetSettings?.(appearance.resets)}><RotateCcw size={14} />{t('wallpaper.controlsReset')}</button>}
        </>}
        {section === 'background' && <>
          {settings.visualSystem === 'mineradio' ? <p>{t('wallpaper.mineradioHint')}</p> : <>
          {backgroundEntry.renderSettingsPanel?.({ ...commonProps, config: appearance.background, actions: appearance.actions }) ?? <p>{t('wallpaper.controlsNoExtra')}</p>}
          {backgroundEntry.resetSettings && <button className="wallpaper-controls-reset" onClick={() => backgroundEntry.resetSettings?.(appearance.actions)}><RotateCcw size={14} />{t('wallpaper.controlsReset')}</button>}
          </>}
        </>}
      </WallpaperControlScroll>
    </aside>}
  </div>;
});
