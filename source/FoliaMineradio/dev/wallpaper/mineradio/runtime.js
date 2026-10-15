// Bounded host loop: original GPU shaders/geometry/transitions, external audio and no music playback.
var input = { preset: 0, intensity: 85, speed: 100, point: 100, bloom: 62, opacity: 80, playing: false, suspended: false,
  bass: 0, mid: 0, treble: 0, power: 0, theme: { primary: '#9db8cf', secondary: '#7896c0', accent: '#7ec8d8', background: '#10121b' } };
var supported = [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12];
var frame = 0, lastFrame = 0, receivedAt = 0, frames = 0, disposed = false;
createFloatLayer();
uniforms.uAlpha.value = 1;
uniforms.uFloatAlpha.value = 0.35;
applyPresetOrbitBaseline(0, { syncCurrent: true });
syncFxUniforms();

// Local Web Wallpaper scripts also work under file://, where fetch of binary resources may be restricted.
loadSkullParticleAsset = function () {
  if (skullParticleAsset.data || skullParticleAsset.promise || skullParticleAsset.failed) return skullParticleAsset.promise || Promise.resolve(skullParticleAsset.data);
  skullParticleAsset.promise = new Promise(function (resolve) {
    var script = document.createElement('script'); script.src = './assets/skull-points.js';
    script.onload = function () {
      try {
        var raw = atob(window.__mineradioSkullPoints);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        if (!bytes.length || bytes.length % 20 !== 0) throw new Error('Invalid skull points');
        skullParticleAsset.data = new Float32Array(bytes.buffer);
      } catch (error) { skullParticleAsset.failed = true; }
      delete window.__mineradioSkullPoints; script.remove(); skullParticleAsset.promise = null;
      resolve(skullParticleAsset.data);
    };
    script.onerror = function () { skullParticleAsset.failed = true; script.remove(); skullParticleAsset.promise = null; resolve(null); };
    document.head.appendChild(script);
  });
  return skullParticleAsset.promise;
};

function receive(event) {
  if (event.source !== parent || event.data?.type !== 'folia-mineradio-v1') return;
  var message = event.data;
  if (message.action === 'dispose') { dispose(); return; }
  var data = message.data;
  if (!data || typeof data !== 'object') return;
  var previous = fx.preset;
  input = data; receivedAt = performance.now();
  fx.preset = supported.includes(Number(input.preset)) ? Number(input.preset) : 0;
  fx.intensity = clampRange(Number(input.intensity) / 100, 0, 2);
  fx.speed = clampRange(Number(input.speed) / 100, 0, 2);
  fx.point = clampRange(Number(input.point) / 100, 0.5, 2);
  fx.bloomStrength = clampRange(Number(input.bloom) / 100, 0, 1.2);
  fx.bloom = fx.bloomStrength > 0;
  var theme = input.theme || {};
  stageLyrics.coverPalette = { primary: normalizeHexColor(theme.primary), secondary: normalizeHexColor(theme.secondary), highlight: normalizeHexColor(theme.accent) };
  fx.visualTintColor = stageLyrics.coverPalette.secondary;
  document.body.style.backgroundColor = normalizeHexColor(theme.background, '#10121b');
  syncFxUniforms();
  if (previous !== fx.preset) {
    clearSkullPresetResidue();
    triggerPresetParticleTransition(previous, fx.preset);
    applyPresetOrbitBaseline(fx.preset, { syncCurrent: true });
  }
  setWallpaperCover(typeof input.cover === 'string' ? input.cover : '', theme);
  if (!frame && !input.suspended && !document.hidden) frame = requestAnimationFrame(tick);
}

// Smooth incoming 30 Hz spectrum without React updates or allocating buffers each frame.
function tick(now) {
  frame = 0;
  if (disposed || input.suspended || document.hidden) { lastFrame = 0; return; }
  var frameInterval = input.playing ? 1000 / 30 : 1000 / 5;
  if (now - lastFrame < frameInterval - 1) { frame = requestAnimationFrame(tick); return; }
  var dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 1 / 30);
  lastFrame = now;
  var live = input.playing && now - receivedAt < 2000;
  smoothBass += ((live ? input.bass : 0) - smoothBass) * 0.5;
  smoothMid += ((live ? input.mid : 0) - smoothMid) * 0.5;
  smoothTreb += ((live ? input.treble : 0) - smoothTreb) * 0.5;
  var previousEnergy = smoothEnergy;
  smoothEnergy += ((live ? input.power : 0) - smoothEnergy) * 0.5;
  beatPulse = Math.max(beatPulse * Math.pow(0.82, dt * 60), clampRange((smoothEnergy - previousEnergy) * 5, 0, 1));
  updateWallpaperAudioResponse();
  if (live) uniforms.uTime.value += dt;
  uniforms.uBass.value = bass; uniforms.uMid.value = mid; uniforms.uTreble.value = treble;
  uniforms.uBeat.value = beatPulse; uniforms.uEnergy.value = audioEnergy;
  uniforms.uColorMixT.value = Math.min(1, uniforms.uColorMixT.value + dt * 1.4);
  uniforms.uBurstAmt.value *= Math.pow(0.9, dt * 60);
  uniforms.uVinylSpin.value += live ? dt * 0.22 : 0;
  uniforms.uAlpha.value = clampRange(Number(input.opacity) / 100, 0, 1);
  if (live) { updateRipples(dt); tickPresetTransition(); }
  updateBackgroundStarRiverState(dt);
  backgroundStarRiverUniforms.uTime.value = uniforms.uTime.value;
  backgroundStarRiverUniforms.uBass.value = bass;
  backgroundStarRiverUniforms.uEnergy.value = audioEnergy;
  particles.visible = fx.preset !== 6 && fx.preset !== 3;
  bloomParticles.visible = particles.visible && fx.bloom;
  if (floatGroup) floatGroup.visible = fx.preset !== 3 && fx.preset !== 6;
  backgroundStarRiverParticles.visible = fx.preset !== 3 && backgroundStarRiverParticles.visible;
  updateSkullParticleLayer(dt);
  if (skullParticleGroup) skullParticleGroup.material.uniforms.uOpacity.value *= uniforms.uAlpha.value;
  var radius = orbit.userRadius;
  camera.position.set(Math.sin(orbit.userTheta) * radius, Math.sin(orbit.userPhi) * radius, Math.cos(orbit.userTheta) * Math.cos(orbit.userPhi) * radius);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera); frames++;
  window.__mineradioDiagnostics = { preset: fx.preset, frames: frames, time: uniforms.uTime.value,
    bass: bass, power: audioEnergy, coverReady: coverReady, coverError: coverError, playing: !!input.playing,
    points: geo.userData.count, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  frame = requestAnimationFrame(tick);
}
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2600000 / (innerWidth * innerHeight))));
  renderer.setSize(innerWidth, innerHeight); uniforms.uPixel.value = renderer.getPixelRatio();
}
function dispose() {
  disposed = true; cancelAnimationFrame(frame); coverRequest++;
  scene.traverse(function (object) { object.geometry?.dispose(); if (object.material) object.material.dispose(); });
  [dotTexture, rippleTex, coverTex, prevCoverTex, coverEdgeTex].forEach(function (texture) { texture.dispose(); });
  renderer.dispose(); renderer.forceContextLoss();
  removeEventListener('message', receive); removeEventListener('resize', resize);
}
addEventListener('message', receive);
addEventListener('resize', resize);
addEventListener('pagehide', dispose, { once: true });
document.addEventListener('visibilitychange', function () { lastFrame = 0; if (!frame && !document.hidden && !disposed) frame = requestAnimationFrame(tick); });
parent.postMessage({ type: 'folia-mineradio-ready-v1' }, '*');
