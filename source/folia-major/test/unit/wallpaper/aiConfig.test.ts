import { describe, expect, it } from 'vitest';
import { publicAiSettings, validateAiSettings } from '../../../dev/wallpaper/ai/config';
import { validAiSetupToken } from '../../../dev/wallpaper/ai/routes';
import { readThemeInput } from '../../../dev/wallpaper/ai/generate';

// test/unit/wallpaper/aiConfig.test.ts — connection boundaries and credential-free public output.
describe('wallpaper AI configuration', () => {
  it('keeps credentials out of the public configuration', () => {
    const settings = validateAiSettings({ provider: 'gemini', apiKey: ' private-test-key ' });
    const data = publicAiSettings(settings);
    expect(settings.GEMINI_API_KEY).toBe('private-test-key');
    expect(data).toMatchObject({ provider: 'gemini', configured: true });
    expect(JSON.stringify(data)).not.toContain('private-test-key');
  });
  it('accepts HTTPS compatible services and local model endpoints', () => {
    for (const apiUrl of ['https://api.example.com/v1', 'http://127.0.0.1:11434/v1'])
      expect(validateAiSettings({ provider: 'openai', apiKey: 'test', model: 'example', apiUrl }).AI_PROVIDER).toBe('openai');
  });
  it('rejects nonlocal HTTP, credentials in URLs and incomplete settings', () => {
    for (const apiUrl of ['http://example.com/v1', 'https://name:password@example.com', 'https://example.com/?key=test', 'https://example.com/#key'])
      expect(() => validateAiSettings({ provider: 'openai', apiKey: 'test', model: 'example', apiUrl })).toThrow();
    expect(() => validateAiSettings({ provider: 'other', apiKey: 'test' })).toThrow();
    expect(() => validateAiSettings({ provider: 'openai', apiKey: 'test', apiUrl: 'https://example.com', model: '' })).toThrow();
  });
  it('rejects setup nonce guesses including multibyte strings without crashing', () => {
    for (const token of [null, '', 'x'.repeat(64), '字'.repeat(64)]) expect(validAiSetupToken(token)).toBe(false);
  });
  it('bounds song input and never needs audio', () => {
    expect(readThemeInput({ title: ' Song ', lyricsText: ' Words ' })).toEqual({ title: 'Song', lyricsText: 'Words' });
    expect(() => readThemeInput({ title: 'Song', lyricsText: 'x'.repeat(2001) })).toThrow();
    expect(() => readThemeInput({ title: 'Song', lyricsText: '' })).toThrow();
  });
});
