---
name: cluster-5
description: "Skill for the Cluster_5 area of blob-tracking-project. 25 symbols across 2 files."
---

# Cluster_5

25 symbols | 2 files | Cohesion: 70%

## When to Use

- Understanding how tlSaveState, tlUndo, tlRedo work
- Modifying cluster_5-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-timeline.js` | tlSaveState, tlUndo, tlRedo, percentToTime, clampScroll (+18) |
| `blob-core.js` | updateEmptyHint, keyPressed |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `tlSaveState` | Function | `blob-timeline.js` | 141 |
| `tlUndo` | Function | `blob-timeline.js` | 147 |
| `tlRedo` | Function | `blob-timeline.js` | 160 |
| `percentToTime` | Function | `blob-timeline.js` | 190 |
| `clampScroll` | Function | `blob-timeline.js` | 195 |
| `addModeSegmentAt` | Function | `blob-timeline.js` | 214 |
| `addBlobSegmentAt` | Function | `blob-timeline.js` | 243 |
| `addTimelineSegmentAt` | Function | `blob-timeline.js` | 279 |
| `seekToTimelinePosition` | Function | `blob-timeline.js` | 307 |
| `getTimelineDuration` | Function | `blob-timeline.js` | 385 |
| `assignLanes` | Function | `blob-timeline.js` | 1076 |
| `syncSelectedSegment` | Function | `blob-timeline.js` | 1108 |
| `renderTimelineSegments` | Function | `blob-timeline.js` | 1148 |
| `setupSegmentDrag` | Function | `blob-timeline.js` | 1266 |
| `startDrag` | Function | `blob-timeline.js` | 1308 |
| `detectBandPeaks` | Function | `blob-timeline.js` | 1494 |
| `generateSyncedBlobs` | Function | `blob-timeline.js` | 1546 |
| `countSyncPeaks` | Function | `blob-timeline.js` | 1641 |
| `setupTimelineUIListeners` | Function | `blob-timeline.js` | 1661 |
| `updateSyncPreview` | Function | `blob-timeline.js` | 1708 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `KeyPressed → UpdatePostProcessList` | cross_community | 6 |
| `KeyPressed → GetEffectsForCategory` | cross_community | 6 |
| `KeyPressed → ShowFxParams` | cross_community | 6 |
| `KeyPressed → UpdateFxOnButton` | cross_community | 6 |
| `OnUp → GetTimelineDuration` | cross_community | 6 |
| `KeyPressed → SyncPlayIcon` | cross_community | 3 |
| `KeyPressed → SyncOverlayPlayback` | cross_community | 3 |
| `KeyPressed → GetAudioTimeForVideo` | cross_community | 3 |
| `KeyPressed → _updateTrackingStatusRow` | cross_community | 3 |
| `OnMove → GetTimelineDuration` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_6 | 6 calls |
| Cluster_21 | 6 calls |
| Cluster_9 | 5 calls |
| Cluster_8 | 3 calls |
| Cluster_7 | 3 calls |
| Cluster_12 | 2 calls |
| Cluster_4 | 1 calls |
| Cluster_14 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "tlSaveState"})` — see callers and callees
2. `gitnexus_query({query: "cluster_5"})` — find related execution flows
3. Read key files listed above for implementation details
