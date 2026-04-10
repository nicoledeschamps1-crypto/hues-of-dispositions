---
name: cluster-10
description: "Skill for the Cluster_10 area of blob-tracking-project. 6 symbols across 2 files."
---

# Cluster_10

6 symbols | 2 files | Cohesion: 63%

## When to Use

- Understanding how showTimeline, syncPlayIcon, toggleWebcam work
- Modifying cluster_10-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-core.js` | syncPlayIcon, toggleWebcam, stopWebcam, handleFile, _dbg |
| `blob-timeline.js` | showTimeline |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `showTimeline` | Function | `blob-timeline.js` | 422 |
| `syncPlayIcon` | Function | `blob-core.js` | 4503 |
| `toggleWebcam` | Function | `blob-core.js` | 4629 |
| `stopWebcam` | Function | `blob-core.js` | 4757 |
| `handleFile` | Function | `blob-core.js` | 4777 |
| `_dbg` | Function | `blob-core.js` | 4778 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleFile → UpdatePostProcessList` | cross_community | 6 |
| `HandleFile → GetEffectsForCategory` | cross_community | 6 |
| `HandleFile → ShowFxParams` | cross_community | 6 |
| `HandleFile → UpdateFxOnButton` | cross_community | 6 |
| `HandleFile → _updateTrackingStatusRow` | cross_community | 4 |
| `KeyPressed → SyncPlayIcon` | cross_community | 3 |
| `HandleFile → SyncPlayIcon` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_12 | 2 calls |
| Cluster_9 | 1 calls |
| Cluster_5 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "showTimeline"})` — see callers and callees
2. `gitnexus_query({query: "cluster_10"})` — find related execution flows
3. Read key files listed above for implementation details
