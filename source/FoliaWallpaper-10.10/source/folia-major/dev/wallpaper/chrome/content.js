// dev/wallpaper/chrome/content.js — read one media element; outside YouTube injection requires an explicit extension click.
(() => {
if (window.__foliaTimelineConnected?.version === '1.2.1') { void window.__foliaTimelineConnected.report(); return; }
window.__foliaTimelineConnected?.stop?.();
let inFlight = false, pending = false, buffering = false;
async function report() {
  if (inFlight) { pending = true; return; }
  const youtube = /^(?:www|music)\.youtube\.com$/.test(location.hostname);
  const video = youtube ? document.querySelector('video') : [...document.querySelectorAll('video,audio')]
    .filter(element => Number.isFinite(element.duration) && element.duration > 0)
    .sort((a, b) => Number(!b.paused && !b.ended) - Number(!a.paused && !a.ended))[0];
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const music = location.hostname === 'music.youtube.com';
  const titleNode = music ? document.querySelector('ytmusic-player-bar .title') : document.querySelector('ytd-watch-metadata h1 yt-formatted-string, #info h1 yt-formatted-string');
  const artistNode = music ? document.querySelector('ytmusic-player-bar .byline a') : document.querySelector('ytd-watch-metadata #channel-name a');
  const metadata = navigator.mediaSession?.metadata;
  const title = youtube ? titleNode?.textContent?.trim() : metadata?.title?.trim() || document.title?.trim();
  const artist = youtube ? artistNode?.textContent?.trim() : metadata?.artist?.trim();
  if (!title || youtube && video.closest('.ad-showing')) return;
  inFlight = true;
  try { await chrome.runtime.sendMessage({ type: 'folia-timeline', title: title.slice(0, 500), artist: (artist || '').slice(0, 300),
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
const timer = setInterval(report, 1000);
window.__foliaTimelineConnected = { version: '1.2.1', report, stop: () => clearInterval(timer) };
void report();
})();
