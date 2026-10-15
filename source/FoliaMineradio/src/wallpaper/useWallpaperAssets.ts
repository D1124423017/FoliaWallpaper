import { useEffect } from 'react';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { getCustomCappellaAvatar } from '../services/cappellaAvatarPack';
import { getCustomCappellaEmojiPack } from '../services/cappellaEmojiPack';
import { getMonetBackgroundImage } from '../services/monetBackgroundImage';
import { getMonetPortraitImage } from '../services/monetPortraitImage';
import { createSafeObjectUrl } from '../utils/blobGuards';

// src/wallpaper/useWallpaperAssets.ts — restore Folia's existing IndexedDB assets; release every object URL.
export function useWallpaperAssets() {
  const emoji = useVisualizerAssetStore(state => state.storedCappellaEmojiPack);
  const avatar = useVisualizerAssetStore(state => state.storedCappellaAvatarPack);
  const background = useVisualizerAssetStore(state => state.storedMonetBackgroundImage);
  const portrait = useVisualizerAssetStore(state => state.storedMonetPortraitImage);
  useEffect(() => {
    let cancelled = false;
    const store = useVisualizerAssetStore.getState();
    void getCustomCappellaEmojiPack().then(value => { if (!cancelled) store.setStoredCappellaEmojiPack(value); })
      .catch(() => {}).finally(() => { if (!cancelled) store.setIsLoadingCappellaCustomEmojiPack(false); });
    void getCustomCappellaAvatar().then(value => { if (!cancelled) store.setStoredCappellaAvatarPack(value); })
      .catch(() => {}).finally(() => { if (!cancelled) store.setIsLoadingCappellaCustomAvatarPack(false); });
    void getMonetBackgroundImage().then(value => { if (!cancelled) store.setStoredMonetBackgroundImage(value); })
      .catch(() => {}).finally(() => { if (!cancelled) store.setIsLoadingMonetBackgroundImage(false); });
    void getMonetPortraitImage().then(value => { if (!cancelled) store.setStoredMonetPortraitImage(value); })
      .catch(() => {}).finally(() => { if (!cancelled) store.setIsLoadingMonetPortraitImage(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const images = emoji.flatMap(image => { const url = createSafeObjectUrl(image.blob); return url ? [{ id: image.id, name: image.name, url }] : []; });
    useVisualizerAssetStore.getState().setCappellaCustomEmojiImages(images);
    return () => images.forEach(image => URL.revokeObjectURL(image.url));
  }, [emoji]);
  useEffect(() => {
    const images = avatar.flatMap(image => { const url = createSafeObjectUrl(image.blob); return url ? [{ id: image.id, name: image.name, url }] : []; });
    useVisualizerAssetStore.getState().setCappellaCustomAvatarImages(images);
    return () => images.forEach(image => URL.revokeObjectURL(image.url));
  }, [avatar]);
  useEffect(() => {
    const url = createSafeObjectUrl(background?.blob);
    useVisualizerAssetStore.getState().setMonetBackgroundImage(url && background ? { id: background.id, name: background.name, url } : null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [background]);
  useEffect(() => {
    const url = createSafeObjectUrl(portrait?.blob);
    useVisualizerAssetStore.getState().setMonetPortraitImage(url && portrait ? { id: portrait.id, name: portrait.name, url } : null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [portrait]);
}
