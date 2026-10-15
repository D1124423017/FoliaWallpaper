'use strict';
// Expose supported shared settings in the original console; omit standalone-only native capabilities.
window.installFoliaMineradioCapabilities = function (bridge) {
  var unsupportedKeys = new Set(['aiDepth', 'desktopLyrics', 'desktopLyricsClickThrough', 'desktopLyricsCinema',
    'desktopLyricsHighlight', 'wallpaperMode', 'memoryAutoTrimApp', 'memoryAutoTrimOnBackground',
    'memoryAutoSystemTrim', 'memorySystemAutoElevate', 'liveBackgroundKeep']);
  function unavailable() { window.showToast('此原版功能尚未整合；桌布請使用 Wallpaper Engine。'); return false; }
  function openShared(section) {
    return bridge.request('openSettings', [section]).catch(function (error) {
      if (!bridge.disposed) window.showToast(error.message); return false;
    });
  }
  function omit(ref) {
    var node = window.fxConsoleResolveBlock(ref);
    if (!node) return;
    node.hidden = true; node.style.display = 'none';
    // Prevent the upstream console's unclassified-control fallback from restoring this entry.
    node.setAttribute('data-fx-console-entry', 'folia-unsupported');
  }
  var omittedGroups = {
    lyrics: new Set(['desktop']), shelf: new Set(['camera']),
    motion: new Set(['sonic-terrain', 'sonic-blocks', 'sonic-we']),
    system: new Set(['startup', 'output', 'memory', 'cache', 'experimental']),
  };
  var omittedRefs = new Set(['wallpaper-engine-value', 'performance-background-seg', 't-liveBackgroundKeep']);
  window.FX_CONSOLE_LAYOUT.forEach(function (tab) {
    tab.groups = tab.groups.filter(function (group) {
      if (omittedGroups[tab.key]?.has(group.key)) { group.items.forEach(function (item) { omit(item.ref); }); return false; }
      group.items = group.items.filter(function (item) {
        if (omittedRefs.has(item.ref)) { omit(item.ref); return false; } return true;
      });
      return group.items.length > 0;
    });
  });
  ['t-aidepth', 'wallpaper-fps-seg', 'fx-wallpaperopacity'].forEach(omit);
  document.querySelectorAll('.wallpaper-engine-visual-controls').forEach(function (node) { omit({ element: node }); });
  document.getElementById('cuefield-automix-btn')?.setAttribute('hidden', '');
  // Native audio-quality controls remain an entry to the actual shared playback settings.
  var qualityLabel = document.getElementById('quality-btn-label'); if (qualityLabel) qualityLabel.textContent = '音質';
  var qualityButton = document.getElementById('quality-btn'); if (qualityButton) qualityButton.title = '共用音質與播放設定';
  var shared = document.createElement('div'); shared.id = 'folia-shared-settings'; shared.className = 'fx-actions';
  [['共用播放設定', 'playback'], ['共用快取設定', 'storage']].forEach(function (item) {
    var button = document.createElement('button'); button.className = 'fx-mini-btn ghost'; button.type = 'button';
    button.textContent = item[0]; button.addEventListener('click', function () { openShared(item[1]); }); shared.appendChild(button);
  });
  document.getElementById('fx-panel')?.appendChild(shared);
  var system = window.FX_CONSOLE_LAYOUT.find(function (tab) { return tab.key === 'system'; });
  system?.groups.unshift({ key: 'shared', title: '共用播放器設定', hint: '音質、播放與快取由 Folia 管理', open: true,
    items: [window.fxConsoleItem('folia-shared-settings', '共用播放與快取設定', '音質 播放 快取', false)] });
  var originalToggleFx = window.toggleFx;
  window.toggleFx = function (key) {
    if (unsupportedKeys.has(key)) return unavailable();
    return originalToggleFx.apply(this, arguments);
  };
  ['toggleCuefieldAutoMix', 'runAppMemoryTrim', 'runSystemMemoryPurge', 'openWallpaperEngineLibrary'].forEach(function (name) { window[name] = unavailable; });
  window.startGestureControl = function () { return Promise.resolve(unavailable()); };
  window.resumeSavedGestureControl = function () { return Promise.resolve(false); };
  window.syncGestureControlHostVisibility = function () {};
  window.setCamMode = function () { return Promise.resolve(unavailable()); };
  window.ensureAIDepthPipeline = window.estimateAIDepth = function () { return Promise.resolve(null); };
  window.queueAIDepthForCover = function () {};
  window.openAudioOutputWorkflowPanel = function () { return openShared('playback'); };
  window.openHotkeySettings = function () { return openShared('interaction'); };
  var registerHotkeys = window.fxConsoleRegisterHotkeySearchEntry;
  window.fxConsoleRegisterHotkeySearchEntry = function () {
    registerHotkeys();
    var button = document.getElementById('hotkey-settings-btn');
    if (button) button.title = '共用快捷鍵設定';
    var entry = window.fxConsoleRegistry.find(function (item) { return item.element === button; });
    if (entry) { entry.title = '共用快捷鍵設定'; entry.group = 'shared'; entry.groupLabel = '共用播放器設定'; }
  };
  window.chooseMineradioCacheRoot = function () { return openShared('storage'); };
  window.restartMineradioForCachePath = unavailable;
};
