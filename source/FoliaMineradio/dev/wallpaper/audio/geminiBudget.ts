import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// dev/wallpaper/audio/geminiBudget.ts — persistent request caps survive service restarts; no music/audio/key is stored.
export const GEMINI_DAILY_LIMIT = 20;
export const GEMINI_SONG_LIMIT = 2;
export class GeminiBudget {
  private day = ''; private requests = 0; private songs: Record<string, number> = {}; private readable = true;
  constructor(private readonly directory: string) { this.reload(); }
  private reload() {
    try {
      const file = path.join(this.directory, 'gemini-usage.json');
      if (fs.statSync(file).size > 24000) throw new Error();
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof data.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || !Number.isInteger(data.requests)
        || data.requests < 0 || data.requests > GEMINI_DAILY_LIMIT || !data.songs || typeof data.songs !== 'object' || Array.isArray(data.songs)
        || Object.entries(data.songs).length > GEMINI_DAILY_LIMIT || Object.entries(data.songs).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key)
          || !Number.isInteger(value) || Number(value) < 1 || Number(value) > GEMINI_SONG_LIMIT)) throw new Error();
      this.day = data.day; this.requests = data.requests; this.songs = data.songs;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.readable = false; }
  }
  private rollover(now: number) {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.requests = 0; this.songs = {}; }
  }
  status(now = Date.now()) { this.rollover(now); return { day: this.day, requests: this.requests, dailyLimit: GEMINI_DAILY_LIMIT, songLimit: GEMINI_SONG_LIMIT }; }
  permits(key: string, now = Date.now()): boolean {
    this.rollover(now); const id = createHash('sha256').update(key).digest('hex');
    return this.readable && this.requests < GEMINI_DAILY_LIMIT && (this.songs[id] ?? 0) < GEMINI_SONG_LIMIT;
  }
  reserve(key: string, now = Date.now()): boolean {
    let lock: number | undefined; const lockPath = path.join(this.directory, 'gemini-usage.lock');
    try {
      // A diagnostic client can share the budget; never lose a request count to concurrent processes.
      lock = fs.openSync(lockPath, 'wx'); this.reload();
      if (!this.permits(key, now)) return false;
      const id = createHash('sha256').update(key).digest('hex'); this.requests++; this.songs[id] = (this.songs[id] ?? 0) + 1;
      const target = path.join(this.directory, 'gemini-usage.json');
      fs.writeFileSync(`${target}.tmp`, JSON.stringify({ day: this.day, requests: this.requests, songs: this.songs }));
      fs.renameSync(`${target}.tmp`, target); return true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') this.readable = false; return false; }
    finally { if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockPath); } }
  }
}
