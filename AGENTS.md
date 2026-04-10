# Hues of Dispositions (H.O.D.) — AGENTS.md

## Project Identity
**Hues of Dispositions** is a browser-based real-time video effects app built with p5.js. It tracks colors/blobs in webcam or uploaded video and applies 68 stackable visual effects with audio reactivity, AI masking, face tracking, and a timeline editor. Created by Nicole Deschamps (HUESOFSATURN). Goal: ship as a free public browser app in 2026.

**Use case**: Creative video effects for social media, garment/fabric display, artistic video processing. Comparable tools: effect.app, Grainrad.com, CapCut, VSCO.

**GitHub**: nicoledeschamps1-crypto/hues-of-dispositions
**Live**: nicoledeschamps1-crypto.github.io/hues-of-dispositions/

## Architecture
- **Pure client-side JS** — no build step, no bundler, no framework
- **10 modular files** loaded via `<script>` tags in shared global scope
- **~25,000 lines total** across all files
- **Entry point**: `index.html` (contains all HTML + CSS + inline p5 sketch init)

### File Load Order
```
1.  hod-core.js       — globals, p5 lifecycle, UI state, playback, recording, FX_UI_CONFIG
2.  hod-fx.js         — 30+ pixel effects, FX pipeline, scratch buffer system, UI wiring
3.  hod-shader-fx.js  — WebGL2 GPU shader pipeline, 33 GPU effects, GLSL shaders, blend modes
4.  hod-overlay.js    — video/image overlay, drag-drop, 12 blend modes, opacity, fit modes
5.  hod-audio.js      — WebAudio, beat detection, energy analysis, 7 sync targets, BPM
6.  hod-timeline.js   — timeline segments, waveform, playhead, zoom/pan, keyboard shortcuts
7.  hod-mask.js       — AI Magic Mask v2 (MediaPipe InteractiveSegmenter), multi-click
8.  hod-tracking.js   — blob persistence, DBSCAN clustering, heatmap, ROI, spatial hash
9.  hod-hands.js      — hand tracking (MediaPipe HandLandmarker), gesture triggers, hand sync
10. hod-region-fx.js  — per-blob WebGL2 region effects (12 GPU shaders)
```

### Tech Stack
- **p5.js 1.9.0** — canvas rendering, pixel manipulation
- **WebGL2** — separate hidden canvas for GPU shader effects (33 effects)
- **MediaPipe** — FaceLandmarker + InteractiveSegmenter (lazy-loaded, GPU with CPU fallback)
- **WebAudio API** — AnalyserNode, beat detection, spectrum analysis
- **GSAP** — not used here (that's the portfolio site)
- **CSS** — 3-layer design token system (primitives -> semantic -> component), hsl(278) purple tint

## Code Conventions
- **Indentation**: 4 spaces
- **Variables**: camelCase, underscore prefix for internal state (`_persistentBlobs`)
- **Constants**: SCREAMING_SNAKE_CASE (`FX_UI_CONFIG`, `PARAM_SRC_USER`)
- **Semicolons**: always
- **Comments**: section headers with `// ══════════════` dividers
- **Error handling**: try/catch in draw loop so one broken effect doesn't kill the app
- **No modules/imports**: everything lives in global scope (400+ implicit globals — known tech debt)

## Key Patterns to Understand Before Reviewing
- `FX_UI_CONFIG` in blob-core.js = single source of truth for all 68 effects
- `activeEffects` (Set) and `hiddenEffects` (Set) manage effect state
- `paramValues` priority: USER > TIMELINE > AUDIO (via `paramBaseline` + `paramOwner`)
- Scratch buffer system: `getScratchBuffer()`/`getScratchFloat()` — reused typed arrays to avoid GC
- Webcam mirror: push/translate/scale/pop on video image only, never coords/effects
- `mousePressed()` must `return false;` to suppress p5.js native event propagation
- File inputs use `<label for>` pattern (not `.click()`) for iOS Safari compatibility
- `pixelDensity(1)` must be called after `createCanvas`, then `resizeCanvas()` (p5.js 1.9.0 quirk)
- `captureStream(0)` + `requestFrame()` for 1:1 draw-to-recorded frame recording
- Separate hidden WebGL2 canvas for shader pipeline (not p5's canvas)

## Known Issues — Priority Review Areas

### Critical
1. **400+ implicit globals** — no namespace; all files share global scope. Audit for name collisions and unintended mutations.
2. **innerHTML XSS patterns** — FX_UI_CONFIG labels interpolated unsanitized in blob-fx.js
3. **iOS Safari file upload broken** — despite `<label for>` pattern and extension fallback
4. **cert.pem + key.pem tracked in git** — security risk

### Memory & Resource Leaks
5. **Blob URLs not revoked** on failed video load
6. **MediaPipe instances never `.close()`-d** — FaceLandmarker and InteractiveSegmenter
7. **Timeline sublane event listeners** never cleaned up
8. **Debug console.log every 60 frames** in blob-tracking.js (always on)

### Architecture Concerns
9. **Dead code**: `paramOwner` priority system declared but never written by audio/timeline
10. **Split view 'both' mode** referenced but never implemented
11. **Global state coupling**: changes in one file can silently break another
12. **No test suite** — relies on manual Playwright browser testing

### Performance
13. **FACE_DETECT_INTERVAL = 3** — face detection every 3rd frame with EMA smoothing
14. **Scratch buffers** — verify no leaked allocations in hot path
15. **WebGL context loss** — handlers exist but recovery path needs verification

## What a Good Review Covers
When reviewing this project, focus on:
1. **Bugs**: race conditions, null derefs, off-by-one, state desync between UI and engine
2. **Security**: innerHTML injection, eval-like patterns, data URL handling
3. **Memory leaks**: unreleased resources, growing arrays, unclosed media streams
4. **Performance**: hot-path allocations, unnecessary DOM queries in draw loop, shader compilation
5. **Architecture**: global coupling, circular dependencies between files, dead code
6. **Browser compat**: Safari/iOS quirks, WebGL2 availability, MediaPipe GPU fallback

## Do NOT
- Suggest switching to React/Vue/TypeScript — this is intentionally vanilla JS
- Suggest adding a bundler — static file simplicity is a deliberate choice
- Rewrite the global scope pattern — it's known tech debt, needs careful migration plan
- Add flash/strobe effects without on/off toggle + epilepsy warning

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **blob-tracking-project** (531 symbols, 1734 relationships, 46 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/blob-tracking-project/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/blob-tracking-project/context` | Codebase overview, check index freshness |
| `gitnexus://repo/blob-tracking-project/clusters` | All functional areas |
| `gitnexus://repo/blob-tracking-project/processes` | All execution flows |
| `gitnexus://repo/blob-tracking-project/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Cluster_25 area (32 symbols) | `.claude/skills/generated/cluster-25/SKILL.md` |
| Work in the Cluster_23 area (26 symbols) | `.claude/skills/generated/cluster-23/SKILL.md` |
| Work in the Cluster_2 area (25 symbols) | `.claude/skills/generated/cluster-2/SKILL.md` |
| Work in the Cluster_5 area (25 symbols) | `.claude/skills/generated/cluster-5/SKILL.md` |
| Work in the Cluster_28 area (21 symbols) | `.claude/skills/generated/cluster-28/SKILL.md` |
| Work in the Cluster_12 area (20 symbols) | `.claude/skills/generated/cluster-12/SKILL.md` |
| Work in the Cluster_21 area (20 symbols) | `.claude/skills/generated/cluster-21/SKILL.md` |
| Work in the Cluster_16 area (13 symbols) | `.claude/skills/generated/cluster-16/SKILL.md` |
| Work in the Cluster_3 area (11 symbols) | `.claude/skills/generated/cluster-3/SKILL.md` |
| Work in the Cluster_13 area (10 symbols) | `.claude/skills/generated/cluster-13/SKILL.md` |
| Work in the Cluster_29 area (10 symbols) | `.claude/skills/generated/cluster-29/SKILL.md` |
| Work in the Cluster_17 area (9 symbols) | `.claude/skills/generated/cluster-17/SKILL.md` |
| Work in the Cluster_24 area (9 symbols) | `.claude/skills/generated/cluster-24/SKILL.md` |
| Work in the Cluster_34 area (9 symbols) | `.claude/skills/generated/cluster-34/SKILL.md` |
| Work in the Cluster_0 area (8 symbols) | `.claude/skills/generated/cluster-0/SKILL.md` |
| Work in the Cluster_18 area (8 symbols) | `.claude/skills/generated/cluster-18/SKILL.md` |
| Work in the Cluster_27 area (8 symbols) | `.claude/skills/generated/cluster-27/SKILL.md` |
| Work in the Cluster_6 area (7 symbols) | `.claude/skills/generated/cluster-6/SKILL.md` |
| Work in the Cluster_8 area (6 symbols) | `.claude/skills/generated/cluster-8/SKILL.md` |
| Work in the Cluster_10 area (6 symbols) | `.claude/skills/generated/cluster-10/SKILL.md` |

<!-- gitnexus:end -->
