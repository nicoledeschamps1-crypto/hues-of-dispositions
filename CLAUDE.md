# BlobFX — CLAUDE.md

## Project Identity
**BlobFX** ("Hues of Dispositions") is a browser-based real-time video effects app built with p5.js. It tracks colors/blobs in webcam or uploaded video and applies 63 stackable visual effects with audio reactivity, AI masking, face tracking, and a timeline editor. Created by Nicole Deschamps (HUESOFSATURN), based on @pbltrr's original blob tracking code. Goal: ship as a free public browser app in 2026.

**Use case**: Creative video effects for social media, garment/fabric display, artistic video processing. Inspired by Efecto.app and Grainrad.com.

## Architecture
- **Pure client-side JS** — no build step, no bundler, no framework
- **9 modular files** loaded via `<script>` tags in shared global scope:
  `blob-core.js` → `blob-fx.js` → `blob-shader-fx.js` → `blob-overlay.js` → `blob-audio.js` → `blob-timeline.js` → `blob-mask.js` → `blob-tracking.js` → `blob-tracking.html`
- **20,330 lines total** across all files
- **WebGL2 shader pipeline** (`ShaderFXPipeline` class) — 33 GPU effects with per-effect opacity + blend modes
- **p5.js 1.9.0** — call `pixelDensity(1)` after `createCanvas`, then `resizeCanvas()`
- **MediaPipe** — FaceLandmarker + InteractiveSegmenter, lazy-loaded on first use, GPU with CPU fallback
- **400+ implicit globals** — no namespace yet (known tech debt)

## Key Patterns
- `FX_UI_CONFIG` in blob-core.js = single source of truth for all 63 effects
- `activeEffects` (Set) and `hiddenEffects` (Set) manage effect state
- `paramValues` priority: USER > TIMELINE > AUDIO (via `paramBaseline` + `paramOwner`)
- Scratch buffer system: `getScratchBuffer()`/`getScratchFloat()` — reused across pixel effects
- Webcam mirror: push/translate/scale/pop on video image only, never coords
- `mousePressed()` must `return false;` to suppress p5.js native event propagation
- File inputs use `<label for>` pattern (not `.click()`) for iOS Safari compatibility
- Cache busting: use `?v=YYYYMMDD` on script tags in HTML

## Current State (2026-03-27)
**Last committed**: `b86b173` (2026-03-27) — Harness extraction + QA fixes
**All changes committed.** No uncommitted work.

**What's built**: 63 effects (14 Color, 20 Distortion, 11 Pattern, 18 Overlay), 40 presets, 18 tracking modes, 9 blob styles, 3 connection modes, AI Magic Mask v2, face tracking (eyes/lips/face), audio sync v2 with beat detection, timeline editor with segments/undo/zoom, video overlay with blend modes, datamosh (melt/shatter), layer system (Model C), responsive UI with purple design system.

**What's in progress**: Mobile UI (iOS upload still broken), remaining QA bugs (~18 unfixed from 2026-03-26 audit).

## Active Work Threads

### 1. QA Bug Fixes (~18 remaining from 2026-03-26 audit)
8 critical bugs FIXED in `f9420a3`: maskSegInFlight reset, MediaPipe CPU fallback, audioContext.resume(), blob URL leak, activeEffects mutation, shader null guard, timeline event leaks, iOS file type fallback.
Remaining items: split view 'both' mode, innerHTML XSS patterns, debug logging always on, MediaPipe `.close()` cleanup, dead paramOwner code, and ~12 lower-priority items.
See: `~/.claude/projects/-Users-nicoledeschamps/memory/blobfx-session-2026-03-26.md` for full list

### 3. Mobile UI Polish
iOS file upload still broken despite label+extension fix. Drawer toggles and timeline compact done. Remaining: touch-friendly FX cards, portrait canvas sizing, touch timeline scrub, full <500px audit. See: `project-blobfx-mobile.md` in memory.

### 4. Public Launch Prep
Targeting 2026. Needs: .gitignore (cert.pem/key.pem in repo!), favicon, hosting setup (GitHub Pages/Vercel), onboarding UX, performance budget on mid-tier hardware, browser compat testing, license choice.

### 5. Architecture Cleanup
400+ implicit globals need namespacing before adding more features. Dead `paramOwner` priority system (declared but never written by audio/timeline). Debug console.log always on. innerHTML XSS-fragile patterns.

## Key Decisions Made
| Decision | Why |
|----------|-----|
| Pure client-side, no bundler | Simplicity — it's a creative tool, not a SaaS. Deploy anywhere static files are served. |
| Global scope via script tags | Started from @pbltrr's single-file original. Modularized into 9 files but kept shared globals for minimal refactor risk. |
| WebGL2 shader pipeline | CPU pixel effects too slow for real-time at high resolution. GPU path gives 60fps. |
| Layer system Model C (fixed stack, not Photoshop-style) | Avoids complexity of reorderable layers. Users toggle visibility + blend per fixed layer. |
| `<label for>` file inputs (not .click()) | iOS Safari blocks programmatic `.click()` on file inputs. Label pattern is the only reliable cross-platform approach. |
| `return false` in mousePressed | p5.js only suppresses browser default behavior when handler returns false. `return;` caused file dialogs to cascade. |
| paramValues priority (USER > TIMELINE > AUDIO) | Audio and timeline both want to drive params — priority system prevents fighting. User always wins. |
| Lazy MediaPipe loading | Models are 5-10MB. Loading on page init adds seconds to startup. Load on first mode activation instead. |
| FACE_DETECT_INTERVAL = 3 | Face detection is expensive. Run every 3rd frame, EMA smooth between. |
| Purple-tinted design system (hsl 278°) | Brand identity for HUESOFSATURN. All grays carry purple hue. OKLCH gradient top bar. |
| `captureStream(0)` + `requestFrame()` for recording | `captureStream(30)` ran on a fixed timer independent of draw loop, causing duplicated/skipped frames. `captureStream(0)` + per-frame `requestFrame()` ensures 1:1 draw-to-recorded frame correspondence. (session 2026-03-17b) |
| Recording at native video resolution, not display resolution | Recording canvas sized to `videoEl.videoWidth/Height` with two-layer composite (source video + p5 overlay). Display resolution produced blurry output. (session 2026-03-19) |
| Webcam mirror via push/translate/scale/pop on video image only | Effects, blobs, and coordinates must not be mirrored — only the displayed video image. Blob X positions mirrored numerically in tracking. Alternatives: CSS transform (breaks coordinate space), mirroring everything (confuses tracking). (session 2026-03-20) |
| `pixelDensity(1)` after `createCanvas` + `resizeCanvas()` | Retina 2x = 5.5M pixels/frame, killing FPS (3fps with 7 effects). `pixelDensity(1)` before `createCanvas` alone doesn't work in p5.js 1.9.0 — must call `resizeCanvas()` after to force buffer resize. 3.6x perf improvement. (session 2026-03-20) |
| FX crash protection via try/catch in draw() | Both effect call sites wrapped in try/catch so a single broken effect logs to console instead of killing the entire draw loop. (session 2026-03-20) |
| Separate hidden WebGL2 canvas for shader pipeline | Pipeline uses its own offscreen canvas, not p5's canvas. `texImage2D` uploads p5 canvas as texture; `drawImage` copies result back. Both GPU-accelerated. Keeps p5 rendering independent. (session 2026-03-21) |
| CPU effects kept as fallbacks alongside GPU shaders | GPU versions auto-skip CPU path via SHADER_EFFECT_REGISTRY check. CPU functions remain for split view and any context where GPU isn't available. (session 2026-03-21) |
| 8 blend modes via separate FRAG_BLEND shader | Multi-texture blend pass with `u_original` (pre-effect) + `u_texture` (effect output). Avoids adding blend logic to every individual shader. (session 2026-03-21b) |
| Persistent top bar (not bottom bar, not left panel) for transport | Nicole chose top bar over bottom bar or left-panel transport. Research showed OBS/After Effects/Resolume all use top bar for transport controls. (session 2026-03-20d) |
| JS-generated FX panel from FX_UI_CONFIG constant | Replaced ~460 lines of static HTML with data-driven generation from `FX_UI_CONFIG` in blob-core.js (~170 lines) + `buildFxPanel()` in blob-fx.js (~140 lines). Single source of truth for all effect UI. Alternative: static HTML (harder to maintain with 63 effects). (session 2026-03-18c) |
| 3-layer CSS design token system | Primitives → semantic → component tokens. All old variable names preserved as legacy aliases for zero-breakage migration. Carbon Design System and NNGroup research informed the structure. (session 2026-03-20d) |
| Audio controls in left panel AUDIO tab (not right panel) | Moved from right panel to left panel as third tab (TRACK/FX/AUDIO). Audio is a core control, not a secondary setting. All getElementById-based wiring survived the DOM move without JS changes. (session 2026-03-17e) |
| Camera features as FX sub-tab (not standalone section) | Camera controls (Auto-Follow, Ken Burns, Split View, etc.) moved into FX tab bar as 5th tab. Tab bar placed outside `#fx-effects-view` so it persists when view toggles. Alternative: collapsible right-panel section (buried). (session 2026-03-21e) |
| Tracking toggle ON/OFF switch (not always-on) | Added to Tracking header. When OFF: hides tabs, mode buttons, blob params. Preserves last mode for restore. Avoids visual clutter when user only wants FX. (session 2026-03-21d) |
| Bottom transport buttons removed (top bar only) | All transport duplicated in top bar, left panel buttons removed. Null-guarded all JS references. `syncPlayIcon()` single function replaces 8+ scattered innerHTML assignments. (session 2026-03-21d) |
| Settings modal (not inline panel) for appearance controls | Box Color, Box Weight, Opacity, Curvature, Lines moved to gear-icon modal. Same pattern as help overlay (`_settingsVisible` + `toggleSettings()`). Frees left panel space for core controls. (session 2026-03-21d) |
| VISUALIZE as 4th tracking tab (not separate accordion) | Moved all 13 viz buttons into tracking tab bar (COLOR/ANALYSIS/AI/VISUALIZE). Removed separate Visualization accordion. Groups all tracking-related controls together. (session 2026-03-21d) |
| Click-to-track (canvas pixel sampling for CUSTOM mode) | Clicking canvas samples pixel color, switches to CUSTOM tracking mode. Guarded against MASK mode and split divider clicks. Intuitive "point at what you want to track" UX. (session 2026-03-23) |
| FX browsing decoupled from enabling, then re-coupled as click-to-apply | Initially decoupled (session 2026-03-23d audit) because auto-enable on browse was a bug. Later re-coupled as deliberate click-to-apply UX (session 2026-03-25b): select=activate, eye=toggle, trash=remove. (sessions 2026-03-23d, 2026-03-25b) |
| Scratch buffer system (reusable typed arrays) | Replaced ~20 per-frame `new Uint8Array(pixels.length)` allocations with `getScratchBuffer()`/`getScratchFloat()` pool. Eliminates ~100MB/frame GC pressure with 3 stacked distortion effects. (session 2026-03-23d) |
| WebGL context loss/restore handlers | No handler existed — silent death on tab switch or GPU reclaim. Added contextlost/contextrestored listeners with full pipeline reinit. (session 2026-03-23d) |
| Timeline lerp interpolation with 0.3s default fade | `segEnvelope()` + `lerpParam()` smooth transitions between segments. Discrete values (mode, hue) snap at envelope > 0.5. Alternative: hard cuts (jarring). (session 2026-03-23e) |
| `_userMode` / `_userCustomHue` separate from timeline overrides | User's UI-selected mode tracked separately from timeline-driven mode. `applyTimelineEffects()` resets to user mode each frame, then applies overrides. Mode reverts cleanly when segments end. (session 2026-03-17) |
| Beat-synced blob placement restricted to video-mapped audio range | Peak detection was scanning entire song, placing ghost peaks outside video duration. Fixed to detect only within `audioStart..audioEnd` range that maps to visible timeline. (session 2026-03-17) |
| Datamosh via persistent history FBO + frame-difference motion estimation | FRAG_DATAMOSH shader uses persistent history FBO (not reset each frame). Poor-man's optical flow via frame-difference gradient. Two modes: MELT (classic I-frame removal) and SHATTER (extreme spread). Alternative: actual optical flow (too expensive for real-time). (session 2026-03-23f) |
| OKLCH gradient top bar replacing separate accent bar | Deep red -> dark magenta -> fuchsia -> dark purple gradient directly on top bar background. Accent bar hidden. Nicole chose this over keeping title text ("Hues of Dispositions") — Saturn icon only. (session 2026-03-23f) |
| Video overlay as separate file (`blob-overlay.js`) | New 9th module inserted after shader-fx in load order. Drag-and-drop upload, 12 blend modes, opacity, fit modes. Separate file keeps overlay concerns isolated from core effects pipeline. (session 2026-03-24) |
| THERMO/ASCII viz sample from source video, not p5 canvas | THERMO uses offscreen `_thermoSampler` canvas (128-512px) sampling source video directly. ASCII uses two-stage sampling (video -> high-res offscreen -> downsample). Sampling p5 canvas included effects/blobs in the heatmap/characters. (session 2026-03-24) |
| Per-effect audio sync with stable `_baseValue` baseline | `_baseValue` captured from `FX_DEFAULTS` on first frame, not from live parameter value. Reading live value caused feedback loop (own output fed back, saturating to max instantly). Runtime-only field, not persisted. (session 2026-03-24b) |
| Offscreen canvas for MediaPipe `detectForVideo()` | Draw video frame to `window._mpFaceCanvas` then pass to MediaPipe instead of p5.js hidden `<video>` element. Standard workaround for MediaPipe + p5.js compatibility — p5's video element is not a standard HTMLVideoElement in all contexts. (session 2026-03-23c) |
| Capture-phase keydown listener for timeline shortcuts | Window-level capture-phase `addEventListener('keydown', ...)` fires before p5/browser. Handles Delete, Cmd+C/V/D/Z with `preventDefault` + `stopPropagation` to block browser defaults (Cmd+D=bookmark, etc.). Alternative: p5's `keyPressed()` (unreliable for modified keys). (session 2026-03-17c) |
| `hiddenEffects` Set for layer eye toggles | Effects toggled off via Layers eye kept in `activeEffects` but added to `hiddenEffects`. `_fxActive(name)` helper checks both sets. Preserves effect config while hiding from render. Alternative: removing from `activeEffects` (loses config). (session 2026-03-25) |
| Beat flash removed from Layers panel | Epilepsy safety concern. Flash/strobe effects excluded from user-accessible layer controls. Consistent with project-wide "no flash/strobe without toggle + warning" policy. (session 2026-03-25) |
| `videoEl.elt.play()`/`.pause()` instead of p5 wrappers | p5.js `videoEl.loop()` silently fails to resume after pause in some cases. Using native HTMLVideoElement methods with `.catch()` error handling is reliable. (session 2026-03-19) |
| Responsive off-canvas drawers at <=900px | Panels become fixed drawers with translateX transition. 44px min touch targets, drawer toggles in top bar. At <=700px: FPS/source/mode hidden. Research-informed breakpoints. (session 2026-03-21b) |
| CRT reclassified from hybrid to pixel type | CRT writes to pixels[] array, but was classified as 'hybrid' which skips `updatePixels()`. Pixel modifications were silently lost. Moved to pixel type so the pipeline handles it correctly. (session 2026-03-20c) |
| Multi-agent harness (GAN-inspired plan/build/evaluate) | Separate generation from evaluation using `claude -p` invocations with real context resets. Evaluator tuned with 6 BlobFX-specific failure calibrations. Max 3 fix rounds per sprint. Based on Anthropic's harness design article. (session 2026-03-25c) |

## Constraints & Preferences
- **Stack**: p5.js 1.9.0, vanilla JS, MediaPipe, WebGL2 GLSL, CSS custom properties
- **Font**: Commit Mono (Google Fonts)
- **Testing**: Playwright MCP for browser automation; local server via `./serve.sh`
- **Deploy target**: Static file hosting (no server required)
- **Sync rule**: After ANY file change, sync all 9 files to `~/Downloads/` — user opens standalone copy
- **No flash/strobe** effects without toggle + epilepsy warning
- **Click-to-apply UX**: select=activate, eye=toggle visibility, trash=remove
- **FX browsing decoupled**: selecting/cycling effects does NOT auto-enable them
- **Multi-agent harness**: `/harness` slash command runs plan→build→evaluate pipeline with Playwright QA
- **Cache busting**: Always update `?v=` query strings when changing JS files
- **Git**: Single `main` branch, `gh` CLI at `~/bin/gh`, auth as nicoledeschamps1-crypto

## People & Connections
- **Nicole Deschamps** (HUESOFSATURN) — creator, sole developer
- **@pbltrr** — original "Browser Blob Tracking" source code (Patreon: patreon.com/pbltrr)
- **GitHub**: nicoledeschamps1-crypto/blob-tracking-project

## What to Notice (Proactive Surfacing)
- **Uncommitted work**: 4 files modified since last commit (2026-03-24). Multiple sessions of work not yet committed.
- **cert.pem + key.pem in repo**: Security issue — these should be in .gitignore immediately.
- **No .gitignore at all**: screen-recording.mov (924KB), certs, and harness artifacts all tracked.
- **26 QA bugs unfixed**: 12 critical items from the 2026-03-26 audit sitting unaddressed.
- **iOS upload still broken**: Despite two rounds of fixes, real iOS Safari file upload fails.
- **400+ globals**: Technical debt growing — each new feature adds more global state.
- **Debug logging always on**: `console.log` every 60 frames in blob-tracking.js.
- **innerHTML XSS patterns**: FX_UI_CONFIG labels interpolated unsanitized in blob-fx.js.
- **Memory leaks**: Blob URLs not revoked on failed loads, sublane event listeners never cleaned up, MediaPipe instances never `.close()`-d.
