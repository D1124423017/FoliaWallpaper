import type { ComponentProps } from 'react';
import VisualizerRenderer from '../visualizer/VisualizerRenderer';
import { usePlayerExperienceStore } from '../../stores/usePlayerExperienceStore';
import MineradioExperienceView from './MineradioExperienceView';

// Compose original renderers from the selected profile, without owning playback or lyric timing.
export default function ExperienceStage({ model, mounted }: {
  model: ComponentProps<typeof VisualizerRenderer>; mounted: boolean;
}) {
  const profile = usePlayerExperienceStore(state => state.profile);
  const mode = usePlayerExperienceStore(state => state.mode);
  const originalControls = profile.controls === 'mineradio';
  const mineradio = originalControls || profile.lyrics === 'mineradio' || profile.background === 'mineradio';
  const folia = profile.lyrics === 'folia' || profile.background === 'folia';
  if (!mounted && !originalControls) return null;
  return <>
    {folia && <div style={{ position: 'absolute', inset: 0, zIndex: profile.lyrics === 'folia' ? 1 : 0,
      pointerEvents: profile.controls === 'folia' && profile.lyrics === 'folia' ? 'auto' : 'none' }}>
      <VisualizerRenderer {...model} showText={profile.lyrics === 'folia' && (model.showText || originalControls)}
        hideTranslationSubtitle={profile.lyrics !== 'folia' || model.hideTranslationSubtitle}
        background={{ ...model.background, transparent: profile.background !== 'folia' }}
        backgroundStaticMode={profile.background !== 'folia' || model.backgroundStaticMode}
        isPlayerChromeHidden={originalControls || model.isPlayerChromeHidden} />
    </div>}
    {mineradio && <MineradioExperienceView key={mode} profileKey={mode} theme={model.theme} presentation={{
      showLyrics: profile.lyrics === 'mineradio', showBackground: profile.background === 'mineradio',
      showControls: originalControls, showShelf: originalControls,
    }} />}
  </>;
}
