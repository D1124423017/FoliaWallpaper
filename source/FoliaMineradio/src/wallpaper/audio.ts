// src/wallpaper/audio.ts — calibrate WE's two 64-bin channels into Folia's byte-valued bands.
export function mapWallpaperAudio(values: readonly number[], gain = 1) {
  const spectrum = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const left = Number.isFinite(values[i]) ? values[i] : 0;
    const right = Number.isFinite(values[i + 64]) ? values[i + 64] : 0;
    spectrum[i] = Math.round(Math.min(1, Math.max(0, (left + right) / 2) * gain) * 255);
  }
  const mean = (start: number, end: number) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += spectrum[i];
    return sum / (end - start);
  };
  // WE does not document precise bin frequencies; these are relative bands, not a vocal stem.
  const bass = mean(0, 8), lowMid = mean(8, 18), mid = mean(18, 32), vocal = mean(24, 44), treble = mean(44, 64);
  return { spectrum, bass, lowMid, mid, vocal, treble, power: (bass + lowMid) / 2 };
}
