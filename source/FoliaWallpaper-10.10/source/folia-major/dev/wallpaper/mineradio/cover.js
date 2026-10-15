// Change cover atomically; a late image response must never overwrite the next song's cover.
var coverRequest = 0, coverUrl = null, coverError = '', coverReady = false;
var fallbackColors = '';
function setWallpaperCover(url, theme) {
  var colors = [theme.primary, theme.accent].join('|');
  if (url === coverUrl && (url || colors === fallbackColors)) return;
  fallbackColors = colors;
  coverUrl = url; coverReady = false;
  var token = ++coverRequest;
  if (!url) { applyWallpaperCover(null, theme); return; }
  var image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = function () { if (token !== coverRequest) return; applyWallpaperCover(image, theme); };
  image.onerror = function () { if (token !== coverRequest) return; coverError = 'cover-unavailable'; applyWallpaperCover(null, theme); };
  image.src = url;
}
function applyWallpaperCover(image, theme) {
  var canvas;
  if (image) canvas = makeSquareCoverCanvas(image, 384);
  else {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 384, 384);
    gradient.addColorStop(0, normalizeHexColor(theme.primary)); gradient.addColorStop(1, normalizeHexColor(theme.accent));
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 384, 384);
  }
  var edge;
  try { edge = buildEdgeAndDepth(canvas); coverError = ''; }
  catch (error) { coverError = 'cover-analysis-unavailable'; return; }
  prevCoverTex.image = coverTex.image; prevCoverTex.needsUpdate = true;
  coverTex.image = canvas; coverTex.needsUpdate = true;
  coverEdgeTex.image = edge; coverEdgeTex.needsUpdate = true;
  uniforms.uHasCover.value = image ? 1 : 0;
  uniforms.uHasDepth.value = image ? 1 : 0;
  uniforms.uColorMixT.value = 0;
  coverReady = !!image;
  refreshFloatColorsFromCover(canvas);
}
