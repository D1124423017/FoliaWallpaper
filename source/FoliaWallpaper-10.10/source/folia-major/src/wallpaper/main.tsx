import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import zhTW from '../i18n/locales/zh-TW';
import WallpaperApp from './WallpaperApp';
import '../index.css';
import './wallpaper.css';
import './controls.css';

// src/wallpaper/main.tsx — independent Web Wallpaper entry; does not bootstrap Folia Player.
const i18n = createInstance();
void i18n.init({ lng: 'zh-TW', fallbackLng: 'zh-TW', resources: { 'zh-TW': { translation: zhTW } },
  interpolation: { escapeValue: false } }).then(() => {
  createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18n}><WallpaperApp /></I18nextProvider>);
});
