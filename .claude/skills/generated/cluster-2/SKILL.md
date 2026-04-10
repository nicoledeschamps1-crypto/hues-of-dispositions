---
name: cluster-2
description: "Skill for the Cluster_2 area of blob-tracking-project. 25 symbols across 6 files."
---

# Cluster_2

25 symbols | 6 files | Cohesion: 81%

## When to Use

- Understanding how drawHeatmap, drawTrails, drawLines work
- Modifying cluster_2-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-core.js` | screenToVideoCoords, getEnergyForBand, draw, _applySplitSideFx, applySplitClipShape (+3) |
| `blob-audio.js` | getAudioEnergy, updateSmoothedAudio, updateMultiBandBeats, applyPerEffectAudioSync, renderMiniSpectrum (+2) |
| `blob-tracking.js` | drawHeatmap, drawTrails, drawLines, drawPointInfo, _updateBlobParticles |
| `blob-region-fx.js` | applyRegionFX, _regionRenderPass, _compositeRegion |
| `blob-overlay.js` | drawOverlay |
| `blob-fx.js` | updateSyncSummaryMeters |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `drawHeatmap` | Function | `blob-tracking.js` | 780 |
| `drawTrails` | Function | `blob-tracking.js` | 815 |
| `drawLines` | Function | `blob-tracking.js` | 836 |
| `drawPointInfo` | Function | `blob-tracking.js` | 901 |
| `_updateBlobParticles` | Function | `blob-tracking.js` | 1200 |
| `applyRegionFX` | Function | `blob-region-fx.js` | 427 |
| `_regionRenderPass` | Function | `blob-region-fx.js` | 490 |
| `_compositeRegion` | Function | `blob-region-fx.js` | 515 |
| `drawOverlay` | Function | `blob-overlay.js` | 119 |
| `updateSyncSummaryMeters` | Function | `blob-fx.js` | 3303 |
| `screenToVideoCoords` | Function | `blob-core.js` | 435 |
| `getEnergyForBand` | Function | `blob-core.js` | 1644 |
| `draw` | Function | `blob-core.js` | 1997 |
| `_applySplitSideFx` | Function | `blob-core.js` | 2595 |
| `applySplitClipShape` | Function | `blob-core.js` | 2635 |
| `_getTbEls` | Function | `blob-core.js` | 4326 |
| `updateTopBar` | Function | `blob-core.js` | 4340 |
| `mouseReleased` | Function | `blob-core.js` | 5426 |
| `getAudioEnergy` | Function | `blob-audio.js` | 105 |
| `updateSmoothedAudio` | Function | `blob-audio.js` | 169 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Draw → UpdatePostProcessList` | cross_community | 8 |
| `Draw → GetEffectsForCategory` | cross_community | 8 |
| `Draw → ShowFxParams` | cross_community | 8 |
| `Draw → UpdateFxOnButton` | cross_community | 7 |
| `Draw → _updateTrackingStatusRow` | cross_community | 6 |
| `Draw → GetAudioEnergy` | intra_community | 3 |
| `Draw → UpdateMultiBandBeats` | intra_community | 3 |
| `Draw → GetActiveBandDetector` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_35 | 2 calls |
| Cluster_25 | 1 calls |
| Cluster_4 | 1 calls |
| Cluster_17 | 1 calls |
| Cluster_0 | 1 calls |
| Cluster_1 | 1 calls |
| Cluster_3 | 1 calls |
| Cluster_5 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "drawHeatmap"})` — see callers and callees
2. `gitnexus_query({query: "cluster_2"})` — find related execution flows
3. Read key files listed above for implementation details
