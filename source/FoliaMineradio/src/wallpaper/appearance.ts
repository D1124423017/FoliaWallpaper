import type { VisualizerSettingsPanelProps, VisualizerSettingsResetProps } from '../components/visualizer/definition';
import type { VisualizerBackgroundActions, VisualizerBackgroundConfig } from '../components/visualizer/backgrounds/definition';
import { collectVisualizerTunings } from '../components/visualizer/tuningRegistry';
import type { VisualizerSettingsState } from '../stores/useVisualizerSettingsStore';
import type { VisualizerAssetState } from '../stores/useVisualizerAssetStore';
import type { WallpaperSettings } from './settings';
import { useWallpaperPreferences } from './preferences';

// src/wallpaper/appearance.ts — adapt the existing Folia setting actions, not the animation implementation.
export function wallpaperAppearance(state: VisualizerSettingsState, assets: VisualizerAssetState, settings: WallpaperSettings) {
  const background: VisualizerBackgroundConfig = {
    mode: settings.background, customImage: assets.monetBackgroundImage,
    common: { useCoverColorBg: settings.coverColorBackground, opacity: state.backgroundOpacity,
      disableGeometricBackground: state.disableVisualizerGeometricBackground, disableVignette: state.disableVisualizerVignette },
    monet: { tuning: state.monetBackgroundTuning }, nomand: { tuning: state.nomandBackgroundTuning },
    latent: { tuning: state.latentBackgroundTuning }, sora: { tuning: state.soraBackgroundTuning },
  };
  const actions: VisualizerBackgroundActions = {
    common: { onOpacityChange: state.handleSetBackgroundOpacity,
      onCoverColorChange: enabled => useWallpaperPreferences.getState().change({ covercolorbg: enabled }),
      onDisableGeometricChange: state.handleToggleDisableVisualizerGeometricBackground,
      onDisableVignetteChange: state.handleToggleDisableVisualizerVignette },
    customImage: { onUpload: state.handleUploadMonetBackgroundImage, onClear: state.handleClearMonetBackgroundImage,
      isLoading: assets.isLoadingMonetBackgroundImage },
    monet: { onTuningChange: state.handleSetMonetBackgroundTuning, onResetTuning: state.handleResetMonetBackgroundTuning },
    nomand: { onTuningChange: state.handleSetNomandBackgroundTuning, onResetTuning: state.handleResetNomandBackgroundTuning },
    latent: { onTuningChange: state.handleSetLatentBackgroundTuning, onResetTuning: state.handleResetLatentBackgroundTuning },
    sora: { onTuningChange: state.handleSetSoraBackgroundTuning, onResetTuning: state.handleResetSoraBackgroundTuning },
    onModeChange: mode => { if (mode !== 'url') useWallpaperPreferences.getState().change({ background: mode }); },
  };
  const panel: Partial<VisualizerSettingsPanelProps> = {};
  const resets: VisualizerSettingsResetProps = {};
  // The existing registry defines setting keys/setters; every supplied panel uses the same contract.
  for (const mode of ['Classic', 'Partita', 'Fume', 'Claddagh', 'Cappella', 'Tilt', 'Diorama', 'Monet', 'Pendolo', 'Sonnet', 'Tempera', 'Lumiere']) {
    const lower = mode[0].toLowerCase() + mode.slice(1);
    Object.assign(panel, { [`${lower}Tuning`]: state[`${lower}Tuning` as keyof VisualizerSettingsState],
      [`on${mode}TuningChange`]: state[`handleSet${mode}Tuning` as keyof VisualizerSettingsState] });
    Object.assign(resets, { [`reset${mode}Tuning`]: state[`handleReset${mode}Tuning` as keyof VisualizerSettingsState] });
  }
  Object.assign(panel, {
    cappellaCustomEmojiImages: assets.cappellaCustomEmojiImages,
    cappellaCustomEmojiCount: assets.cappellaCustomEmojiImages.length,
    hasCappellaCustomEmojiPack: assets.cappellaCustomEmojiImages.length > 0,
    isCappellaCustomEmojiPackLoading: assets.isLoadingCappellaCustomEmojiPack,
    onImportCappellaCustomEmojiPack: state.handleImportCustomCappellaEmojiPack,
    onClearCappellaCustomEmojiPack: state.handleClearCustomCappellaEmojiPack,
    cappellaCustomAvatarImages: assets.cappellaCustomAvatarImages,
    hasCappellaCustomAvatar: assets.cappellaCustomAvatarImages.length > 0,
    isCappellaCustomAvatarLoading: assets.isLoadingCappellaCustomAvatarPack,
    onImportCappellaCustomAvatar: state.handleImportCustomCappellaAvatar,
    onClearCappellaCustomAvatar: state.handleClearCustomCappellaAvatar,
    monetPortraitImage: assets.monetPortraitImage, isLoadingMonetPortraitImage: assets.isLoadingMonetPortraitImage,
    onUploadMonetPortraitImage: state.handleUploadMonetPortraitImage, onClearMonetPortraitImage: state.handleClearMonetPortraitImage,
  });
  return { background, actions, panel, resets, tunings: collectVisualizerTunings(state as unknown as Record<string, unknown>) };
}
