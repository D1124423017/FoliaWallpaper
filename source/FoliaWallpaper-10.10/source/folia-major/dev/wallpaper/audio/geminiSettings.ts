import fs from 'node:fs';
import path from 'node:path';
import { GEMINI_AUDIO_MODEL } from './geminiClip';
import { GEMINI_DAILY_LIMIT, GEMINI_SONG_LIMIT } from './geminiBudget';

// dev/wallpaper/audio/geminiSettings.ts — audio upload consent is separate from AI theme settings, default off.
export function publicGeminiAlignmentSettings() {
  const directory = process.env.FOLIA_AUDIO_RUNTIME; let enabled = false;
  try { enabled = !!directory && JSON.parse(fs.readFileSync(path.join(directory, 'gemini-alignment.json'), 'utf8')).enabled === true; } catch { /* Opt-in required. */ }
  return { enabled, available: !!directory && fs.existsSync(path.join(directory, 'ready.json')), model: GEMINI_AUDIO_MODEL,
    dailyLimit: GEMINI_DAILY_LIMIT, songLimit: GEMINI_SONG_LIMIT, clipSeconds: 10 };
}
export function saveGeminiAlignmentSettings(data: Record<string, unknown>) {
  if (typeof data.enabled !== 'boolean' || !publicGeminiAlignmentSettings().available) throw new TypeError('Audio setup required');
  const target = path.join(process.env.FOLIA_AUDIO_RUNTIME!, 'gemini-alignment.json');
  fs.writeFileSync(`${target}.tmp`, JSON.stringify({ enabled: data.enabled })); fs.renameSync(`${target}.tmp`, target);
}
