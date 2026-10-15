'use strict';
// Isolate upstream scheduling, native capabilities and network from the shared player core.
(function installFoliaMineradioGuard() {
  // Original visual settings retain their own keys, namespaced per selected experience.
  var profile = new URLSearchParams(location.search).get('profile') === 'custom' ? 'custom' : 'mineradio';
  var storagePrefix = 'folia-mineradio-' + profile + ':';
  var storageGet = Storage.prototype.getItem, storageSet = Storage.prototype.setItem, storageRemove = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (key) { return storageGet.call(this, this === window.localStorage ? storagePrefix + key : key); };
  Storage.prototype.setItem = function (key, value) { return storageSet.call(this, this === window.localStorage ? storagePrefix + key : key, value); };
  Storage.prototype.removeItem = function (key) { return storageRemove.call(this, this === window.localStorage ? storagePrefix + key : key); };
  var storageClear = Storage.prototype.clear, storageKey = Storage.prototype.key;
  Storage.prototype.clear = function () {
    if (this !== window.localStorage) return storageClear.call(this);
    var keys = [];
    for (var index = 0; index < this.length; index++) {
      var key = storageKey.call(this, index); if (key?.startsWith(storagePrefix)) keys.push(key);
    }
    keys.forEach(function (key) { storageRemove.call(window.localStorage, key); });
  };
  var native = {
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    add: EventTarget.prototype.addEventListener, remove: EventTarget.prototype.removeEventListener,
    fetch: window.fetch.bind(window),
    requestIdleCallback: window.requestIdleCallback?.bind(window), cancelIdleCallback: window.cancelIdleCallback?.bind(window),
  };
  var timers = new Map(), frames = new Set(), idles = new Map(), observers = new Set(), listeners = [], workers = new Set();
  var serial = 0, suspended = false, disposed = false, blockedRequests = 0;
  function schedule(record) {
    record.started = performance.now();
    record.nativeId = native.setTimeout(function () {
      record.nativeId = 0;
      if (disposed || suspended) return;
      if (!record.interval) timers.delete(record.id);
      record.callback.apply(window, record.args);
      if (record.interval && timers.has(record.id)) { record.remaining = record.delay; schedule(record); }
    }, record.remaining);
  }
  function timer(callback, delay, args, interval) {
    if (disposed || typeof callback !== 'function') return 0;
    var record = { id: ++serial, callback: callback, delay: Math.max(0, Number(delay) || 0), args: args, interval: interval, nativeId: 0 };
    record.remaining = record.delay; timers.set(record.id, record);
    if (!suspended) schedule(record);
    return record.id;
  }
  window.setTimeout = function (callback, delay) { return timer(callback, delay, [].slice.call(arguments, 2), false); };
  window.setInterval = function (callback, delay) { return timer(callback, delay, [].slice.call(arguments, 2), true); };
  window.clearTimeout = window.clearInterval = function (id) {
    var record = timers.get(id); if (record) { native.clearTimeout(record.nativeId); timers.delete(id); }
  };
  window.requestAnimationFrame = function (callback) {
    if (disposed || suspended) return 0;
    var id = native.requestAnimationFrame(function (time) { frames.delete(id); if (!disposed && !suspended) callback(time); });
    frames.add(id); return id;
  };
  window.cancelAnimationFrame = function (id) { native.cancelAnimationFrame(id); frames.delete(id); };
  function scheduleIdle(record) {
    record.nativeId = native.requestIdleCallback(function (deadline) {
      idles.delete(record.id); if (!disposed && !suspended) record.callback(deadline);
    }, record.options);
  }
  if (native.requestIdleCallback) {
    window.requestIdleCallback = function (callback, options) {
      if (disposed) return 0;
      var record = { id: ++serial, callback: callback, options: options };
      idles.set(record.id, record); if (!suspended) scheduleIdle(record); return record.id;
    };
    window.cancelIdleCallback = function (id) { var record = idles.get(id); if (record) { native.cancelIdleCallback(record.nativeId); idles.delete(id); } };
  }
  ['MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver'].forEach(function (name) {
    var Original = window[name]; if (!Original) return;
    window[name] = function (callback) { var observer = new Original(function () { if (!disposed && !suspended) callback.apply(this, arguments); }); observers.add(observer); return observer; };
    window[name].prototype = Original.prototype;
  });
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    if (!disposed) { listeners.push({ target: this, type: type, handler: handler, options: options }); native.add.call(this, type, handler, options); }
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    native.remove.call(this, type, handler, options);
    listeners = listeners.filter(function (item) { return !(item.target === this && item.type === type && item.handler === handler); }, this);
  };
  window.fetch = function (input, options) {
    var url; try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (error) { return Promise.reject(error); }
    var allowed = url.origin === location.origin && url.pathname.indexOf(new URL('./assets/', location.href).pathname) === 0;
    if (!allowed) { blockedRequests++; return Promise.reject(new Error('Mineradio network belongs to the Folia core')); }
    return native.fetch(input, options);
  };
  window.XMLHttpRequest = function () { blockedRequests++; throw new Error('Independent Mineradio requests are disabled'); };
  window.Audio = function () { throw new Error('Folia owns audio playback'); };
  window.AudioContext = window.webkitAudioContext = function () { throw new Error('Folia owns audio analysis'); };
  window.Worker = function () { throw new Error('Independent audio workers are disabled'); };
  window.WebSocket = function () { throw new Error('Independent Mineradio sockets are disabled'); };
  window.open = function () { return null; };
  var guard = window.__foliaMineradioGuard = {
    native: native,
    suspend: function (value) {
      if (disposed || suspended === !!value) return;
      suspended = !!value;
      if (suspended) {
        frames.forEach(native.cancelAnimationFrame); frames.clear();
        idles.forEach(function (record) { native.cancelIdleCallback(record.nativeId); });
        timers.forEach(function (record) { native.clearTimeout(record.nativeId); record.remaining = Math.max(0, record.remaining - (performance.now() - record.started)); record.nativeId = 0; });
      } else { timers.forEach(schedule); idles.forEach(scheduleIdle); }
    },
    diagnostics: function () { return { timers: timers.size, frames: frames.size, idleCallbacks: idles.size, observers: observers.size, listeners: listeners.length, blockedRequests: blockedRequests, suspended: suspended, disposed: disposed }; },
    dispose: function () {
      if (disposed) return; disposed = true;
      timers.forEach(function (record) { native.clearTimeout(record.nativeId); }); timers.clear();
      frames.forEach(native.cancelAnimationFrame); frames.clear();
      idles.forEach(function (record) { native.cancelIdleCallback(record.nativeId); }); idles.clear();
      observers.forEach(function (observer) { observer.disconnect(); }); observers.clear();
      listeners.forEach(function (item) { native.remove.call(item.target, item.type, item.handler, item.options); }); listeners = [];
      workers.forEach(function (worker) { worker.terminate(); }); workers.clear();
    },
  };
  native.add.call(window, 'pagehide', function () { window.__foliaMineradioBridge?.dispose(); guard.dispose(); }, { once: true });
})();
