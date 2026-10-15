import { describe, expect, it } from 'vitest';
import { matchHeardLyrics, extendLyricTimeMap, mergeHeardWindows } from '../../../src/wallpaper/audioAlignment';
import type { LyricData } from '../../../src/types';

// test/unit/wallpaper/audioAlignment.test.ts — unknown-song offsets, repeated chorus ambiguity, interference and inserted scenes.
const make = (texts: string[], gap = 12): LyricData => ({ isWordByWord: true, lines: texts.map((fullText, i) => ({
  fullText, startTime: i * gap, endTime: (i + 1) * gap,
  words: fullText.split(' ').map((text, j) => ({ text, startTime: i * gap + j, endTime: i * gap + j + .8 })),
})) });
const lyric = make(['Bright rivers carry every falling star home', 'Quiet mountains keep their memories until morning']);
const hear = (data: LyricData, offset: number) => data.lines.flatMap(line => line.words.map(word => ({ text: word.text, timeSec: word.startTime + offset, probability: .9 })));
describe('Automatic local lyric alignment', () => {
  it('discovers an arbitrary introduction without any song-specific rule', () => {
    for (const offset of [0, 17.2, 34.7, 92]) expect(matchHeardLyrics(lyric, hear(lyric, offset))?.offsetSec).toBe(offset);
  });
  it('does not match unrelated conversation or low-confidence hallucinations', () => {
    expect(matchHeardLyrics(lyric, hear(make(['Please answer the telephone and check your messages', 'This conversation has nothing about music tonight']), 35))).toBeNull();
    expect(matchHeardLyrics(lyric, hear(lyric, 35).map(word => ({ ...word, probability: .1 })))).toBeNull();
  });
  it('rejects repeated-chorus ambiguity until an earlier reliable segment resolves it', () => {
    const repeated = make([...lyric.lines.map(line => line.fullText), ...lyric.lines.map(line => line.fullText)]);
    const heard = hear(lyric, 65);
    expect(matchHeardLyrics(repeated, heard)).toBeNull();
    expect(matchHeardLyrics(repeated, heard, 41)?.offsetSec).toBe(41);
  });
  it('uses adjacent real vocal windows to disambiguate a repeated chorus without a guessed offset', () => {
    const whole = make(['Silver lanterns guide us across empty valleys', ...lyric.lines.map(line => line.fullText),
      'Morning shadows fade beyond the distant mountains', ...lyric.lines.map(line => line.fullText)]);
    const previous = hear({ ...whole, lines: whole.lines.slice(0, 1) }, 35);
    const chorus = hear({ ...whole, lines: whole.lines.slice(1, 3) }, 35);
    expect(matchHeardLyrics(whole, chorus)).toBeNull();
    expect(matchHeardLyrics(whole, mergeHeardWindows(previous, chorus))?.offsetSec).toBe(35);
  });
  it('replaces overlapping recognition and discards words older than 45 seconds', () => {
    const old = [{ text: 'outdated', timeSec: 0, probability: .9 }, { text: 'prefix', timeSec: 50, probability: .9 },
      { text: 'overlap', timeSec: 60, probability: .9 }];
    const next = [{ text: 'corrected', timeSec: 60, probability: .9 }, { text: 'latest', timeSec: 80, probability: .9 }];
    expect(mergeHeardWindows(old, next).map(word => word.text)).toEqual(['prefix', 'corrected', 'latest']);
  });
  it('rejects a changing tempo instead of pretending that one offset is enough', () => {
    const heard = hear(lyric, 35).map((word, i) => ({ ...word, timeSec: word.timeSec + i * .6 }));
    expect(matchHeardLyrics(lyric, heard)).toBeNull();
  });
  it('keeps corrections before and after an inserted scene independently', () => {
    const first = { offsetSec: 17.2, sourceStartSec: 10, matchedWords: 15, confidence: .9 };
    const map = extendLyricTimeMap([], first);
    expect(map).toEqual([{ sourceStartSec: 0, offsetSec: 17.2 }]);
    expect(extendLyricTimeMap(map, { ...first, offsetSec: 17.4, sourceStartSec: 50 })).toBe(map);
    expect(extendLyricTimeMap(map, { ...first, offsetSec: 47.2, sourceStartSec: 100 })).toEqual([
      { sourceStartSec: 0, offsetSec: 17.2 }, { sourceStartSec: 100, offsetSec: 47.2 },
    ]);
  });
});
