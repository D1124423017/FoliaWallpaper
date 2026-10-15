'use strict';

// Bound and copy public rendering data at both IPC and wallpaper network boundaries.
function readSharedPlayback(value, now = Date.now()) {
  if (!value || value.app !== 'FoliaMineradioPlayer' || value.schema !== 1
    || !Number.isFinite(value.capturedAt) || Math.abs(now - value.capturedAt) > 4000
    || !['direct', 'external'].includes(value.playbackSource)) return null;
  const text = (input, max) => typeof input === 'string' && input.length <= max ? input : '';
  const bounded = (input, max) => typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= max;
  const clock = value.clock;
  if (!clock || !bounded(clock.positionSec, 86400) || !bounded(clock.lyricPositionSec, 86400)
    || !bounded(clock.durationSec, 86400) || typeof clock.playing !== 'boolean') return null;
  let song = null;
  if (value.song) {
    if (!text(value.song.key, 600) || !text(value.song.title, 500)) return null;
    let cover = text(value.song.cover, 710000) || null;
    if (cover && !/^https?:\/\//i.test(cover) && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(cover)) cover = null;
    if (cover && /^https?:/i.test(cover)) {
      try { const url = new URL(cover); if (url.username || url.password || [...url.searchParams.keys()]
        .some(key => /^(?:u|t|s)$|token|secret|pass|auth|cookie|credential|signature|api.?key/i.test(key))) cover = null; }
      catch { cover = null; }
    }
    song = { key: value.song.key, title: value.song.title, artist: text(value.song.artist, 300),
      album: text(value.song.album, 500), provider: text(value.song.provider, 100), cover };
  }
  let nodes = 0;
  const clone = (input, depth = 0) => {
    if (++nodes > 100000 || depth > 12) throw new Error('Rendering data too large');
    if (input == null || typeof input === 'boolean') return input;
    if (typeof input === 'string') { if (input.length > 10000) throw new Error('Rendering text too large'); return input; }
    if (typeof input === 'number') { if (!Number.isFinite(input)) throw new Error('Invalid rendering number'); return input; }
    if (Array.isArray(input)) { if (input.length > 10000) throw new Error('Rendering array too large'); return input.map(item => clone(item, depth + 1)); }
    if (typeof input !== 'object') throw new Error('Invalid rendering value');
    const result = {};
    for (const [key, item] of Object.entries(input)) {
      if (item === undefined) continue;
      if (key.length > 100 || /^(?:__proto__|constructor|prototype|providerData)$|api.?key|token|secret|pass|auth|cookie|credential/i.test(key)) continue;
      result[key] = clone(item, depth + 1);
    }
    return result;
  };
  let lyrics = null, theme = null;
  try {
    if (song && value.lyrics) {
      if (!Array.isArray(value.lyrics.lines) || value.lyrics.lines.length > 2000) return null;
      lyrics = clone(Object.fromEntries(['lines', 'title', 'artist', 'isWordByWord', 'ttml']
        .filter(key => value.lyrics[key] !== undefined).map(key => [key, value.lyrics[key]])));
      if (lyrics.lines.some(line => !bounded(line.startTime, 86400) || !bounded(line.endTime, 86400)
        || typeof line.fullText !== 'string' || !Array.isArray(line.words)
        || line.words.some(word => typeof word.text !== 'string' || !bounded(word.startTime, 86400) || !bounded(word.endTime, 86400)))) return null;
    }
    if (value.theme) {
      const colors = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor'];
      if (colors.some(key => !text(value.theme[key], 100))) return null;
      theme = Object.fromEntries(['name', ...colors, 'fontStyle', 'fontFamily', 'fontFamilyStack', 'fontWeight',
        'animationIntensity', 'wordColors', 'lyricsIcons', 'provider'].filter(key => value.theme[key] !== undefined)
        .map(key => [key, clone(value.theme[key])]));
    }
  } catch { return null; }
  const input = value.audio || {}, bytes = (data, limit) => Array.isArray(data) && data.length <= limit
    && data.every(item => Number.isInteger(item) && item >= 0 && item <= 255) ? [...data] : [];
  const energy = data => typeof data === 'number' && Number.isFinite(data) ? Math.max(0, Math.min(1, data)) : 0;
  return { app: 'FoliaMineradioPlayer', schema: 1, capturedAt: value.capturedAt, playbackSource: value.playbackSource,
    song, clock: { positionSec: clock.positionSec, lyricPositionSec: clock.lyricPositionSec,
      durationSec: clock.durationSec, playing: !!song && clock.playing }, lyrics, theme,
    sources: { music: text(value.sources?.music, 200), lyrics: text(value.sources?.lyrics, 200),
      timeline: text(value.sources?.timeline, 200), lyricsStatus:
        ['idle', 'loading', 'missing', 'word', 'line', 'text'].includes(value.sources?.lyricsStatus) ? value.sources.lyricsStatus : 'missing' },
    audio: { power: energy(input.power), bass: energy(input.bass), lowMid: energy(input.lowMid ?? input.bass),
      mid: energy(input.mid), vocal: energy(input.vocal ?? input.mid), treble: energy(input.treble),
      frequency: bytes(input.frequency, 16384), timeDomain: bytes(input.timeDomain, 32768),
      sampleRate: Number.isFinite(input.sampleRate) && input.sampleRate >= 8000 && input.sampleRate <= 192000 ? input.sampleRate : 44100 } };
}
export { readSharedPlayback };
