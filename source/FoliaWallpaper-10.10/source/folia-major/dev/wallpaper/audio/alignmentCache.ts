import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { WallpaperLyrics } from '../../../src/wallpaper/types';
import type { AudioAlignmentState } from './runtime';

// dev/wallpaper/audio/alignmentCache.ts — bounded local timing cache; never stores recordings or recognized speech.
interface CachedAlignment extends AudioAlignmentState { signature: string }
export function lyricAlignmentSignature(candidate: WallpaperLyrics): string {
  return createHash('sha256').update(JSON.stringify(candidate.lyrics.lines.map(line =>
    [line.fullText, line.startTime, line.endTime, line.words.map(word => [word.text, word.startTime, word.endTime])]))).digest('hex');
}
export function validCachedAlignment(value: unknown): value is CachedAlignment {
  if (!value || typeof value !== 'object') return false;
  const item = value as CachedAlignment;
  return typeof item.key === 'string' && item.key.length <= 2048 && typeof item.origin === 'string' && item.origin.length <= 500
    && (item.method === undefined || item.method === 'local' || item.method === 'gemini')
    && item.status === 'aligned' && Number.isInteger(item.revision) && item.revision > 0 && item.revision < 1_000_000_000
    && typeof item.signature === 'string' && /^[a-f0-9]{64}$/.test(item.signature)
    && Array.isArray(item.timelineMap) && item.timelineMap.length > 0 && item.timelineMap.length <= 16
    && item.timelineMap.every((segment, index) => Number.isFinite(segment.sourceStartSec) && segment.sourceStartSec >= 0 && segment.sourceStartSec <= 86400
      && Number.isFinite(segment.offsetSec) && Math.abs(segment.offsetSec) <= 1800
      && (index === 0 || segment.sourceStartSec > item.timelineMap[index - 1].sourceStartSec));
}
export class AlignmentCache {
  private values = new Map<string, CachedAlignment>();
  constructor(private readonly directory: string) {
    try {
      const file = path.join(directory, 'alignments.json');
      if (fs.statSync(file).size > 512000) return;
      const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data)) for (const value of data.slice(-32)) if (validCachedAlignment(value)) this.values.set(value.key, value);
    } catch { /* First run or an invalid cache always falls back to real audio analysis. */ }
  }
  get(key: string, candidate: WallpaperLyrics): AudioAlignmentState | undefined {
    const value = this.values.get(key);
    return value?.origin === candidate.origin && value.signature === lyricAlignmentSignature(candidate) ? value : undefined;
  }
  remember(value: AudioAlignmentState, candidate: WallpaperLyrics) {
    const saved = { ...value, signature: lyricAlignmentSignature(candidate) };
    if (!validCachedAlignment(saved)) return;
    this.values.delete(value.key); this.values.set(value.key, saved);
    if (this.values.size > 32) this.values.delete(this.values.keys().next().value!);
    try {
      const target = path.join(this.directory, 'alignments.json'), temporary = `${target}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify([...this.values.values()])); fs.renameSync(temporary, target);
    } catch { /* Timing works even when a disk cache cannot be written. */ }
  }
}
