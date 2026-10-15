import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Line } from '../types';

// src/wallpaper/WallpaperPendingLyrics.tsx — static, manually readable text while the original renderer awaits reliable timing.
export function WallpaperPendingLyrics({ lines, scale, opacity, timelineSeen }: {
  lines: readonly Line[]; scale: number; opacity: number; timelineSeen: boolean;
}) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const move = (direction: number) => {
    const element = scroll.current;
    if (element) element.scrollBy({ top: direction * element.clientHeight * .7, behavior: 'auto' });
  };
  return <section className="wallpaper-pending-lyrics" data-testid="pending-lyrics" aria-label={t('wallpaper.lyricsPreview')}>
    <header><strong>{t('wallpaper.lyricsPreview')}</strong><span>{t(timelineSeen ? 'wallpaper.lyricsCalibratingHint' : 'wallpaper.lyricsTimelineHint')}</span></header>
    <div ref={scroll} className="wallpaper-pending-lyrics-text" tabIndex={0}
      style={{ fontSize: `clamp(18px, ${2.2 * scale}vw, ${36 * scale}px)`, opacity }}>
      {lines.map((line, index) => line.fullText.trim() && <p key={index}>{line.fullText}</p>)}
    </div>
    <footer>
      <button type="button" aria-label={t('wallpaper.lyricsScrollUp')} onClick={() => move(-1)}><ChevronUp size={18} /></button>
      <small>{t('wallpaper.lyricsPreviewHint')}</small>
      <button type="button" aria-label={t('wallpaper.lyricsScrollDown')} onClick={() => move(1)}><ChevronDown size={18} /></button>
    </footer>
  </section>;
}
