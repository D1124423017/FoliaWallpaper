import { describe, expect, it } from 'vitest';
import { buildWallpaperLyricLookups, hasWallpaperVideoLabel } from '../../../src/wallpaper/metadata';

// test/unit/wallpaper/metadata.test.ts — real YouTube formats and recording-version safeguards.
const lookup = (title: string, artist: string) => buildWallpaperLyricLookups({ title, artist, album: '', durationSec: 185 });
describe('Wallpaper video metadata', () => {
  it('extracts song and artist from a generic Topic uploader, including reversed order', () => {
    expect(lookup('初春 - 趙翊帆', 'Topic')).toContainEqual({ title: '初春', artist: '趙翊帆', album: '', durationSec: 185 });
  });
  it('removes official-video labels and keeps bilingual song aliases', () => {
    const variants = lookup("PPlin - 留不住 Can't keep(Official Music Video)", 'PPlin 林芃逸');
    expect(variants.some(item => item.title === '留不住' && item.artist === 'PPlin')).toBe(true);
  });
  it('does not remove Live or remix markers', () => {
    expect(lookup('Artist - Song (Live) (Official Music Video)', 'Artist')[0].title).toBe('Song (Live)');
    expect(lookup('Artist - Song (Remix)', 'Artist')[0].title).toBe('Song (Remix)');
  });
  it('keeps Spotify titles containing a hyphen intact', () => {
    expect(lookup('Song - Extended Mix', 'Real Artist')).toHaveLength(1);
    expect(lookup('Song - Extended Mix', 'Real Artist')[0].title).toBe('Song - Extended Mix');
  });
  it('does not accept a generic uploader as the artist for title-only matching', () => {
    expect(lookup('Unknown song', 'Topic')).toEqual([]);
  });
  it('strips artist channel decorations without changing song identity', () => {
    expect(lookup('Song', 'Artist - Topic')[0].artist).toBe('Artist');
  });
  it('extracts a quoted song without a dash or parenthesized video label', () => {
    expect(lookup('Juice Boy《Fake》Official Video', 'Juice Boy')[0].title).toBe('Fake');
    expect(lookup('Juice Boy《Fake》Official Video', 'Juice Boy')[0].artist).toBe('Juice Boy');
  });
  it('discards music-video casting credits rather than treating actors as artists', () => {
    const variants = lookup('Bu$Y & Ye!!ow , Paper Jim - 【沒注意到你在流眼淚】Starring:鄭人碩、莫允雯(Official Music Video)', '影子計劃Shadow Project');
    expect(variants[0].title).toBe('沒注意到你在流眼淚');
    expect(variants[0].artist).toBe('Bu$Y & Ye!!ow , Paper Jim');
  });
  it('keeps a quoted recording version intact', () => {
    expect(lookup('Artist《Song (Live)》Official Video', 'Artist')[0].title).toBe('Song (Live)');
  });
  it('extracts the reported lyric-video title before the uploader fallback', () => {
    const variants = lookup('苦茶子 - Starling8 / MoreLearn 27 / FIVESTAR『多久沒見了我是否變得強大，可以大膽說我願意聽妳想法』【動態歌詞】', 'Dreamer Music');
    expect(variants[0]).toEqual({ title: '苦茶子', artist: 'Starling8 / MoreLearn 27 / FIVESTAR', album: '', durationSec: 185 });
    expect(variants.slice(0, 2).every(item => item.artist !== 'Dreamer Music')).toBe(true);
  });
  it('recognizes Chinese lyric-video labels and keeps reversed quoted song names', () => {
    expect(lookup('歌手 - 『八個字以上的歌名』【动态歌词】', 'Dreamer Music').some(item => item.title === '八個字以上的歌名' && item.artist === '歌手')).toBe(true);
    expect(hasWallpaperVideoLabel('歌手 - 歌曲【動態歌詞】')).toBe(true);
    expect(hasWallpaperVideoLabel('Song (Live)')).toBe(false);
  });
  it('keeps video live/remix versions after removing presentation labels', () => {
    expect(lookup('Artist - Song (Live) [Lyrics]', 'Music')[0].title).toBe('Song (Live)');
    expect(lookup('Artist - Song (Remix)【動態歌詞】', 'Dreamer Music')[0].title).toBe('Song (Remix)');
  });
  it('retains a quoted subtitle on ordinary player metadata', () => {
    expect(lookup('歌曲『八個字以上的副標題』', 'Artist')[0].title).toBe('歌曲『八個字以上的副標題』');
  });
});
