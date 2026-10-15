import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readGeminiClip, readGeminiWords, transcribeGeminiClip, GeminiAudioError, type GeminiClip } from '../../../dev/wallpaper/audio/geminiClip';
import { GeminiBudget } from '../../../dev/wallpaper/audio/geminiBudget';
import { GeminiAlignment } from '../../../dev/wallpaper/audio/geminiAlignment';
import { matchHeardLyrics } from '../../../src/wallpaper/audioAlignment';
import type { LyricData } from '../../../src/types';

// test/unit/wallpaper/geminiAudio.test.ts — consent, cloud request caps, stale races and independent timing validation.
const temporary: string[] = [];
function directory(enabled = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-gemini-test-')); temporary.push(dir);
  fs.writeFileSync(path.join(dir, 'gemini-alignment.json'), JSON.stringify({ enabled })); return dir;
}
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const clip = (): GeminiClip => {
  const wav = Buffer.alloc(320044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(320000, 40);
  return { key: 'song', generation: 1, positionSec: 30, playbackRate: 1, durationSec: 10, outputDevice: 'speaker', audio: wav.toString('base64') };
};
const response = (words: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ words }) }] } }] }));
const setup = async (dir = directory(), transcribe = vi.fn().mockResolvedValue([]), settings = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-private-key' }) => {
  let now = Date.UTC(2026, 9, 13); const heard = vi.fn();
  const coordinator = new GeminiAlignment(dir, heard, { settings: async () => settings, revision: async () => 'v1', transcribe, now: () => now });
  await new Promise(resolve => setTimeout(resolve, 0));
  coordinator.update('song', 1, true, false);
  return { coordinator, heard, transcribe, advance: (ms: number) => { now += ms; coordinator.update('song', 1, true, false); } };
};
describe('Gemini short audio acceleration', () => {
  it('accepts only bounded canonical PCM WAV, never arbitrary files or inflated duration', () => {
    expect(readGeminiClip({ ...clip() })?.durationSec).toBe(10);
    for (const patch of [{ audio: Buffer.from('secret file').toString('base64') }, { durationSec: 8 }, { generation: NaN }, { playbackRate: 0 }, { positionSec: -1 }, { audio: 'x'.repeat(520001) }])
      expect(readGeminiClip({ ...clip(), ...patch })).toBeNull();
    const wav = Buffer.from(clip().audio, 'base64'); wav.writeUInt16LE(2, 22);
    expect(readGeminiClip({ ...clip(), audio: wav.toString('base64') })).toBeNull();
  });
  it('maps real clip-relative word timestamps to player time, including playback rate', () => {
    expect(readGeminiWords({ words: [{ text: 'sing', startSec: 2, endSec: 3 }] }, { ...clip(), playbackRate: 1.5 })[0].timeSec).toBe(33);
    for (const words of [[{ text: 'a', startSec: -1, endSec: 1 }], [{ text: 'a', startSec: 1, endSec: 11 }],
      [{ text: 'a', startSec: 2, endSec: 3 }, { text: 'b', startSec: 1, endSec: 2 }], [{ text: 'a', startSec: 1, endSec: 1 }]])
      expect(() => readGeminiWords({ words }, clip())).toThrow(GeminiAudioError);
  });
  it('requires enough independent words and stable timing across multiple lyric lines', () => {
    const texts = ['Bright rivers carry every falling star home', 'Quiet mountains keep their memories until morning'];
    const lyrics: LyricData = { isWordByWord: true, lines: texts.map((fullText, i) => ({ fullText, startTime: i * 5, endTime: i * 5 + 5,
      words: fullText.split(' ').map((text, j) => ({ text, startTime: i * 5 + j * .5, endTime: i * 5 + j * .5 + .4 })) })) };
    const words = lyrics.lines.flatMap(line => line.words.map(word => ({ text: word.text, startSec: word.startTime, endSec: word.endTime })));
    expect(matchHeardLyrics(lyrics, readGeminiWords({ words }, clip()))?.offsetSec).toBe(30);
    expect(matchHeardLyrics(lyrics, readGeminiWords({ words: words.slice(0, 7) }, clip()))).toBeNull();
    expect(matchHeardLyrics(lyrics, readGeminiWords({ words: words.map(word => ({ ...word, startSec: 0, endSec: .5 })) }, clip()))).toBeNull();
  });
  it('uses a fixed Google endpoint and sends no reference lyrics or key in URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ text: 'hello', startSec: 1, endSec: 2 }]));
    const result = await transcribeGeminiClip(clip(), 'private-key', new AbortController().signal, fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).not.toContain('private-key'); expect(options.headers['x-goog-api-key']).toBe('private-key');
    expect(JSON.parse(options.body).contents[0].parts[1].inlineData.mimeType).toBe('audio/wav'); expect(result).toHaveLength(1);
  });
  it('never echoes provider errors or accepts truncated/oversized output', async () => {
    const failing = vi.fn().mockResolvedValue(new Response('private-key and private transcript', { status: 403 }));
    await expect(transcribeGeminiClip(clip(), 'private-key', new AbortController().signal, failing)).rejects.toThrow('Gemini audio unavailable (403)');
    const huge = vi.fn().mockResolvedValue(new Response('x'.repeat(100001)));
    await expect(transcribeGeminiClip(clip(), 'private-key', new AbortController().signal, huge)).rejects.toThrow(GeminiAudioError);
    const truncated = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] })));
    await expect(transcribeGeminiClip(clip(), 'private-key', new AbortController().signal, truncated)).rejects.toThrow(GeminiAudioError);
  });
  it('persists per-song and per-day caps across restarts without storing song names', () => {
    const dir = directory(); const now = Date.UTC(2026, 9, 13); let budget = new GeminiBudget(dir);
    expect(budget.reserve('private song title', now)).toBe(true); expect(budget.reserve('private song title', now)).toBe(true);
    budget = new GeminiBudget(dir); expect(budget.reserve('private song title', now)).toBe(false);
    for (let i = 0; i < 18; i++) expect(budget.reserve(`track${i}`, now)).toBe(true);
    expect(budget.reserve('another', now)).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'gemini-usage.json'), 'utf8')).not.toContain('private song title');
    expect(budget.reserve('another', now + 86400000)).toBe(true);
  });
  it('fails closed on damaged budget files', () => {
    const dir = directory(); fs.writeFileSync(path.join(dir, 'gemini-usage.json'), '{bad');
    expect(new GeminiBudget(dir).reserve('song')).toBe(false);
  });
  it('counts calls from other clients and fails closed while another client reserves a slot', () => {
    const dir = directory(), now = Date.UTC(2026, 9, 13), first = new GeminiBudget(dir), second = new GeminiBudget(dir);
    expect(first.reserve('song', now)).toBe(true); expect(second.reserve('song', now)).toBe(true); expect(first.reserve('song', now)).toBe(false);
    fs.writeFileSync(path.join(dir, 'gemini-usage.lock'), ''); expect(first.reserve('other', now)).toBe(false);
  });
  it('does not upload without separate audio consent, a Gemini key, or when already aligned', async () => {
    for (const state of [await setup(directory(false)), await setup(directory(), undefined, { AI_PROVIDER: 'gemini', GEMINI_API_KEY: '' }),
      await setup(directory(), undefined, { AI_PROVIDER: 'openai', GEMINI_API_KEY: 'test-private-key' })]) {
      await state.coordinator.accept({ ...clip() }); expect(state.transcribe).not.toHaveBeenCalled(); state.coordinator.stop();
    }
    const state = await setup(); state.coordinator.update('song', 1, true, true);
    await state.coordinator.accept({ ...clip() }); expect(state.transcribe).not.toHaveBeenCalled(); state.coordinator.stop();
  });
  it('allows only one cloud request at a time, dropping results after a seek or local success', async () => {
    for (const aligned of [false, true]) {
      let finish!: (words: unknown[]) => void;
      const transcribe = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const state = await setup(directory(), transcribe);
      const pending = state.coordinator.accept({ ...clip() }); await state.coordinator.accept({ ...clip() });
      expect(transcribe).toHaveBeenCalledTimes(1);
      state.coordinator.update('song', aligned ? 1 : 2, true, aligned);
      expect(transcribe.mock.calls[0][2].aborted).toBe(true);
      finish([{ text: 'stale', timeSec: 1, probability: .5 }]); await pending;
      expect(state.heard).not.toHaveBeenCalled(); state.coordinator.stop();
    }
  });
  it('rejects stale clips and stale playback, but forwards current independent transcription', async () => {
    const state = await setup(); await state.coordinator.accept({ ...clip(), generation: 0 }); expect(state.transcribe).not.toHaveBeenCalled();
    await state.coordinator.accept({ ...clip() }); expect(state.heard.mock.calls[0][0]).toMatchObject({ method: 'gemini', generation: 1 });
    expect(state.heard.mock.calls[0][0].audio).toBeUndefined(); state.coordinator.stop();
  });
  it('backs off quota failures without immediately retrying or exposing API errors', async () => {
    const state = await setup(directory(), vi.fn().mockRejectedValue(new GeminiAudioError(429)));
    await state.coordinator.accept({ ...clip() }); state.advance(21000); await state.coordinator.accept({ ...clip() });
    expect(state.transcribe).toHaveBeenCalledTimes(1); expect(state.coordinator.status().status).toBe('quota');
    expect(JSON.stringify(state.coordinator.status())).not.toContain('test-private-key'); state.coordinator.stop();
  });
  it('cancels cloud work when playback pauses or consent is withdrawn', async () => {
    let finish!: (words: unknown[]) => void; const dir = directory();
    const state = await setup(dir, vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
    const pending = state.coordinator.accept({ ...clip() }); fs.writeFileSync(path.join(dir, 'gemini-alignment.json'), '{"enabled":false}');
    state.coordinator.update('song', 1, false, false); expect(state.transcribe.mock.calls[0][2].aborted).toBe(true);
    finish([]); await pending; expect(state.heard).not.toHaveBeenCalled(); state.coordinator.stop();
  });
});
