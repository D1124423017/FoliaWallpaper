// dev/wallpaper/chrome/content.js — read actual HTMLMediaElement time on YouTube; no playback controls or account access.
let inFlight = false, pending = false, buffering = false;
async function report() {
  if (inFlight) { pending = true; return; }
  const video = document.querySelector('video');
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const music = location.hostname === 'music.youtube.com';
  const titleNode = music ? document.querySelector('ytmusic-player-bar .title') : document.querySelector('ytd-watch-metadata h1 yt-formatted-string, #info h1 yt-formatted-string');
  const artistNode = music ? document.querySelector('ytmusic-player-bar .byline a') : document.querySelector('ytd-watch-metadata #channel-name a');
  const title = titleNode?.textContent?.trim();
  if (!title || video.closest('.ad-showing')) return;
  inFlight = true;
  try { await chrome.runtime.sendMessage({ type: 'folia-timeline', title: title.slice(0, 500), artist: (artistNode?.textContent?.trim() || '').slice(0, 300),
    position: video.currentTime, duration: video.duration, playbackRate: video.playbackRate,
    playing: !video.paused && !video.ended && !video.seeking && !buffering && video.readyState >= 3 }); }
  catch { /* The local service or extension may be restarting. */ }
  finally { inFlight = false; if (pending) { pending = false; void report(); } }
}
for (const name of ['seeked', 'play', 'playing', 'canplay', 'pause', 'waiting', 'seeking', 'ended', 'ratechange', 'durationchange', 'emptied']) {
  document.addEventListener(name, event => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    if (['waiting', 'seeking', 'emptied'].includes(name)) buffering = true;
    if (['playing', 'canplay', 'seeked', 'play'].includes(name)) buffering = false;
    void report();
  }, true);
}
setInterval(report, 1000);
void report();
