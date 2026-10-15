// dev/wallpaper/chrome/background.js — relay YouTube or an explicitly connected HTML media page to loopback.
import { token } from './connection.js';
async function command(type, tabId) {
  return fetch('http://127.0.0.1:3189/browser-media', { method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'X-Folia-Timeline-Token': token },
    body: JSON.stringify({ type, id: String(tabId) }), signal: AbortSignal.timeout(2500) });
}
chrome.action.onClicked.addListener(tab => {
  if (!tab.id || !/^https?:\/\//.test(tab.url || '')) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    .then(() => command('pin-tab', tab.id)).then(response => {
      if (response.ok) return chrome.action.setTitle({ tabId: tab.id, title: '已指定此分頁為 Folia 播放來源' });
    }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => { void command('forget-tab', tabId).catch(() => {}); });
chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
  if (data?.type !== 'folia-timeline' || !sender.tab || sender.frameId !== 0 || !/^https?:\/\//.test(sender.url || '')) return;
  fetch('http://127.0.0.1:3189/browser-media', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Folia-Timeline-Token': token },
    body: JSON.stringify({ ...data, id: String(sender.tab.id), site: new URL(sender.url).hostname }), signal: AbortSignal.timeout(2500) })
    .then(response => sendResponse({ connected: response.ok })).catch(() => sendResponse({ connected: false }));
  return true;
});
