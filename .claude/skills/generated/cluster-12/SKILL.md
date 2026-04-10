---
name: cluster-12
description: "Skill for the Cluster_12 area of blob-tracking-project. 20 symbols across 4 files."
---

# Cluster_12

20 symbols | 4 files | Cohesion: 68%

## When to Use

- Understanding how analyzeAudioForTimeline, finalizeMask, _updateTrackingStatusRow work
- Modifying cluster_12-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-audio.js` | initAudioContext, handleAudioFile, connectGraph, resetBandDetectors, setupAudioUIListeners (+7) |
| `blob-core.js` | _updateTrackingStatusRow, updateButtonStates, updateFxParamVisibility, toggleRecording, startRecording (+1) |
| `blob-timeline.js` | analyzeAudioForTimeline |
| `blob-mask.js` | finalizeMask |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `analyzeAudioForTimeline` | Function | `blob-timeline.js` | 505 |
| `finalizeMask` | Function | `blob-mask.js` | 229 |
| `_updateTrackingStatusRow` | Function | `blob-core.js` | 4088 |
| `updateButtonStates` | Function | `blob-core.js` | 4117 |
| `updateFxParamVisibility` | Function | `blob-core.js` | 4444 |
| `toggleRecording` | Function | `blob-core.js` | 4955 |
| `startRecording` | Function | `blob-core.js` | 4963 |
| `stopRecording` | Function | `blob-core.js` | 5039 |
| `initAudioContext` | Function | `blob-audio.js` | 6 |
| `handleAudioFile` | Function | `blob-audio.js` | 15 |
| `connectGraph` | Function | `blob-audio.js` | 67 |
| `resetBandDetectors` | Function | `blob-audio.js` | 194 |
| `setupAudioUIListeners` | Function | `blob-audio.js` | 617 |
| `updateSyncReadouts` | Function | `blob-audio.js` | 753 |
| `toggleMicrophone` | Function | `blob-audio.js` | 843 |
| `startMicrophone` | Function | `blob-audio.js` | 851 |
| `stopMicrophone` | Function | `blob-audio.js` | 896 |
| `toggleVideoAudio` | Function | `blob-audio.js` | 936 |
| `startVideoAudio` | Function | `blob-audio.js` | 944 |
| `stopVideoAudio` | Function | `blob-audio.js` | 1008 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Draw → UpdatePostProcessList` | cross_community | 8 |
| `Draw → GetEffectsForCategory` | cross_community | 8 |
| `Draw → ShowFxParams` | cross_community | 8 |
| `Draw → UpdateFxOnButton` | cross_community | 7 |
| `Setup → UpdatePostProcessList` | cross_community | 7 |
| `Setup → GetEffectsForCategory` | cross_community | 7 |
| `Setup → ShowFxParams` | cross_community | 7 |
| `Draw → _updateTrackingStatusRow` | cross_community | 6 |
| `KeyPressed → UpdatePostProcessList` | cross_community | 6 |
| `KeyPressed → GetEffectsForCategory` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_28 | 2 calls |
| Cluster_7 | 1 calls |
| Cluster_31 | 1 calls |
| Cluster_10 | 1 calls |
| Cluster_9 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "analyzeAudioForTimeline"})` — see callers and callees
2. `gitnexus_query({query: "cluster_12"})` — find related execution flows
3. Read key files listed above for implementation details
