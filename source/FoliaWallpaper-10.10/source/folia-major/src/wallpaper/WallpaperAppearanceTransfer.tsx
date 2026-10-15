import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';
import { exportWallpaperAppearance, importWallpaperAppearance } from './appearanceConfig';
import type { WallpaperSettings } from './settings';

// src/wallpaper/WallpaperAppearanceTransfer.tsx — save/import visual parameters with Folia's existing codec.
export function WallpaperAppearanceTransfer({ settings }: { settings: WallpaperSettings }) {
  const { t } = useTranslation();
  const file = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const exportConfig = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportWallpaperAppearance(settings), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'FoliaWallpaper-appearance.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="wallpaper-appearance-transfer">
    <p>{t('wallpaper.controlsTransferHint')}</p>
    <div className="wallpaper-control-actions">
      <button onClick={exportConfig}><Download size={15} />{t('wallpaper.controlsExport')}</button>
      <button onClick={() => file.current?.click()}><Upload size={15} />{t('wallpaper.controlsImport')}</button>
    </div>
    <input ref={file} type="file" hidden accept=".json,.txt" onChange={async event => {
      const picked = event.target.files?.[0]; event.target.value = '';
      if (!picked) return;
      try {
        if (picked.size > 128_000) throw new Error('Appearance file too large');
        importWallpaperAppearance(await picked.text()); setNotice(t('wallpaper.controlsImported'));
      } catch { setNotice(t('wallpaper.controlsImportError')); }
    }} />
    {notice && <p role="status">{notice}</p>}
  </div>;
}
