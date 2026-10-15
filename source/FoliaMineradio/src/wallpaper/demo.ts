import type { WallpaperHost, WallpaperLyrics } from './types';
import type { WallpaperController } from './controller';

// src/wallpaper/demo.ts — original test text, no music playback and no commercial lyric assets.
const messages = ['讓音樂點亮桌面', '保留原本的光與節奏', '每一個字都有自己的時間', '暫停時讓舞臺安靜', '下一首再開啟新的風景', 'Folia 的故事繼續流動'];
export const demoLyrics: WallpaperLyrics = {
  origin: 'Demo · original text', durationVerified: true,
  lyrics: { isWordByWord: true, lines: messages.map((fullText, i) => {
    const startTime = i * 8 + 1, endTime = startTime + 5;
    return { fullText, startTime, endTime, words: Array.from(fullText).map((text, index) => ({
      text, startTime: startTime + index * 5 / fullText.length, endTime: startTime + (index + 1) * 5 / fullText.length,
    })) };
  }) },
};
export function startWallpaperDemo(host: WallpaperHost, controller: WallpaperController) {
  controller.apply({ type: 'metadata', data: { title: 'Folia 視覺示範', artist: '原創測試文字', albumTitle: 'Demo' }, at: Date.now() });
  controller.apply({ type: 'playback', data: { state: 'playing' }, at: Date.now() });
  controller.apply({ type: 'timeline', data: { position: 0, duration: 50 }, at: Date.now() });
  const timer = setInterval(() => {
    const audio = Array.from({ length: 128 }, (_, i) => (Math.sin(Date.now() / 250 + i * .22) + 1) * .14);
    host.emit('demo-audio', audio);
  }, 1000 / 30);
  return () => clearInterval(timer);
}
