import { useTranslation } from 'react-i18next';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useWallpaperPreferences } from './preferences';
import type { WallpaperSettings } from './settings';
import { WallpaperSelect } from './WallpaperSelect';

// src/wallpaper/WallpaperControlBasics.tsx — wallpaper-only appearance controls; playback stays external.
export function WallpaperControlBasics({ settings }: { settings: WallpaperSettings }) {
  const { t } = useTranslation();
  const change = useWallpaperPreferences(state => state.change);
  const opacity = useVisualizerSettingsStore(state => state.visualizerOpacity);
  const setOpacity = useVisualizerSettingsStore(state => state.handleSetVisualizerOpacity);
  return <div className="wallpaper-control-basics">
    <label><span>{t('wallpaper.controlsIntensity')}</span>
      <WallpaperSelect label={t('wallpaper.controlsIntensity')} value={settings.animationIntensity} isDaylight={settings.themeVariant === 'light'}
        onChange={value => change({ animationintensity: value })}
        options={[{ value: 'auto', label: t('wallpaper.controlsIntensityAuto') },
          ...(['calm', 'normal', 'chaotic'] as const).map(value => ({ value, label: t(`animation.${value}`) }))]} />
    </label>
    <p>{t('wallpaper.controlsIntensityHint')}</p>
    <label><span>{t('wallpaper.controlsTheme')}</span>
      <WallpaperSelect label={t('wallpaper.controlsTheme')} value={settings.aiTheme ? 'ai' : 'cover'} isDaylight={settings.themeVariant === 'light'}
        onChange={value => change({ themesource: value })}
        options={[{ value: 'cover', label: t('wallpaper.controlsCover') }, { value: 'ai', label: t('wallpaper.controlsAi') }]} />
    </label>
    <label><span>{t('wallpaper.controlsBrightness')}</span>
      <WallpaperSelect label={t('wallpaper.controlsBrightness')} value={settings.themeVariant} isDaylight={settings.themeVariant === 'light'}
        onChange={value => change({ themevariant: value })}
        options={[{ value: 'dark', label: t('wallpaper.controlsDark') }, { value: 'light', label: t('wallpaper.controlsLight') }]} />
    </label>
    <label><span>{t('wallpaper.controlsScale')} <output>{Math.round(settings.lyricsScale * 100)}%</output></span>
      <input type="range" min={60} max={160} step={5} value={Math.round(settings.lyricsScale * 100)} onChange={event => change({ lyricsscale: +event.target.value })} />
    </label>
    <label><span>{t('wallpaper.controlsOpacity')} <output>{Math.round(opacity * 100)}%</output></span>
      <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)} onChange={event => setOpacity(+event.target.value / 100)} />
    </label>
    <label><span>{t('wallpaper.controlsAudioGain')} <output>{Math.round(settings.audioGain * 100)}%</output></span>
      <input type="range" min={0} max={300} step={5} value={Math.round(settings.audioGain * 100)} onChange={event => change({ audiogain: +event.target.value })} />
    </label>
    <label><span>{t('wallpaper.controlsOffset')} <output>{Math.round(settings.offsetSec * 1000)} ms</output></span>
      <input type="range" min={-5000} max={5000} step={50} value={Math.round(settings.offsetSec * 1000)} onChange={event => change({ lyricsoffset: +event.target.value })} />
    </label>
    <label className="wallpaper-control-check"><span>{t('wallpaper.controlsMetadata')}</span>
      <input type="checkbox" checked={settings.metadata} onChange={event => change({ showmetadata: event.target.checked })} />
    </label>
    <label className="wallpaper-control-check"><span>{t('wallpaper.controlsButton')}</span>
      <input type="checkbox" checked={settings.settingsButton} onChange={event => change({ settingsbutton: event.target.checked })} />
    </label>
  </div>;
}
