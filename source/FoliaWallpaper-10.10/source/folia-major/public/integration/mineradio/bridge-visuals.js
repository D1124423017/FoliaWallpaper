'use strict';
// Keep original timing and camera functions active only for the visible native scene layers.
window.installFoliaMineradioVisuals = function (bridge) {
  var stopped = false, previousActive = true, previousLyrics = true, cleared = false;
  var counters = { frames: 0, skippedFrames: 0, backgroundSteps: 0, skippedBackgroundSteps: 0, lyricSteps: 0, skippedLyricSteps: 0 };
  function backgroundVisible() { return bridge.snapshot.presentation?.showBackground !== false; }
  function lyricsVisibleInHost() { return bridge.snapshot.presentation?.showLyrics !== false; }
  function hasScene() {
    return backgroundVisible() || (lyricsVisibleInHost() && window.fx.particleLyrics !== false)
      || (bridge.snapshot.presentation?.showShelf !== false && window.shelfManager.getMode() !== 'off');
  }
  function gate(names, active, runKey, skipKey) {
    names.forEach(function (name) {
      var original = window[name];
      if (typeof original !== 'function') return;
      window[name] = function () {
        if (stopped || !active()) { counters[skipKey]++; return; }
        counters[runKey]++;
        return original.apply(this, arguments);
      };
    });
  }
  gate(['updateFloatLayer', 'updateRipples', 'updateBackgroundStarRiverState'], backgroundVisible,
    'backgroundSteps', 'skippedBackgroundSteps');
  // Skull lyrics inherit the mouth transform and flash, so retain that dependency in lyric-only mixes.
  gate(['updateSkullParticleLayer'], function () {
    return backgroundVisible() || (lyricsVisibleInHost() && window.fx.preset === window.SKULL_PRESET_INDEX);
  }, 'backgroundSteps', 'skippedBackgroundSteps');
  gate(['tickLyricsParticles', 'updateStageLyrics3D'], lyricsVisibleInHost, 'lyricSteps', 'skippedLyricSteps');
  var originalRenderLyrics = window.renderLyrics;
  window.renderLyrics = function () {
    if (!stopped && lyricsVisibleInHost()) return originalRenderLyrics.apply(this, arguments);
  };
  var originalAnimate = window.animate;
  window.animate = function () {
    if (stopped || !hasScene()) {
      window.mainLoopAnimationRequested = false;
      counters.skippedFrames++;
      if (!cleared && !stopped) { window.renderer.clear(true, true, true); cleared = true; }
      return;
    }
    cleared = false; counters.frames++;
    return originalAnimate.apply(this, arguments);
  };
  var originalRender = window.renderer.render.bind(window.renderer);
  window.renderer.render = function (scene, camera) {
    var hidden = [];
    function hide(object) {
      if (object) { hidden.push([object, object.visible]); object.visible = false; }
    }
    if (!backgroundVisible()) {
      [window.particles, window.bloomParticles, window.floatGroup, window.backCoverGroup,
        window.backgroundStarRiverParticles, window.skullParticleGroup].forEach(hide);
    }
    if (!lyricsVisibleInHost()) { hide(window.stageLyrics?.group); hide(window.lyricsParticles); }
    try { return originalRender(scene, camera); }
    finally { hidden.forEach(function (record) { record[0].visible = record[1]; }); }
  };
  return {
    update: function () {
      if (stopped) return;
      var lyricsActive = lyricsVisibleInHost(), active = hasScene();
      if (previousLyrics && !lyricsActive) window.clearStageLyrics();
      else if (!previousLyrics && lyricsActive) originalRenderLyrics();
      previousLyrics = lyricsActive;
      if (!active && window.mainLoopBackgroundTimer) {
        window.clearTimeout(window.mainLoopBackgroundTimer); window.mainLoopBackgroundTimer = 0;
      }
      if (active && !previousActive && !bridge.suspended) {
        window.prevTime = performance.now(); window.requestMainLoopAnimationFrame();
      }
      previousActive = active;
    },
    diagnostics: function () { return Object.assign({ active: hasScene(), background: backgroundVisible(), lyrics: lyricsVisibleInHost() }, counters); },
    dispose: function () { stopped = true; },
  };
};
