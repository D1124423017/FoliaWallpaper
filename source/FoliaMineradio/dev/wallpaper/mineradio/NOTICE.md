# Mineradio visual integration

Original: https://github.com/XxHuberrr/Mineradio-paused
Revision: d43de565acabfdc1a9c9820a27e81a98ccbebcef
Author: XxHuberrr. Emily preset: thanks to emily; skull preset: YUI7W.

Mineradio source is GPL-3.0. Folia is AGPL-3.0; the combined wallpaper follows the applicable AGPLv3/GPLv3 provisions. Keep both notices and licenses when redistributing. This adaptation is not an official release of either project.

The original GPU shaders, particle geometry, cover edge/depth heuristic, skull mesh and preset transitions are extracted verbatim at build time. The added bootstrap, host loop and cover loading adapter replace the player and camera input. Lyrics remain Folia's original renderer. Frame rate is capped at 30 and pixel budget at 2.6 million. Camera composition uses the upstream preset baseline, without the full player's cinematic camera controls.

Excluded: Sonic Topography and Sonic Workshop third-party presets, account/music provider logic, AI depth download, system memory trimming and Electron integration. Sonic Topography's separate non-commercial learning license is not suitable for this combined open-source distribution.

Three.js r128: copyright 2010–2021 Three.js authors, MIT license (LICENSE-Three.js.txt). No GSAP is used in this frame.

Rebuildable sources: dev/wallpaper/mineradio (including upstream rendering modules), src/wallpaper/mineradio, dev/wallpaper/package.mjs. Build with npm run build:wallpaper. Public release must include this source along with the rest of the modified Folia source.
