'use strict';
// Mount the original Mineradio scene as a state-consuming presentation, with bounded host messages.
(function startFoliaMineradioPresentation() {
  var guard = window.__foliaMineradioGuard, pending = new Map(), serial = 0, errors = [];
  var bridge = window.__foliaMineradioBridge = {
    snapshot: { song: null, queue: [], position: 0, lyricPosition: 0, duration: 0, playing: false, volume: 1,
      lyrics: [], collections: [], accounts: [], audio: {}, theme: {}, presentation: {} },
    disposed: false, suspended: false, errors: errors,
    safeCover: function (value) {
      var text = typeof value === 'string' ? value : '';
      return /^(https?:|blob:|data:image\/(?:png|jpe?g|webp|gif|avif);|file:|folia-cover:|mineradio-local:)/i.test(text) ? text : '';
    },
    request: function (action, args) {
      if (bridge.disposed) return Promise.reject(new Error('畫面已卸載'));
      var transport = ['play', 'pause', 'toggle', 'next', 'previous', 'seek'];
      if (bridge.snapshot.controlsDisabled && transport.includes(action)) return Promise.resolve(false);
      var id = 'mineradio-' + (++serial);
      return new Promise(function (resolve, reject) {
        var timer = guard.native.setTimeout(function () { pending.delete(id); reject(new Error('Folia 核心回應逾時')); }, 20000);
        pending.set(id, { resolve: resolve, reject: reject, timer: timer });
        parent.postMessage({ type: 'folia-mineradio-action-v1', id: id, action: action, args: args || [] }, '*');
      });
    },
  };
  // The standalone startup binding is omitted; initialize its lyric visibility once, then preserve user toggles.
  window.lyricsVisible = !!window.fx.particleLyrics;
  var state = window.installFoliaMineradioState(bridge);
  var visuals = window.installFoliaMineradioVisuals(bridge);
  window.installFoliaMineradioActions(bridge);
  window.installFoliaMineradioCapabilities(bridge);
  // Native lyrics use the already offset-corrected Folia clock; transport uses the actual media clock.
  window.stageLyricPlaybackSeconds = state.lyricPosition;
  window.getAdjustedLyricPlaybackTime = function (seconds) { return seconds; };
  var originalPreset = window.setPreset;
  window.setPreset = function (preset) {
    if ([7, 8].includes(Number(preset))) { showToast('這個第三方預設尚未整合'); return; }
    return originalPreset.apply(this, arguments);
  };
  if ([7, 8].includes(Number(fx.preset))) fx.preset = 0;
  fx.wallpaperMode = false; fx.desktopLyrics = false; fx.cuefieldAutoMix = false;
  startupAutoplayPreference = false; emptyHomeActive = false; homeSuppressed = true;
  document.body.classList.remove('splash-active', 'home-active', 'empty-home-active');
  var splash = document.getElementById('splash'); if (splash) splash.remove();
  var status = document.createElement('div'); status.id = 'folia-core-status';
  status.textContent = 'Folia 共用播放核心 · 等待歌曲'; document.body.appendChild(status);
  // The original DIY toggle lived in the standalone title bar, which the host replaces.
  // Move that same button into the retained account controls so the native visual panel stays reachable.
  var diyButton = document.getElementById('diy-mode-btn'), topRight = document.getElementById('top-right');
  if (diyButton && topRight) topRight.prepend(diyButton);
  applyDiyMode(diyPlayerMode, { save: false });
  bindFxPanel(); applySavedLyricPaletteState(); bindVolumeControls();
  initControlGlassSurface(); bindPlayerControlAnimations(); applyControlsAutoHidePreference();
  applyUserCapsuleAutoHideState(); applyFxFabAutoHideState();
  setShelfMode(fx.shelf, { noSave: true });
  if (fx.shelf === 'side') setShelfPinnedOpen(!!fx.shelfPinnedOpen, true, false);
  switchPlaylistTab('queue', { save: false, animate: false, refresh: false });
  applyPlaylistPanelPinState(false);
  if (fx.floatLayer) createFloatLayer(); if (fx.particleLyrics) createLyricsParticles();
  if (fx.backCover) createBackCoverLayer();
  buildPresetGrid(); syncFxUniforms(); safeRenderQueuePanel('folia-mount');
  var lastUiAt = 0;
  function receive(event) {
    if (event.source !== parent || bridge.disposed || !event.data || typeof event.data !== 'object') return;
    var message = event.data;
    if (message.type === 'folia-mineradio-result-v1') {
      var task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); guard.native.clearTimeout(task.timer);
      if (message.error) task.reject(new Error(String(message.error))); else task.resolve(message.result);
      return;
    }
    if (message.type !== 'folia-mineradio-core-v1') return;
    if (message.action === 'dispose') { bridge.dispose(); return; }
    if (!message.snapshot || typeof message.snapshot !== 'object') return;
    var next = Object.assign({}, bridge.snapshot, message.snapshot);
    var changedSuspend = !!next.suspended !== bridge.suspended;
    bridge.suspended = !!next.suspended;
    state.update(next, Object.keys(message.snapshot).some(function (key) {
      return !['position', 'lyricPosition', 'audio', 'playing', 'suspended'].includes(key);
    }), performance.now() - lastUiAt > 120);
    visuals.update();
    if (performance.now() - lastUiAt > 120) lastUiAt = performance.now();
    if (changedSuspend) {
      if (bridge.suspended) { window.gsap?.ticker.sleep(); guard.suspend(true); }
      else {
        guard.suspend(false); window.gsap?.ticker.wake();
        mainLoopAnimationRequested = false; prevTime = performance.now(); requestMainLoopAnimationFrame();
      }
    }
  }
  function onError(event) { if (errors.length < 20) errors.push(String(event.message || 'runtime-error')); }
  function onReject(event) { if (errors.length < 20) errors.push(String(event.reason?.message || 'unhandled-rejection')); }
  bridge.dispose = function () {
    if (bridge.disposed) return;
    bridge.disposed = true;
    pending.forEach(function (task) { guard.native.clearTimeout(task.timer); task.reject(new Error('畫面已卸載')); }); pending.clear();
    visuals.dispose();
    state.dispose();
    try { window.cleanupGestureControlRuntime?.(); } catch (error) { }
    document.querySelectorAll('video').forEach(function (video) {
      video.pause(); var stream = video.srcObject;
      if (stream && stream.getTracks) stream.getTracks().forEach(function (track) { track.stop(); });
      video.srcObject = null; video.removeAttribute('src'); video.load();
    });
    try { window.flushPersistentVisualState?.(); window.flushLyricLayoutSave?.(); } catch (error) { }
    try { window.gsap?.globalTimeline.clear(); window.gsap?.ticker.sleep(); } catch (error) { }
    try { shelfManager?.setMode('off'); clearStageLyrics(); } catch (error) { }
    var textures = new Set(), materials = new Set(), geometries = new Set();
    scene.traverse(function (object) {
      if (object.geometry) geometries.add(object.geometry);
      var list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      list.forEach(function (material) {
        materials.add(material); Object.values(material).forEach(function (value) { if (value?.isTexture) textures.add(value); });
        Object.values(material.uniforms || {}).forEach(function (uniform) { if (uniform?.value?.isTexture) textures.add(uniform.value); });
      });
    });
    [dotTexture, rippleTex, coverTex, prevCoverTex, coverEdgeTex].forEach(function (texture) { textures.add(texture); });
    textures.forEach(function (texture) { texture.dispose(); }); materials.forEach(function (material) { material.dispose(); });
    geometries.forEach(function (geometry) { geometry.dispose(); });
    renderer.dispose(); renderer.forceContextLoss(); guard.dispose();
  };
  bridge.diagnostics = function () {
    return { owner: 'Folia', nativeAudioElements: document.querySelectorAll('audio').length, disposed: bridge.disposed,
      suspended: bridge.suspended, queue: playQueue.map(function (song) { return song.__foliaKey; }),
      position: state.position(), lyricPosition: state.lyricPosition(), songKey: bridge.snapshot.song?.key || null,
      playing: bridge.snapshot.playing, particleLyrics: fx.particleLyrics, lyricsVisible: lyricsVisible,
      lyrics: lyricsLines.length, preset: fx.preset, shelfMode: shelfManager.getMode(),
      scheduling: guard.diagnostics(), visuals: visuals.diagnostics(), gpu: Object.assign({}, renderer.info.memory), errors: errors.slice() };
  };
  addEventListener('message', receive); addEventListener('error', onError); addEventListener('unhandledrejection', onReject);
  parent.postMessage({ type: 'folia-mineradio-core-ready-v1' }, '*');
})();
