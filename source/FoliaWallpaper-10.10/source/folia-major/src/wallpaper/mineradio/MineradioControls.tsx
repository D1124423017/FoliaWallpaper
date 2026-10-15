import { useTranslation } from 'react-i18next';
import type { WallpaperSettings } from '../settings';
import { useWallpaperPreferences, type WallpaperControlKey } from '../preferences';
import { MINERADIO_PRESETS } from './presets';
import { WallpaperSelect } from '../WallpaperSelect';

// Public wallpaper controls are saved/exported using the same preference whitelist as Folia.
export function MineradioControls({ settings }: { settings: WallpaperSettings }) {
  const { t } = useTranslation();
  const change = useWallpaperPreferences(state => state.change);
  const ranges = [
    ['mineradiointensity', 'mineradioIntensity', settings.mineradioIntensity, 0, 200],
    ['mineradiospeed', 'mineradioSpeed', settings.mineradioSpeed, 0, 200],
    ['mineradiopoint', 'mineradioPoint', settings.mineradioPoint, 50, 200],
    ['mineradiobloom', 'mineradioBloom', settings.mineradioBloom, 0, 120],
    ['mineradioopacity', 'mineradioOpacity', settings.mineradioOpacity, 0, 100],
  ] as const;
  return <div className="wallpaper-control-basics wallpaper-mineradio-controls">
    <label><span>{t('wallpaper.visualSystem')}</span><WallpaperSelect label={t('wallpaper.visualSystem')} value={settings.visualSystem} isDaylight={settings.themeVariant === 'light'}
      onChange={value => change({ visualsystem: value })}
      options={[{ value: 'folia', label: 'Folia' }, { value: 'mineradio', label: 'Mineradio × Folia' }]} /></label>
    {settings.visualSystem === 'mineradio' && <>
      <label><span>{t('wallpaper.mineradioPreset')}</span><WallpaperSelect label={t('wallpaper.mineradioPreset')} value={settings.mineradioPreset} isDaylight={settings.themeVariant === 'light'}
        onChange={value => change({ mineradiopreset: value })} options={MINERADIO_PRESETS} /></label>
      <p>{t('wallpaper.mineradioHint')}</p>
      {ranges.map(([key, label, value, min, max]) => <label key={key}><span>{t(`wallpaper.${label}`)} <output>{value}%</output></span>
        <input aria-label={t(`wallpaper.${label}`)} type="range" min={min} max={max} step={5} value={value}
          onChange={event => change({ [key as WallpaperControlKey]: +event.target.value })} />
      </label>)}
    </>}
  </div>;
}
