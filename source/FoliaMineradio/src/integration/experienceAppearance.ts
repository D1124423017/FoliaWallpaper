import { usePlayerExperienceStore } from '../stores/usePlayerExperienceStore';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { useStatusMessageStore } from '../stores/useStatusMessageStore';
import { EXPERIENCE_VISUAL_FIELDS, EXPERIENCE_TYPOGRAPHY_FIELDS, type ExperienceAppearance } from '../types/playerExperienceAppearance';
import type { PlayerExperienceMode } from '../types/playerExperience';
import { registerExperienceAppearanceReader } from './appearanceSnapshot';

// Save only Folia presentation preferences per experience. Shared colors, audio, accounts, assets and lyric clocks are untouched.
const scope = (mode: PlayerExperienceMode): 'custom' | 'folia' => mode === 'custom' ? 'custom' : 'folia';
const pick = (source: object, fields: readonly string[]) => Object.fromEntries(fields.map(key => [key, (source as Record<string, unknown>)[key]]));
const capture = (): ExperienceAppearance => ({ visualizer: pick(useVisualizerSettingsStore.getState(), EXPERIENCE_VISUAL_FIELDS), typography: pick(useTypographySettingsStore.getState(), EXPERIENCE_TYPOGRAPHY_FIELDS) });
function apply(appearance: ExperienceAppearance) {
  const previousMessage = useStatusMessageStore.getState().message;
  for (const [state, values] of [[useVisualizerSettingsStore.getState(), appearance.visualizer], [useTypographySettingsStore.getState(), appearance.typography]] as const) {
    const actions = state as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(values)) {
      if (JSON.stringify(actions[key]) === JSON.stringify(value)) continue;
      if (key === 'visualizerBackgroundMode' && value === null) { useVisualizerSettingsStore.getState().handleResetVisualizerBackgroundMode(); continue; }
      const toggle = key.startsWith('disable') || key.startsWith('random') || key.startsWith('hide')
        || key.endsWith('Background') || key.endsWith('Blur') || key === 'showHarmonySubtitle';
      const name = `handle${toggle ? 'Toggle' : 'Set'}${key[0]!.toUpperCase()}${key.slice(1)}`;
      const action = actions[name];
      if (typeof action === 'function') (action as (next: unknown, options?: { notify?: boolean }) => void)(value, { notify: false });
    }
  }
  useStatusMessageStore.setState({ message: previousMessage });
}
export function startExperienceAppearance(): () => void {
  let active = scope(usePlayerExperienceStore.getState().mode), applying = true, timer: ReturnType<typeof setTimeout> | undefined;
  const first = capture(), saved = usePlayerExperienceStore.getState().appearances;
  if (saved?.[active]) apply(saved[active]!);
  usePlayerExperienceStore.getState().setAppearance(active, capture());
  if (!usePlayerExperienceStore.getState().appearances?.[active === 'folia' ? 'custom' : 'folia'])
    usePlayerExperienceStore.getState().setAppearance(active === 'folia' ? 'custom' : 'folia', first);
  let signature = JSON.stringify(capture());
  applying = false;
  const stopReader = registerExperienceAppearanceReader(() => ({ mode: active, appearance: capture() }));
  const flush = () => {
    if (timer) clearTimeout(timer); timer = undefined;
    const appearance = capture(), next = JSON.stringify(appearance);
    if (next === signature) return;
    applying = true; signature = next;
    usePlayerExperienceStore.getState().setAppearance(active, appearance);
    applying = false;
  };
  const changed = () => { if (!applying) { if (timer) clearTimeout(timer); timer = setTimeout(flush, 150); } };
  const stopVisual = useVisualizerSettingsStore.subscribe(changed), stopTypography = useTypographySettingsStore.subscribe(changed);
  const stopExperience = usePlayerExperienceStore.subscribe((state, previous) => {
    if (applying) return;
    const nextScope = scope(state.mode), imported = state.appearances?.[nextScope] !== previous.appearances?.[nextScope];
    if (nextScope === active && !imported) return;
    if (nextScope === active && JSON.stringify(state.appearances?.[active]) === JSON.stringify(capture())) return;
    if (timer) clearTimeout(timer); timer = undefined;
    applying = true;
    if (nextScope !== active) usePlayerExperienceStore.getState().setAppearance(active, capture());
    active = nextScope;
    const appearance = state.appearances?.[active];
    if (appearance) apply(appearance);
    signature = JSON.stringify(capture());
    usePlayerExperienceStore.getState().setAppearance(active, capture());
    applying = false;
  });
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return () => {
    stopVisual(); stopTypography(); stopExperience(); flush(); stopReader();
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', flush);
  };
}
