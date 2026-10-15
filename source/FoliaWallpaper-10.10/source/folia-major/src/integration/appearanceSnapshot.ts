import type { ExperienceAppearance } from '../types/playerExperienceAppearance';

// A synchronous export reads current presentation values even while the debounced persistence is pending.
type AppearanceReader = () => { mode: 'folia' | 'custom'; appearance: ExperienceAppearance };
let reader: AppearanceReader | null = null;
export const currentExperienceAppearance = () => reader?.();
export function registerExperienceAppearanceReader(next: AppearanceReader): () => void {
  reader = next;
  return () => { if (reader === next) reader = null; };
}
