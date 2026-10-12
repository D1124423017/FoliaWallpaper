// wallpaper-host.js — register native listeners before the asynchronous visual bundle loads.
(function () {
  var listeners = new Set();
  var history = [];
  var host = {
    native: typeof window.wallpaperRegisterMediaPropertiesListener === 'function',
    history: history,
    settings: {},
    audio: [],
    paused: false,
    subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; },
    emit: function (type, data) {
      var event = { type: type, data: data, at: Date.now() };
      if (type === 'audio') host.audio = data;
      else {
        history.push(event);
        if (history.length > 64) history.shift();
      }
      listeners.forEach(function (listener) { listener(event); });
    }
  };
  window.__foliaWallpaperHost = host;
  window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
      Object.keys(properties).forEach(function (key) { host.settings[key] = properties[key].value; });
      host.emit('settings', host.settings);
    },
    setPaused: function (paused) { host.paused = paused; host.emit('suspend', paused); }
  };
  [
    ['wallpaperRegisterMediaPropertiesListener', 'metadata'],
    ['wallpaperRegisterMediaThumbnailListener', 'thumbnail'],
    ['wallpaperRegisterMediaPlaybackListener', 'playback'],
    ['wallpaperRegisterMediaTimelineListener', 'timeline'],
    ['wallpaperRegisterAudioListener', 'audio']
  ].forEach(function (pair) {
    if (typeof window[pair[0]] === 'function') window[pair[0]](function (data) { host.emit(pair[1], data); });
  });
})();
