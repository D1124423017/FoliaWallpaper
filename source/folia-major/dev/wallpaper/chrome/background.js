// dev/wallpaper/chrome/background.js — only relay messages from allowed YouTube tabs to the local timeline service.
import { token } from './connection.js';
chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
  if (data?.type !== 'folia-timeline' || !sender.tab || !/^https:\/\/(?:www|music)\.youtube\.com\//.test(sender.url || '')) return;
  fetch('http://127.0.0.1:3189/browser-media', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Folia-Timeline-Token': token },
    body: JSON.stringify({ ...data, id: String(sender.tab.id) }), signal: AbortSignal.timeout(2500) })
    .then(response => sendResponse({ connected: response.ok })).catch(() => sendResponse({ connected: false }));
  return true;
});
