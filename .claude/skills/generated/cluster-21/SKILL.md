---
name: cluster-21
description: "Skill for the Cluster_21 area of blob-tracking-project. 20 symbols across 2 files."
---

# Cluster_21

20 symbols | 2 files | Cohesion: 64%

## When to Use

- Understanding how _resetMaskState, enterMaskSelecting, exitMaskMode work
- Modifying cluster_21-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-core.js` | setupCoreUIListeners, wirePersistSlider, sync, openDrawer, closeDrawer (+12) |
| `blob-mask.js` | _resetMaskState, enterMaskSelecting, exitMaskMode |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `_resetMaskState` | Function | `blob-mask.js` | 6 |
| `enterMaskSelecting` | Function | `blob-mask.js` | 22 |
| `exitMaskMode` | Function | `blob-mask.js` | 35 |
| `setupCoreUIListeners` | Function | `blob-core.js` | 2783 |
| `wirePersistSlider` | Function | `blob-core.js` | 2880 |
| `sync` | Function | `blob-core.js` | 2884 |
| `openDrawer` | Function | `blob-core.js` | 2968 |
| `closeDrawer` | Function | `blob-core.js` | 2977 |
| `closeAllDrawers` | Function | `blob-core.js` | 2983 |
| `isBottomSheetMode` | Function | `blob-core.js` | 3013 |
| `setSheetState` | Function | `blob-core.js` | 3017 |
| `populateSheetTabs` | Function | `blob-core.js` | 3029 |
| `initBottomSheet` | Function | `blob-core.js` | 3087 |
| `switchSection` | Function | `blob-core.js` | 3112 |
| `setGuideSection` | Function | `blob-core.js` | 3312 |
| `updateSlimEffectsList` | Function | `blob-core.js` | 3356 |
| `toggleHelp` | Function | `blob-core.js` | 4483 |
| `toggleSettings` | Function | `blob-core.js` | 4488 |
| `windowResized` | Function | `blob-core.js` | 4602 |
| `saveRecording` | Function | `blob-core.js` | 5058 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Setup → UpdatePostProcessList` | cross_community | 7 |
| `Setup → GetEffectsForCategory` | cross_community | 7 |
| `Setup → ShowFxParams` | cross_community | 7 |
| `Setup → UpdateFxOnButton` | cross_community | 6 |
| `SetupCoreUIListeners → UpdateFxOnButton` | cross_community | 6 |
| `Setup → _updateTrackingStatusRow` | cross_community | 5 |
| `Setup → _resetMaskState` | cross_community | 4 |
| `Setup → ToggleSettings` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_12 | 7 calls |
| Cluster_5 | 5 calls |
| Cluster_34 | 4 calls |
| Cluster_6 | 2 calls |
| Cluster_13 | 1 calls |
| Cluster_14 | 1 calls |
| Cluster_33 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "_resetMaskState"})` — see callers and callees
2. `gitnexus_query({query: "cluster_21"})` — find related execution flows
3. Read key files listed above for implementation details
