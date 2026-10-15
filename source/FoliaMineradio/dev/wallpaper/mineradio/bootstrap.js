// Host substitutes for upstream player state. Three r128 is isolated from Folia's renderer.
addEventListener('error', function () { parent.postMessage({ type: 'folia-mineradio-error-v1' }, '*'); });
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2600000 / (innerWidth * innerHeight))));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);
var bass = 0, mid = 0, treble = 0, audioEnergy = 0, beatPulse = 0, camPunch = 0;
var smoothBass = 0, smoothMid = 0, smoothTreb = 0, smoothEnergy = 0;
var stageLyrics = { coverPalette: {} };
var headParallax = { active: false }, gestureRotation = { x: 0, y: 0 };
var shelfManager = null, shelfPinnedOpen = false, shelfVisibility = 0;
var presetTransition = { active: false, start: 0, duration: 0.24, from: 0, to: 0 };
function normalizeHexColor(value, fallback) { return /^#[\da-f]{6}$/i.test(value || '') ? value : fallback || '#9db8cf'; }
