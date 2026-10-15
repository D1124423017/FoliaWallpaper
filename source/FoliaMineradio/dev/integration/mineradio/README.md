# Mineradio presentation bridge

Build from the Folia repository:

`node dev/integration/mineradio/package.mjs`

Pinned upstream source is included under `dev/integration/mineradio/upstream`.
Original OFL fonts are included under `fonts`; `prepare-fonts.mjs` can reproduce
those files from their pinned official revision. No sibling checkout is required.

The generated `public/integration/mineradio/index.html` is hosted in an iframe. It
preserves the upstream DOM, CSS, original particle/lyrics shaders, camera and shelf.
The parent owns all audio, timeline, provider accounts, search and queue state.
Only messages from `parent` are accepted. No account cookies or media URLs are sent.

Parent snapshot: `{type:'folia-mineradio-core-v1',snapshot:{...}}`. Song and queue
items contain `key,id,name,artist,picurl,source,duration`; all times are seconds.
Lyrics contain `time,text,translation,words?:[{time,endTime,text}]`.
`presentation` controls `showLyrics,showControls,showShelf`; `suspended` pauses all
upstream scheduled work. `{type:'folia-mineradio-core-v1',action:'dispose'}` disposes
the GPU context, listeners and scheduling before the iframe is removed.

`audio.frequency` and `audio.timeDomain` are byte arrays from the Folia analyser;
`audio.sampleRate` is its actual sample rate. The bridge does not open another
AudioContext. `?profile=mineradio` and `?profile=custom` isolate original settings
without resetting the Folia audio decks or its provider accounts.

Frame actions: `{type:'folia-mineradio-action-v1',id,action,args}`. Responses:
`{type:'folia-mineradio-result-v1',id,result,error}`. Search and collection tracks
return song arrays, or `{songs}` / `{tracks}`. Collection responses use `{collections}`
or an array. Queue commands and playCollection must be implemented by the shared core.

Ready: `{type:'folia-mineradio-core-ready-v1'}`. The parent must validate `event.source`
against the mounted iframe's contentWindow. `window.__foliaMineradioBridge.diagnostics()`
reports authoritative runtime ownership, queue, timing, scheduling and GPU resources.

The upstream standalone server, updater, login calls, independent audio and startup
autoplay are disabled. Library/account buttons ask the host to open its shared views.
Sonic presets 7/8 and independent automix are excluded rather than silently emulated.
