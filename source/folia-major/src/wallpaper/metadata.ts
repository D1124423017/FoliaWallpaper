import { normalizeLyricMatchText } from '../utils/lyrics/matchScore';
import type { WallpaperTrack } from './types';

// src/wallpaper/metadata.ts — interpret music-video labels, without discarding recording versions.
const VIDEO_LABEL = /[([（【]\s*(?:official\s+(?:music\s+)?(?:video|audio)|official\s+mv|lyrics?(?:\s+video)?|music\s+video|官方\s*(?:mv|音樂錄影帶|音乐录影带)|中字\s*mv|動態歌詞|动态歌词|歌詞版|歌词版)\s*[)\]）】]/giu;
const VIDEO_SUFFIX = /\s*(?:official\s+(?:music\s+)?(?:video|audio)|official\s+mv)\s*$/iu;
const GENERIC_ARTIST = /^(?:topic|youtube(?:\s+music)?|various\s+artists|music|lyrics?)$/iu;
const VERSION_MARKER = /\b(?:live|remix|remaster(?:ed)?|cover|version|edit|instrumental)\b|現場|现场|伴奏|翻唱/iu;
const cleanArtist = (value: string) => value.replace(/\s*[-–—]\s*Topic\s*$/iu, '').replace(/VEVO$/iu, '').trim();
export function hasWallpaperVideoLabel(title: string): boolean {
  return title.replace(VIDEO_LABEL, '').replace(VIDEO_SUFFIX, '') !== title;
}
export function buildWallpaperLyricLookups(track: WallpaperTrack): WallpaperTrack[] {
  let title = track.title.replace(VIDEO_LABEL, '').replace(VIDEO_SUFFIX, '').replace(/\s*Starring\s*[:：].*$/iu, '').trim();
  // Lyric-video uploaders append a quoted lyric after the artist credits. Keep fully quoted song names.
  if (hasWallpaperVideoLabel(track.title)) title = title.replace(/^(.+?\s+[-–—]\s+[^「『]*[\p{L}\p{N}])\s*[「『][^」』]{8,}[」』]\s*$/u, '$1').trim();
  const artist = cleanArtist(track.artist);
  const generic = !artist || GENERIC_ARTIST.test(artist);
  const parts = title.split(/\s+[-–—]\s+/u);
  const lookups: WallpaperTrack[] = [];
  const add = (name: string, singer: string) => {
    const unwrapped = name.replace(/^[《【「『](.*)[》】」』]$/u, '$1').trim();
    if (unwrapped && singer && !GENERIC_ARTIST.test(singer)) lookups.push({ ...track, title: unwrapped, artist: singer });
  };
  // Music-video titles often quote the song after an artist/channel label, without a dash.
  const quoted = title.match(/^(.+?)\s*[《【「『](.+)[》】」』]\s*$/u);
  if (quoted && !/\s+[-–—]\s+/u.test(title) && title !== track.title.trim()) add(quoted[2], cleanArtist(quoted[1]));
  if (parts.length === 2) {
    const [left, right] = parts;
    const normalizedArtist = normalizeLyricMatchText(artist);
    const uploaderMatches = (part: string) => {
      const text = normalizeLyricMatchText(part);
      return normalizedArtist.length >= 2 && (text.includes(normalizedArtist) || normalizedArtist.includes(text));
    };
    if (uploaderMatches(left)) add(right, left);
    else if (uploaderMatches(right)) add(left, right);
    else if (generic || title !== track.title.trim()) {
      // Generic YouTube channels use both Artist - Song and Song - Artist. Rank using identity + duration.
      if (/\s[\/&、]\s/u.test(right) && !/\s[\/&、]\s/u.test(left)) { add(left, right); add(right, left); }
      else { add(right, left); add(left, right); }
      if (!generic) add(right, artist);
    }
  }
  if (!generic) add(title, artist);
  const bilingual = [...lookups].flatMap(lookup => {
    const alias = lookup.title.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\d\s]+)\s+([A-Za-z].*)$/u);
    return alias && !VERSION_MARKER.test(lookup.title)
      ? [{ ...lookup, title: alias[1].trim() }, { ...lookup, title: alias[2].trim() }] : [];
  });
  // Prefer full identity, then explicit bilingual aliases; never title-only with an unknown artist.
  return [...lookups, ...bilingual].filter((lookup, index, all) =>
    all.findIndex(other => other.title === lookup.title && other.artist === lookup.artist) === index).slice(0, 5);
}
