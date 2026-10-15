const http = require('node:http');
const { readSharedPlayback } = require('../../shared/integrationPlayback.mjs');

// A bounded, read-only loopback feed for the existing Wallpaper Engine companion.
function createWallpaperBridge({ ipcMain, getMainWindow, port = 32120 }) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid wallpaper feed port');
  let snapshot = null, lastError = null, server = null;
  const status = () => ({ app: 'FoliaMineradioPlayer', schema: 1, running: !!server?.listening, port,
    error: lastError, sharing: !!snapshot && Date.now() - snapshot.capturedAt < 4000 });
  const receive = (event, value) => {
    const main = getMainWindow();
    if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) return;
    // Avoid stringifying an attacker-controlled large tree: the schema bounds copying itself.
    const next = readSharedPlayback(value);
    if (next) snapshot = next;
  };
  ipcMain.on('integration-wallpaper-snapshot', receive);
  ipcMain.handle('integration-wallpaper-status', status);
  return {
    status,
    start: () => {
      if (server) return;
      server = http.createServer((req, res) => {
        const origin = req.headers.origin;
        if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`
          || origin && origin !== 'null' && !/^http:\/\/(?:127\.0\.0\.1|localhost):(?:3187|3189)$/.test(origin)) {
          res.writeHead(403).end(); return;
        }
        if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
        res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.method !== 'GET') { res.writeHead(405).end(); return; }
        if (req.url === '/health') { res.end(JSON.stringify(status())); return; }
        if (req.url !== '/snapshot') { res.writeHead(404).end(); return; }
        res.end(JSON.stringify(snapshot && Date.now() - snapshot.capturedAt < 4000 ? snapshot : null));
      });
      server.on('error', error => { lastError = error.code || 'unavailable'; });
      server.listen(port, '127.0.0.1');
    },
    dispose: () => { ipcMain.removeListener('integration-wallpaper-snapshot', receive);
      ipcMain.removeHandler('integration-wallpaper-status'); server?.close(); server = null; snapshot = null; },
  };
}
module.exports = { createWallpaperBridge };
