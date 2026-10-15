import { useEffect, useRef } from 'react';
import type { IntegrationActions } from './contracts';
import { startIntegrationShuffle } from './shufflePolicy';
import { clearIntegrationDisplayCover } from './displayCover';
import { startExperienceAppearance } from './experienceAppearance';

// Keep transport callbacks attached to the long-lived app, independent of the selected view.
let readActions: (() => IntegrationActions) | null = null;
export function getIntegrationActions(): IntegrationActions {
  if (!readActions) throw new Error('播放核心尚未就緒');
  return readActions();
}
export function useIntegrationHostActions(actions: IntegrationActions) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const reader = () => latest.current;
    readActions = reader;
    const stopShuffle = startIntegrationShuffle(reader);
    const stopAppearance = startExperienceAppearance();
    return () => { stopShuffle(); stopAppearance(); clearIntegrationDisplayCover(); if (readActions === reader) readActions = null; };
  }, []);
}
