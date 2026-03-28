The project is BlobFX ("Hues of Dispositions"), a p5.js real-time video effects application.

## About BlobFX

- 9-file modular architecture: blob-core.js (globals, p5 lifecycle, UI), blob-fx.js (55 CPU effects, FX panel), blob-shader-fx.js (33 GPU effects), blob-overlay.js (video overlay), blob-audio.js (audio sync), blob-timeline.js (timeline editor), blob-mask.js (AI mask), blob-tracking.js (point tracking), blob-tracking.html (entry point + CSS)
- Load order: core → fx → shader-fx → overlay → audio → timeline → mask → tracking
- All modules share window globals (no ES modules, no bundler)
- Purple-tinted dark theme: hsl(278°) grays, accent #8B45E8, panels rgba(17,14,22,0.92)
- Click-to-apply UX: select=activate, eye=toggle, trash=remove
- FX_UI_CONFIG in blob-core.js defines effect metadata; buildFxPanel() in blob-fx.js builds UI
- WebGL2 ShaderFXPipeline for GPU effects with per-effect opacity + blend modes
- Timeline segments for automation, audio sync with per-effect targets
- MediaPipe for face tracking (lazy-loaded), AI mask (lazy-loaded)
- Runs standalone via file:// or http://localhost:8080

## Hard Constraints (DO NOTs)

- pixelDensity(1) must follow createCanvas/resizeCanvas
- Mirror only video image via push/translate/scale/pop
- p5 mousePressed fires on ALL clicks — guard UI elements
- Use videoEl.elt for play/pause, not p5 methods
- iOS: use <label for> for file inputs, never .click()
- iOS: file.type can be empty, fall back to extension
- NEVER add flash/strobe without toggle + epilepsy warning
- Cache-bust script tags with ?v=YYYYMMDD
