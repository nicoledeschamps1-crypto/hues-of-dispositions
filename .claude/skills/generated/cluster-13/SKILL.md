---
name: cluster-13
description: "Skill for the Cluster_13 area of blob-tracking-project. 10 symbols across 2 files."
---

# Cluster_13

10 symbols | 2 files | Cohesion: 70%

## When to Use

- Understanding how renderAudioSyncSublanes, _createSublane, _drawSublaneRegions work
- Modifying cluster_13-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-timeline.js` | renderAudioSyncSublanes, _createSublane, _drawSublaneRegions, _setupSublaneRegionDrag, onUp |
| `blob-fx.js` | _saveFxAudioSync, _ensureFxAudioSync, syncFxAudioSyncUI, buildAudioSyncSummaryPanel, wireFxAudioSyncListeners |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `renderAudioSyncSublanes` | Function | `blob-timeline.js` | 670 |
| `_createSublane` | Function | `blob-timeline.js` | 717 |
| `_drawSublaneRegions` | Function | `blob-timeline.js` | 842 |
| `_setupSublaneRegionDrag` | Function | `blob-timeline.js` | 918 |
| `onUp` | Function | `blob-timeline.js` | 950 |
| `_saveFxAudioSync` | Function | `blob-fx.js` | 3166 |
| `_ensureFxAudioSync` | Function | `blob-fx.js` | 3190 |
| `syncFxAudioSyncUI` | Function | `blob-fx.js` | 3197 |
| `buildAudioSyncSummaryPanel` | Function | `blob-fx.js` | 3232 |
| `wireFxAudioSyncListeners` | Function | `blob-fx.js` | 3311 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `OnUp → GetTimelineDuration` | cross_community | 6 |
| `OnUp → _saveFxAudioSync` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_6 | 3 calls |
| Cluster_5 | 3 calls |
| Cluster_28 | 2 calls |
| Cluster_14 | 1 calls |
| Cluster_9 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "renderAudioSyncSublanes"})` — see callers and callees
2. `gitnexus_query({query: "cluster_13"})` — find related execution flows
3. Read key files listed above for implementation details
