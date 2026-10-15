import { audioBands, audioPower, audioTimeDomain, audioSampleRate } from '../stores/motionSignals';
import type { IntegrationSnapshot } from './contracts';

// Read the one existing analyser. Original Mineradio receives real frequency and waveform samples.
export function integrationAudioSnapshot(): IntegrationSnapshot['audio'] {
  const band = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value / 255 : 0));
  return { power: band(audioPower.get()), bass: band(audioBands.bass.get()), lowMid: band(audioBands.lowMid.get()),
    mid: band(audioBands.mid.get()), vocal: band(audioBands.vocal.get()),
    treble: band(audioBands.treble.get()), frequency: Array.from(audioBands.spectrum.get()),
    timeDomain: Array.from(audioTimeDomain.get()), sampleRate: audioSampleRate.get() };
}
