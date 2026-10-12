import { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue } from 'framer-motion';
import { findLatestActiveLineIndex } from '../utils/appPlaybackHelpers';
import { mapWallpaperAudio } from './audio';
import type { Line } from '../types';
import type { WallpaperController } from './controller';
import type { WallpaperHost } from './types';

// src/wallpaper/useWallpaperMotion.ts — Folia MotionValues, no per-frame React timeline updates.
export function useWallpaperMotion(controller: WallpaperController, host: WallpaperHost, lines: Line[], offset: number, gain: number) {
  const currentTime = useMotionValue(0), audioPower = useMotionValue(0);
  const bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0);
  const vocal = useMotionValue(0), treble = useMotionValue(0), spectrum = useMotionValue(new Uint8Array(64));
  const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble, spectrum }), [bass, lowMid, mid, vocal, treble, spectrum]);
  const [currentLineIndex, setIndex] = useState(-1);
  const indexRef = useRef(-1);
  useEffect(() => {
    const audio = (values: number[]) => {
      const mapped = mapWallpaperAudio(values, gain);
      for (const name of ['bass', 'lowMid', 'mid', 'vocal', 'treble'] as const) {
        const previous = audioBands[name].get(), next = mapped[name];
        audioBands[name].set(previous + (next - previous) * (next > previous ? .7 : .3));
      }
      spectrum.set(mapped.spectrum); audioPower.set(mapped.power);
    };
    audio(host.audio);
    const remove = host.subscribe(event => {
      if (event.type === 'audio' || event.type === 'demo-audio') audio(controller.snapshot.suspended ? [] : event.data as number[]);
      if (event.type === 'suspend') audio([]);
    });
    return remove;
  }, [audioBands, audioPower, controller, gain, host, spectrum]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const time = Math.max(0, controller.getCurrentTimeSec(Date.now()) + offset);
      currentTime.set(time);
      const index = controller.snapshot.timelineSeen ? findLatestActiveLineIndex(lines, time) : -1;
      if (index !== indexRef.current) { indexRef.current = index; setIndex(index); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [controller, currentTime, lines, offset]);
  return { currentTime, currentLineIndex, audioPower, audioBands };
}
