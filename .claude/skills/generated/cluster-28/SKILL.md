---
name: cluster-28
description: "Skill for the Cluster_28 area of blob-tracking-project. 21 symbols across 2 files."
---

# Cluster_28

21 symbols | 2 files | Cohesion: 90%

## When to Use

- Understanding how resetEffect, syncFxControlsForEffect, buildFxPanel work
- Modifying cluster_28-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-fx.js` | resetEffect, syncFxControlsForEffect, buildFxPanel, switchFxCategory, selectFxEffect (+14) |
| `blob-core.js` | getEffectsForCategory, updateEffectCardStates |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `resetEffect` | Function | `blob-fx.js` | 2090 |
| `syncFxControlsForEffect` | Function | `blob-fx.js` | 2100 |
| `buildFxPanel` | Function | `blob-fx.js` | 2217 |
| `switchFxCategory` | Function | `blob-fx.js` | 2584 |
| `selectFxEffect` | Function | `blob-fx.js` | 2643 |
| `cycleFxEffect` | Function | `blob-fx.js` | 2662 |
| `toggleCurrentFxEffect` | Function | `blob-fx.js` | 2681 |
| `showFxParams` | Function | `blob-fx.js` | 2695 |
| `removeCurrentFxEffect` | Function | `blob-fx.js` | 2702 |
| `updateFxOnButton` | Function | `blob-fx.js` | 2713 |
| `updateCardHighlights` | Function | `blob-fx.js` | 2722 |
| `toggleFxFavorite` | Function | `blob-fx.js` | 2736 |
| `buildFxFavoritesRow` | Function | `blob-fx.js` | 2752 |
| `applyPreset` | Function | `blob-fx.js` | 2781 |
| `clearPreset` | Function | `blob-fx.js` | 2824 |
| `updatePostProcessList` | Function | `blob-fx.js` | 3040 |
| `updateDropdownMarkers` | Function | `blob-fx.js` | 3047 |
| `buildFxAudioSyncSection` | Function | `blob-fx.js` | 3064 |
| `_rebuildActiveEffectsList` | Function | `blob-fx.js` | 4853 |
| `getEffectsForCategory` | Function | `blob-core.js` | 1620 |

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
| `KeyPressed → UpdatePostProcessList` | cross_community | 6 |
| `KeyPressed → GetEffectsForCategory` | cross_community | 6 |
| `KeyPressed → ShowFxParams` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_29 | 5 calls |

## How to Explore

1. `gitnexus_context({name: "resetEffect"})` — see callers and callees
2. `gitnexus_query({query: "cluster_28"})` — find related execution flows
3. Read key files listed above for implementation details
