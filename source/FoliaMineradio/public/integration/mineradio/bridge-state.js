'use strict';
// Adapt authoritative Folia snapshots to upstream globals without owning playback or provider state.
window.installFoliaMineradioState = function (bridge) {
  var anchor = { position: 0, lyricPosition: 0, at: performance.now(), playing: false }, coverSerial = 0;
  var songSignature = '', queueSignature = '', collectionSignature = '', lyricSignature = '';
  var themeSignature = '', hiddenLyrics = false, hiddenShelf = false, desiredShelf = null;
  var desiredParticleLyrics = window.fx.particleLyrics, desiredLyricsVisible = window.lyricsVisible;
  function restoreShelf() {
    if (!desiredShelf) return;
    window.shelfManager.setMode(desiredShelf.mode);
    window.fx.shelf = desiredShelf.mode; window.fx.shelfPresence = desiredShelf.presence;
    window.setShelfPinnedOpen?.(desiredShelf.pinned, true, false);
    window.fx.shelfPinnedOpen = desiredShelf.pinned;
  }
  function finite(value, fallback) { value = Number(value); return Number.isFinite(value) ? value : fallback; }
  function position() {
    var elapsed = anchor.playing && !bridge.suspended ? Math.max(0, (performance.now() - anchor.at) / 1000) : 0;
    return Math.max(0, Math.min(bridge.snapshot.duration || Infinity, anchor.position + elapsed));
  }
  function lyricPosition() {
    var elapsed = anchor.playing && !bridge.suspended ? Math.max(0, (performance.now() - anchor.at) / 1000) : 0;
    return Math.max(0, anchor.lyricPosition + elapsed);
  }
  function convertSong(song) {
    if (!song) return null;
    var converted = Object.assign({}, song, { __foliaKey: String(song.key || song.id || ''),
      id: String(song.key || song.id || ''), name: String(song.name || ''), artist: String(song.artist || ''),
      picUrl: bridge.safeCover(song.picurl || song.picUrl || ''), cover: bridge.safeCover(song.picurl || song.picUrl || ''),
      provider: String(song.source || 'local'), source: String(song.source || 'local'),
      duration: finite(song.duration, 0) * 1000, type: 'folia-core' });
    window.likedSongMap[window.songAccountStateKey(converted)] = !!song.liked;
    return converted;
  }
  // The facade supplies a continuous, anchored timeline. Seeking and transport always go back to Folia.
  var media = new EventTarget();
  Object.defineProperties(media, {
    currentTime: { get: position, set: function (value) { bridge.request('seek', [Math.max(0, finite(value, 0))]); } },
    duration: { get: function () { return bridge.snapshot.duration || 0; } },
    paused: { get: function () { return !bridge.snapshot.playing; } },
    ended: { get: function () { return false; } },
    volume: { get: function () { return bridge.snapshot.volume; }, set: function (value) { bridge.request('volume', [finite(value, 1)]); } },
    src: { get: function () { return 'folia-core:' + (bridge.snapshot.song?.key || 'idle'); }, set: function () {} },
    currentSrc: { get: function () { return media.src; } },
    readyState: { get: function () { return 4; } },
    buffered: { get: function () { return { length: 0, start: function () { return 0; }, end: function () { return 0; } }; } },
  });
  media.play = function () { return bridge.request('play', []); };
  media.pause = function () { bridge.request('pause', []); };
  media.load = function () {};
  media.getAttribute = function (name) { return name === 'src' ? media.src : null; };
  media.__mineradioTrackSwitchToken = 0;
  bridge.convertSong = convertSong;
  window.audio = media; window.audioReady = true;
  window.audioCtx = { state: 'running', get sampleRate() { return bridge.snapshot.audio?.sampleRate || 44100; } };
  // The core sends band energies. Preserve upstream response/camera calculations using those bands.
  window.analyser = {
    fftSize: 2048,
    getByteFrequencyData: function (buffer) {
      var signal = bridge.snapshot.playing ? bridge.snapshot.audio || {} : {};
      var samples = signal.frequency;
      if (samples?.length) {
        for (var index = 0; index < buffer.length; index++) buffer[index] = samples[Math.floor(index * samples.length / buffer.length)];
        return;
      }
      for (var index = 0; index < buffer.length; index++) {
        var value = index < 7 ? signal.bass : index < 280 ? signal.mid : signal.treble;
        buffer[index] = Math.round(Math.max(0, Math.min(1, finite(value, 0))) * 255);
      }
    },
    getByteTimeDomainData: function (buffer) {
      var samples = bridge.snapshot.playing ? bridge.snapshot.audio?.timeDomain : null;
      for (var index = 0; index < buffer.length; index++) buffer[index] = samples?.length
        ? samples[Math.floor(index * samples.length / buffer.length)] : 128;
    },
  };
  window.beatAnalyser = window.analyser;
  function loadCover(url) {
    var token = ++coverSerial, src = bridge.safeCover(url);
    if (!src) { window.uniforms.uHasCover.value = 0; window.setAlbumBackground(''); window.setControlCoverSrc(''); return; }
    var image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
    image.onload = function () {
      if (token !== coverSerial || bridge.disposed) return;
      var canvas = window.makeSquareCoverCanvas(image, window.coverTextureSizeForResolution(window.fx.coverResolution));
      try { window.applyCoverCanvas(canvas, src, { noCoverTransition: false, coverKey: src, coverSourceKind: 'url', coverSource: src }); }
      catch (error) { bridge.errors.push('cover:' + String(error.message)); }
      window.setAlbumBackground(src); window.setControlCoverSrc(src);
      var thumb = document.getElementById('thumb-cover'); if (thumb) thumb.src = src;
    };
    image.onerror = function () { if (token === coverSerial) bridge.errors.push('cover-load'); };
    image.src = src;
  }
  function lyrics(input, duration) {
    return input.map(function (line, index) {
      var cursor = 0;
      var words = (line.words || []).map(function (word) {
        var text = String(word.text || ''), start = Math.max(0, finite(word.time, line.time || 0)), from = cursor;
        cursor += text.length;
        return { text: text, t: start, d: Math.max(.01, finite(word.endTime, start + .1) - start), c0: from, c1: cursor };
      });
      var time = Math.max(0, finite(line.time, 0));
      var end = finite(line.endTime, finite(input[index + 1]?.time, duration || time + 4));
      return { t: time, duration: Math.max(.01, end - time), text: String(line.text || ''),
        translation: String(line.translation || ''), words: words, charCount: Math.max(1, String(line.text || '').length),
        source: words.length ? 'yrc-word' : 'lrc-line' };
    });
  }
  function update(data, full, updateUi) {
    var wasPlaying = !!bridge.snapshot.playing;
    bridge.snapshot = data;
    anchor.position = Math.max(0, finite(data.position, 0)); anchor.at = performance.now(); anchor.playing = !!data.playing;
    anchor.lyricPosition = Math.max(0, finite(data.lyricPosition, anchor.position));
    window.playing = !!data.playing; window.targetVolume = Math.max(0, Math.min(1, finite(data.volume, 1)));
    if (!full) {
      if (updateUi) { window.setPlayIcon(window.playing); window.updatePlaybackProgressUi(); }
      return;
    }
    if (window.targetVolume > .01) window.lastNonZeroVolume = window.targetVolume;
    window.playMode = data.shuffleEnabled ? 'shuffle' : data.loopMode === 'one' ? 'single' : data.loopMode === 'all' ? 'loop' : 'order';
    if (typeof window.updatePlayModeButton === 'function') window.updatePlayModeButton(false);
    var queue = data.queue || [], current = data.song;
    var nextQueueSig = JSON.stringify(queue.map(function (song) { return [song.key, song.name, song.artist, song.picurl, song.duration, !!song.liked]; }));
    if (queueSignature !== nextQueueSig) { queueSignature = nextQueueSig; window.playQueue = queue.map(convertSong); }
    window.currentIdx = current ? queue.findIndex(function (song) { return song.key === current.key; }) : -1;
    window.currentLocalSong = convertSong(current);
    if (current) window.likedSongMap[window.songAccountStateKey(window.currentLocalSong)] = !!data.liked;
    window.updateLikeButtons(window.currentLocalSong);
    // Original playTrack owns this fade. The shared player replaces playTrack, so retain the same
    // first-play visual transition when the authoritative song starts playing.
    if (current && data.playing && !window.firstPlayDone) {
      window.firstPlayDone = true;
      window.tweenParticleAlpha(window.uniforms.uAlpha.value || 0, 1.0, 220);
    }
    var nextSongSig = current ? [current.key, current.name, current.artist, current.picurl].join('\u0001') : '';
    if (songSignature !== nextSongSig) {
      songSignature = nextSongSig; window.trackSwitchToken++; media.__mineradioTrackSwitchToken = window.trackSwitchToken;
      window.updateControlTrackInfo(convertSong(current));
      ['thumb-title', 'thumb-artist'].forEach(function (id) { var node = document.getElementById(id); if (node) node.textContent = current ? id === 'thumb-title' ? current.name : current.artist : ''; });
      loadCover(current?.picurl || ''); window.safeShelfRebuild('folia-song');
    }
    var nextLyricSig = JSON.stringify([current?.key, data.lyrics || []]);
    if (lyricSignature !== nextLyricSig) {
      lyricSignature = nextLyricSig; window.lyricsLines = lyrics(data.lyrics || [], data.duration);
      window.lyricsHasNativeKaraoke = window.lyricsLines.some(function (line) { return line.words.length; });
      window.lyricsTimingSource = window.lyricsHasNativeKaraoke ? 'yrc-word' : window.lyricsLines.length ? 'lrc-line' : 'none';
      window.lyricsTranslationLines = [];
      window.originalLyricsState = { lines: window.lyricsLines, hasNativeKaraoke: window.lyricsHasNativeKaraoke,
        timingSource: window.lyricsTimingSource, translationLines: [], translationSource: 'folia-core' };
      window.renderLyrics();
    }
    var collections = data.collections || [], nextCollectionSig = JSON.stringify(collections);
    if (nextCollectionSig !== collectionSignature) {
      collectionSignature = nextCollectionSig;
      window.userPlaylists = collections.map(function (item) { return { id: item.key, name: item.name, cover: bridge.safeCover(item.cover), trackCount: item.count, provider: 'folia', shelfPane: 'mine' }; });
      window.renderUserPlaylistsList?.({ animate: false, preserveScroll: true });
      window.safeShelfRebuild('folia-collections');
    }
    var presentation = data.presentation || {};
    var hideLyrics = presentation.showLyrics === false;
    if (hideLyrics && !hiddenLyrics) {
      desiredParticleLyrics = window.fx.particleLyrics; desiredLyricsVisible = window.lyricsVisible;
    }
    if (hideLyrics) { window.fx.particleLyrics = false; window.lyricsVisible = false; }
    else if (hiddenLyrics) { window.fx.particleLyrics = desiredParticleLyrics; window.lyricsVisible = desiredLyricsVisible; }
    hiddenLyrics = hideLyrics;
    document.body.classList.toggle('folia-hide-lyrics', hideLyrics);
    document.body.classList.toggle('folia-hide-controls', presentation.showControls === false);
    document.body.classList.toggle('folia-hide-background', presentation.showBackground === false);
    document.body.classList.toggle('folia-controls-disabled', !!data.controlsDisabled);
    // A profile masks the shelf; it must not overwrite the native user's saved shelf preference.
    if (presentation.showShelf === false && !hiddenShelf) {
      desiredShelf = { mode: window.shelfManager.getMode(), pinned: !!window.fx.shelfPinnedOpen, presence: window.fx.shelfPresence };
      window.shelfManager.setMode('off');
      window.fx.shelf = desiredShelf.mode; window.fx.shelfPinnedOpen = desiredShelf.pinned; window.fx.shelfPresence = desiredShelf.presence;
    } else if (presentation.showShelf !== false && hiddenShelf) {
      restoreShelf();
    }
    hiddenShelf = presentation.showShelf === false;
    var nextThemeSignature = JSON.stringify(data.theme || {});
    if (data.theme && window.stageLyrics && themeSignature !== nextThemeSignature) {
      themeSignature = nextThemeSignature;
      window.stageLyrics.coverPalette = { primary: data.theme.primary, secondary: data.theme.secondary, highlight: data.theme.accent };
      window.fx.visualTintColor = data.theme.secondary; window.syncFxUniforms();
    }
    var accountButton = document.getElementById('user-capsule');
    if (accountButton) accountButton.title = (data.accounts || []).filter(function (account) { return account.connected; })
      .map(function (account) { return account.name; }).join('、') || '共用帳號設定';
    window.setPlayIcon(window.playing); window.updateVolumeUi(); window.updatePlaybackProgressUi();
    window.safeRenderQueuePanel('folia-snapshot');
    var status = document.getElementById('folia-core-status');
    if (status) status.textContent = (data.playbackSource === 'external' ? '跟隨外部播放器' : '播放器直接播放')
      + ' · Folia 共用核心 · ' + (window.lyricsLines.length ? '共用同步歌詞' : '等待歌詞');
    if (wasPlaying !== window.playing) media.dispatchEvent(new Event(window.playing ? 'playing' : 'pause'));
    media.dispatchEvent(new Event('timeupdate'));
  }
  return { update: update, position: position, lyricPosition: lyricPosition, dispose: function () {
    coverSerial++;
    if (hiddenLyrics) { window.fx.particleLyrics = desiredParticleLyrics; window.lyricsVisible = desiredLyricsVisible; }
    if (hiddenShelf) restoreShelf();
  } };
};
