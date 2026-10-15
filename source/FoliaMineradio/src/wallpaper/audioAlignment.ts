import type { LyricData } from '../types';
import { normalizeLyricMatchText } from '../utils/lyrics/matchScore';

// src/wallpaper/audioAlignment.ts — bounded local sequence matching; no song-specific titles, hashes or offsets.
export interface HeardWord { text: string; timeSec: number; probability: number }
export interface LyricTimeSegment { sourceStartSec: number; offsetSec: number }
export interface AudioMatch { offsetSec: number; sourceStartSec: number; matchedWords: number; confidence: number }
interface Token { text: string; timeSec: number; line: number }
export interface AudioMatchDiagnostic { sampleTokens?: number; vocabularyOverlap?: number; sequenceScore?: number; timingCandidates?: number; reason?: string }
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
function tokens(text: string): string[] {
  // Shared normalization converts Traditional/Simplified Chinese and preserves recording-language identity.
  return normalizeLyricMatchText(text).match(/[a-z\d]+|[\p{L}\p{N}]/gu) ?? [];
}
function lyricTokens(lyrics: LyricData): Token[] {
  return lyrics.lines.flatMap((line, index) => (line.words.length ? line.words : [{ text: line.fullText, startTime: line.startTime }])
    .flatMap(word => tokens(word.text).map(text => ({ text, timeSec: word.startTime, line: index })))).slice(0, 2000);
}
// Smith-Waterman accepts recognition mistakes and extra speech, but ambiguous repeated choruses must wait.
export function matchHeardLyrics(lyrics: LyricData, heard: HeardWord[], priorOffsetSec?: number, diagnostic?: AudioMatchDiagnostic): AudioMatch | null {
  const reference = lyricTokens(lyrics);
  const sample = heard.filter(word => word.probability >= .35 && Number.isFinite(word.timeSec)).flatMap(word =>
    tokens(word.text).map(text => ({ text, timeSec: word.timeSec, line: 0 }))).slice(0, 240);
  if (diagnostic) { const vocabulary = new Set(reference.map(token => token.text)); Object.assign(diagnostic, {
    sampleTokens: sample.length, vocabularyOverlap: sample.length ? sample.filter(token => vocabulary.has(token.text)).length / sample.length : 0,
    sequenceScore: 0, timingCandidates: 0, reason: 'insufficient-words' }); }
  if (sample.length < 8 || reference.length < 8) return null;
  const width = reference.length + 1, rows = sample.length + 1;
  const scores = new Int16Array(width * rows), ends: { i: number; j: number; score: number }[] = [];
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < width; j++) {
      const at = i * width + j;
      const same = sample[i - 1].text === reference[j - 1].text;
      scores[at] = Math.max(0, scores[at - width - 1] + (same ? 3 : -2), scores[at - width] - 2, scores[at - 1] - 2);
      if (same && scores[at] >= 24) ends.push({ i, j, score: scores[at] });
    }
  }
  ends.sort((a, b) => b.score - a.score);
  if (diagnostic) { diagnostic.sequenceScore = ends[0]?.score ?? 0; diagnostic.reason = 'no-stable-sequence'; }
  const matches: (AudioMatch & { score: number })[] = [];
  for (const end of ends.slice(0, 100)) {
    let { i, j } = end;
    const pairs: { source: Token; heard: Token }[] = [];
    while (i > 0 && j > 0 && scores[i * width + j] > 0) {
      const at = i * width + j, same = sample[i - 1].text === reference[j - 1].text;
      if (scores[at] === scores[at - width - 1] + (same ? 3 : -2)) {
        if (same) pairs.push({ source: reference[j - 1], heard: sample[i - 1] });
        i--; j--;
      } else if (scores[at] === scores[at - width] - 2) i--;
      else j--;
    }
    if (pairs.length < 8 || new Set(pairs.map(pair => pair.source.line)).size < 2
      || new Set(pairs.map(pair => pair.source.text)).size < 5) continue;
    const offsets = pairs.map(pair => pair.heard.timeSec - pair.source.timeSec);
    const offset = median(offsets), stable = offsets.filter(value => Math.abs(value - offset) <= 1.5);
    const coverage = pairs.length / sample.length;
    if (stable.length / pairs.length < .8 || coverage < .55
      || Math.max(...pairs.map(pair => pair.heard.timeSec)) - Math.min(...pairs.map(pair => pair.heard.timeSec)) < 3) continue;
    if (matches.some(match => Math.abs(match.offsetSec - offset) < 3)) continue;
    matches.push({ offsetSec: Math.round(median(stable) * 100) / 100, matchedWords: pairs.length, confidence: Math.min(1, coverage),
      sourceStartSec: Math.min(...pairs.map(pair => lyrics.lines[pair.source.line].startTime)), score: end.score });
  }
  matches.sort((a, b) => b.score - a.score);
  if (diagnostic) diagnostic.timingCandidates = matches.length;
  if (!matches.length) return null;
  const close = matches.filter(match => match.score >= matches[0].score * .9);
  let best = matches[0];
  if (close.length > 1) {
    if (priorOffsetSec === undefined) { if (diagnostic) diagnostic.reason = 'ambiguous-repeated-lyrics'; return null; }
    close.sort((a, b) => Math.abs(a.offsetSec - priorOffsetSec) - Math.abs(b.offsetSec - priorOffsetSec));
    if (Math.abs(close[0].offsetSec - priorOffsetSec) > 3) { if (diagnostic) diagnostic.reason = 'changed-recording-offset'; return null; }
    best = close[0];
  }
  if (diagnostic) diagnostic.reason = 'aligned';
  return { offsetSec: best.offsetSec, sourceStartSec: best.sourceStartSec, matchedWords: best.matchedWords, confidence: best.confidence };
}
// Overlapping ASR windows need one continuous sequence to disambiguate repeated choruses without guessing an offset.
export function mergeHeardWindows(previous: HeardWord[], next: HeardWord[]): HeardWord[] {
  if (!next.length) return previous;
  const start = Math.min(...next.map(word => word.timeSec)), end = Math.max(...next.map(word => word.timeSec));
  return [...previous.filter(word => word.timeSec < start - .25 && word.timeSec >= end - 45), ...next]
    .sort((a, b) => a.timeSec - b.timeSec).slice(-240);
}
export function extendLyricTimeMap(previous: LyricTimeSegment[], match: AudioMatch): LyricTimeSegment[] {
  const active = [...previous].reverse().find(segment => segment.sourceStartSec <= match.sourceStartSec);
  if (active && Math.abs(active.offsetSec - match.offsetSec) < 2) return previous;
  const segment = { sourceStartSec: previous.length ? match.sourceStartSec : 0, offsetSec: match.offsetSec };
  return [...previous.filter(item => item.sourceStartSec !== segment.sourceStartSec), segment]
    .sort((a, b) => a.sourceStartSec - b.sourceStartSec).slice(-16);
}
