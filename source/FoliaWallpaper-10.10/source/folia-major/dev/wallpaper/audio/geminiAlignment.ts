import fs from 'node:fs';
import path from 'node:path';
import { loadAiSettings, aiSettingsRevision, type AiSettings } from '../ai/config';
import { GeminiBudget } from './geminiBudget';
import { GEMINI_AUDIO_MODEL, GeminiAudioError, readGeminiClip, transcribeGeminiClip, type GeminiClip } from './geminiClip';
import type { HeardWord } from '../../../src/wallpaper/audioAlignment';

// dev/wallpaper/audio/geminiAlignment.ts — opt-in short-clip acceleration, bounded billing exposure and stale-job cancellation.
interface Dependencies { settings: () => Promise<AiSettings>; revision: () => Promise<string>; transcribe: typeof transcribeGeminiClip; now: () => number }
export class GeminiAlignment {
  private budget: GeminiBudget; private key = ''; private revision = ''; private blockedRevision = '';
  private refreshAt = 0; private refreshing = false; private nextAt = 0; private disposed = false;
  private context = { key: '', generation: -1, active: false, aligned: false, at: 0 };
  private job: { clip: GeminiClip; abort: AbortController } | null = null;
  private state = 'disabled'; private lastInferenceSec = 0; private wordCount = 0;
  private clips = 0; private invalidClips = 0;
  private lastClipStatus = 'waiting';
  constructor(private readonly directory: string, private readonly heard: (data: Record<string, unknown>) => void,
    private readonly deps: Dependencies = { settings: loadAiSettings, revision: aiSettingsRevision, transcribe: transcribeGeminiClip, now: Date.now }) {
    this.budget = new GeminiBudget(directory); void this.refresh();
  }
  private enabled() {
    try { return JSON.parse(fs.readFileSync(path.join(this.directory, 'gemini-alignment.json'), 'utf8')).enabled === true; }
    catch { return false; } // Public installs never opt in implicitly.
  }
  private async refresh() {
    if (this.refreshing || this.disposed || this.deps.now() < this.refreshAt || !this.enabled()) return;
    this.refreshAt = this.deps.now() + 5000; this.refreshing = true;
    try {
      const revision = await this.deps.revision();
      if (revision !== this.revision || !this.key) {
        const settings = await this.deps.settings(); this.revision = revision;
        this.key = settings.AI_PROVIDER !== 'openai' && typeof settings.GEMINI_API_KEY === 'string' ? settings.GEMINI_API_KEY : '';
        this.state = this.key ? 'ready' : 'unconfigured';
      }
    } catch { this.key = ''; this.state = 'unconfigured'; }
    finally { this.refreshing = false; }
  }
  update(key: string, generation: number, active: boolean, aligned: boolean) {
    if (this.job && (key !== this.context.key || generation !== this.context.generation || !active || aligned || !this.enabled())) this.job.abort.abort();
    this.context = { key, generation, active, aligned, at: this.deps.now() }; void this.refresh();
  }
  canCapture(): boolean {
    return !this.disposed && this.enabled() && !!this.key && this.blockedRevision !== this.revision && !this.job
      && this.context.active && !this.context.aligned && this.deps.now() - this.context.at < 4000
      && this.deps.now() >= this.nextAt && this.budget.permits(this.context.key, this.deps.now());
  }
  status() {
    const enabled = this.enabled();
    return { enabled, model: GEMINI_AUDIO_MODEL, status: !enabled ? 'disabled' : !this.key ? 'unconfigured'
      : this.job ? 'requesting' : !this.budget.permits(this.context.key, this.deps.now()) ? 'limit' : this.state,
      inferenceSec: this.lastInferenceSec, wordCount: this.wordCount, captureReady: this.canCapture(), clips: this.clips, invalidClips: this.invalidClips,
      active: this.context.active, aligned: this.context.aligned, lastClipStatus: this.lastClipStatus, ...this.budget.status(this.deps.now()) };
  }
  async accept(data: Record<string, unknown>) {
    this.clips++;
    const clip = readGeminiClip(data);
    if (!clip) { this.invalidClips++; this.lastClipStatus = 'invalid'; return; }
    if (clip.key !== this.context.key) { this.lastClipStatus = 'track-changed'; return; }
    if (clip.generation !== this.context.generation) { this.lastClipStatus = 'timeline-changed'; return; }
    if (!this.canCapture()) { this.lastClipStatus = this.job ? 'busy' : this.context.aligned ? 'already-aligned'
      : !this.context.active ? 'inactive' : this.deps.now() - this.context.at >= 4000 ? 'stale-playback' : 'not-ready'; return; }
    this.lastClipStatus = 'accepted';
    if (!this.budget.reserve(clip.key, this.deps.now())) { this.state = 'limit'; return; }
    const job = { clip, abort: new AbortController() }; this.job = job; this.state = 'requesting';
    this.nextAt = this.deps.now() + 20_000; const started = this.deps.now();
    try {
      const words: HeardWord[] = await this.deps.transcribe(clip, this.key, job.abort.signal);
      if (job.abort.signal.aborted || this.disposed || !this.context.active || this.context.aligned || !this.enabled()
        || this.deps.now() - this.context.at > 4000 || clip.key !== this.context.key || clip.generation !== this.context.generation) return;
      this.lastInferenceSec = (this.deps.now() - started) / 1000; this.wordCount = words.length; this.state = 'checked';
      this.heard({ type: 'heard', ...clip, audio: undefined, method: 'gemini', words, inferenceSec: this.lastInferenceSec });
    } catch (error) {
      if (job.abort.signal.aborted) return;
      const http = error instanceof GeminiAudioError ? error.status : 0;
      this.state = http === 429 ? 'quota' : [400, 401, 403, 404].includes(http) ? 'configuration-error' : 'unavailable';
      if ([400, 401, 403, 404].includes(http)) this.blockedRevision = this.revision;
      this.nextAt = this.deps.now() + (http === 429 ? 300_000 : 60_000);
    } finally { if (this.job === job) this.job = null; }
  }
  stop() { this.disposed = true; this.job?.abort.abort(); this.key = ''; }
}
