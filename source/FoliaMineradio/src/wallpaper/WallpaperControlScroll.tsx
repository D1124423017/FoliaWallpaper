import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown } from 'lucide-react';

// src/wallpaper/WallpaperControlScroll.tsx — keep every setting reachable with desktop mouse clicks.
export function WallpaperControlScroll({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false, overflow: false });
  useEffect(() => {
    const element = scroll.current;
    if (!element || !content.current) return;
    // Update only when a boundary changes; scrolling does not rerender the animation on each pixel.
    const update = () => {
      const limit = element.scrollHeight - element.clientHeight;
      const next = { start: element.scrollTop <= 1, end: element.scrollTop >= limit - 1, overflow: limit > 1 };
      setEdges(previous => previous.start === next.start && previous.end === next.end && previous.overflow === next.overflow ? previous : next);
    };
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element); observer.observe(content.current); update();
    return () => { element.removeEventListener('scroll', update); observer.disconnect(); };
  }, []);
  const move = (direction: number) => {
    const element = scroll.current;
    if (element) element.scrollBy({ top: direction * Math.max(120, element.clientHeight * .75), behavior: 'auto' });
  };
  return <div className="wallpaper-controls-scroll-area">
    <div ref={scroll} className="wallpaper-controls-scroll" tabIndex={0} aria-label={t('wallpaper.controlsScroll')}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home') event.currentTarget.scrollTop = 0;
        else if (event.key === 'End') event.currentTarget.scrollTop = event.currentTarget.scrollHeight;
        else move(event.key === 'PageDown' ? 1 : -1);
      }}><div ref={content}>{children}</div></div>
    <footer className="wallpaper-controls-scroll-actions">
      <button type="button" aria-label={t('wallpaper.controlsScrollUp')} disabled={!edges.overflow || edges.start} onClick={() => move(-1)}>
        <ChevronUp size={16} />{t('wallpaper.controlsUp')}</button>
      <small>{t('wallpaper.controlsScrollHint')}</small>
      <button type="button" aria-label={t('wallpaper.controlsScrollDown')} disabled={!edges.overflow || edges.end} onClick={() => move(1)}>
        {t('wallpaper.controlsDown')}<ChevronDown size={16} /></button>
    </footer>
  </div>;
}
