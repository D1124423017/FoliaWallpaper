'use strict';
// Translate upstream user intent to the shared Folia queue, providers and account views.
window.installFoliaMineradioActions = function (bridge) {
  var request = function (action, args) {
    return bridge.request(action, args).catch(function (error) { if (!bridge.disposed) window.showToast(error.message); return false; });
  }, empty = function () { return false; };
  var emptyAsync = function () { return Promise.resolve(false); };
  function key(song) { return String(song && (song.__foliaKey || song.key || song.id) || ''); }
  function transport(action) { return function () { return request(action, []); }; }
  function songs(result) { return Array.isArray(result) ? result : (result && (result.items || result.songs || result.tracks) || []); }
  // Account/network recovery and duplicate audio analysis are deliberately not presentation responsibilities.
  ['initAudio', 'resumeAudioAnalysis', 'playShelfSelectTick', 'initializeDesktopCloseBehavior',
    'initializeWallpaperEngineLibrary', 'initCuefieldAutoMix', 'startQQLoginStatusAutoRefresh',
    'startKugouLoginStatusAutoRefresh', 'startQishuiLoginStatusAutoRefresh', 'startSpotifyLoginStatusAutoRefresh',
    'scheduleQueueLyricPrefetch', 'scheduleNeteaseLyricTranslationFallback', 'scheduleStartupLyricFetchRetry',
    'scheduleTrackSwitchFallbackLyrics', 'scheduleBeatAnalysis', 'queueBeatAnalysis', 'queueDjAnalysis',
    'schedulePlaybackAnalyserRecovery', 'schedulePlaybackStallRecovery', 'saveLastPlaybackSnapshot',
    'restoreLastPlaybackSnapshot', 'queueStartupAutoplayAfterHomeReveal', 'maybeRunStartupLoginGuide',
    'initUpdatePreview', 'refreshMineradioCacheSettings', 'syncDesktopOverlayState',
    'ensureDesktopWallpaperFunctionalUi', 'applyVolumeToAudio', 'syncAudioOutputMirrors'].forEach(function (name) { window[name] = empty; });
  window.bindSystemMemoryControls = empty;
  ['refreshLoginStatus', 'refreshQQLoginStatus', 'refreshKugouLoginStatus', 'refreshQishuiLoginStatus',
    'refreshSpotifyLoginStatus', 'restorePersistedLocalLibrary', 'refreshBuiltInPlaylists',
    'loadHomeDiscover', 'loadHomePlatformRecommendations', 'refreshLikeStatus', 'loadWeatherData',
    'loadBeatMap', 'fetchBeatMap', 'loadLyrics'].forEach(function (name) { window[name] = emptyAsync; });
  window.togglePlay = transport('toggle');
  window.nextTrack = transport('next');
  window.prevTrack = transport('previous');
  window.setVolume = function (value) { return request('volume', [Math.max(0, Math.min(1, Number(value) || 0))]); };
  window.toggleMute = function () { return request('volume', [bridge.snapshot.volume > 0 ? 0 : (window.lastNonZeroVolume || 1)]); };
  window.playQueueAt = function (index) { var song = window.playQueue[index]; return song ? request('playSong', [key(song)]) : Promise.resolve(false); };
  window.playSearchResult = function (index) {
    var song = window.playlist[index];
    if (!song) return Promise.resolve(false);
    window.$results.classList.remove('show'); window.$input.value = ''; window.$input.blur();
    return request('playSong', [key(song), 'search']);
  };
  window.queueSong = function (song, options) { return request('queueSong', [key(song), { next: !!(options && options.next) }]); };
  window.queueSongNext = function (song) { return request('queueSong', [key(song), { next: true }]); };
  window.queueDetailSongNext = window.queueSongNext;
  window.removeFromQueue = function (index) { return request('removeQueue', [Number(index)]); };
  window.moveQueueIndex = function (from, to) { return request('moveQueue', [Number(from), Number(to)]); };
  window.moveQueueIndexToTop = function (index) { return request('moveQueue', [Number(index), 0]); };
  window.clearQueue = transport('clearQueue');
  window.shuffleQueue = function () { return request('playMode', ['shuffle']); };
  window.cyclePlayMode = function () {
    var modes = ['order', 'loop', 'single', 'shuffle'];
    return request('playMode', [modes[(modes.indexOf(window.playMode) + 1) % modes.length]]);
  };
  window.toggleLikeSong = async function (song) {
    var result = await request('like', [key(song)]);
    if (!result || typeof result.liked !== 'boolean' || result.key !== key(song) || bridge.disposed) return result;
    var converted = bridge.convertSong(Object.assign({}, song, { key: result.key, liked: result.liked }));
    window.likedSongMap[window.songAccountStateKey(converted)] = result.liked;
    window.safeRenderQueuePanel('folia-like');
    if (window.$results?.classList.contains('show')) window.refreshSearchResultActionStates?.();
    window.updateLikeButtons();
    return result;
  };
  window.toggleLikeCurrent = function () { return window.toggleLikeSong(bridge.snapshot.song); };
  window.collectDetailSong = function (song) { return request('collectSong', [key(song)]); };
  window.showLoginModal = window.showUserModal = transport('openAccounts');
  window.openHomeLocalImport = window.openHomeLibrary = window.openHomeDashboardLibrary = transport('home');
  window.openTrackDetailModal = function () { window.showToast('請透過 Folia 音樂庫查看歌曲與歌手詳情'); return request('home', []); };
  window.openArtistDetailForSong = window.openTrackDetailModal;
  window.toggleControlSourceSwitcher = function (event) { event?.stopPropagation(); return request('openAccounts', []); };
  window.toggleQualityPanel = function (event) { event?.stopPropagation(); return request('openSettings', ['playback']); };
  window.hasAnyPlatformLogin = function () { return (bridge.snapshot.accounts || []).some(function (account) { return account.connected; }); };
  window.activePlaylists = function () { return window.userPlaylists; };
  window.apiJson = async function (rawUrl) {
    var url = new URL(rawUrl, 'https://folia.invalid');
    if (url.pathname.indexOf('/playlist/tracks') >= 0) {
      var id = url.searchParams.get('id') || '';
      var result = songs(await bridge.request('collectionTracks', [id]));
      var tracks = result.map(bridge.convertSong);
      return { tracks: tracks, total: tracks.length, nextOffset: tracks.length, hasMore: false, playlist: { trackCount: tracks.length } };
    }
    throw new Error('此功能由 Folia 共用核心處理：' + url.pathname);
  };
  window.loadPlaylistIntoQueueById = async function (id, autoPlay, title, options) {
    var start = options && options.seedTracks && options.seedTracks[options.startIndex || 0];
    return request('playCollection', [String(id), start ? key(start) : null]);
  };
  window.doSearch = async function (query) {
    var token = ++window.searchRequestSeq;
    window.$results.classList.add('show');
    window.$results.innerHTML = '<div class="search-empty">正在搜尋共用音樂來源…</div>';
    try {
      var response = await bridge.request('search', [String(query || '').trim()]);
      var result = songs(response);
      if (token !== window.searchRequestSeq || bridge.disposed) return;
      window.searchLastResultQuery = String(query || '');
      window.playlist = result.map(bridge.convertSong);
      window.renderSongSearchResults(window.playlist);
      if (response && response.errors?.length) {
        var warning = document.createElement('div'); warning.className = 'search-empty';
        warning.setAttribute('role', 'status');
        warning.textContent = response.errors.map(function (error) { return (error.source === 'online' ? '線上來源' : '本機來源') + '：' + error.message; }).join('；');
        window.$results.prepend(warning);
      }
    } catch (error) {
      if (token === window.searchRequestSeq) window.$results.innerHTML = '<div class="search-empty">搜尋失敗，請稍後重試</div>';
      window.showToast(String(error.message || '搜尋失敗'));
    }
  };
  window.appendNextSearchResults = empty;
  window.handleFiles = function () { return request('home', ['import']); };
  window.toggleStartupAutoplay = window.toggleStartupFastSkip = function () { return request('openSettings', ['playback']); };
  window.coverProxySrc = function (url) { return bridge.safeCover(url); };
  window.songCoverSrc = function (song) { return bridge.safeCover(song && (song.picurl || song.picUrl || song.cover) || ''); };
  window.songSourceLabel = function (song) { return String(song && song.source || '共用播放核心'); };
  window.songSourceTagHtml = function (song) { return '<span class="tag-source">' + window.escHtml(window.songSourceLabel(song)) + '</span>'; };
  window.refreshUserPlaylists = async function () {
    var result = await request('collections', []);
    if (Array.isArray(result) && !bridge.disposed) {
      window.userPlaylists = result.map(function (item) { return { id: item.key, name: item.name, cover: bridge.safeCover(item.cover), trackCount: item.count, provider: 'folia', shelfPane: 'mine' }; });
      window.renderUserPlaylistsList?.({ animate: false, preserveScroll: true });
      window.safeShelfRebuild('folia-collections-refresh');
    }
    return window.userPlaylists;
  };
  window.loadUserPlaylists = window.refreshUserPlaylists;
  window.loadWeather = emptyAsync;
  window.refreshAudioOutputDevices = emptyAsync;
  window.bindAudioOutputControls = empty;
  window.bindQualityControl = empty;
  window.showCacheSettings = function () { return request('openSettings', ['storage']); };
  return { songs: songs };
};
