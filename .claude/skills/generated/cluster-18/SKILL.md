---
name: cluster-18
description: "Skill for the Cluster_18 area of blob-tracking-project. 8 symbols across 3 files."
---

# Cluster_18

8 symbols | 3 files | Cohesion: 61%

## When to Use

- Understanding how _regionCompileShader, _regionLinkProgram, initRegionFX work
- Modifying cluster_18-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-region-fx.js` | _regionCompileShader, _regionLinkProgram, initRegionFX |
| `blob-core.js` | setup, dismissFirstRun, restoreLayerState |
| `blob-mask.js` | clearMask, setupMaskUIListeners |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `_regionCompileShader` | Function | `blob-region-fx.js` | 305 |
| `_regionLinkProgram` | Function | `blob-region-fx.js` | 317 |
| `initRegionFX` | Function | `blob-region-fx.js` | 339 |
| `clearMask` | Function | `blob-mask.js` | 250 |
| `setupMaskUIListeners` | Function | `blob-mask.js` | 258 |
| `setup` | Function | `blob-core.js` | 1847 |
| `dismissFirstRun` | Function | `blob-core.js` | 1874 |
| `restoreLayerState` | Function | `blob-core.js` | 4310 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Setup → UpdatePostProcessList` | cross_community | 7 |
| `Setup → GetEffectsForCategory` | cross_community | 7 |
| `Setup → ShowFxParams` | cross_community | 7 |
| `Setup → UpdateFxOnButton` | cross_community | 6 |
| `Setup → _updateTrackingStatusRow` | cross_community | 5 |
| `Setup → _resetMaskState` | cross_community | 4 |
| `Setup → ToggleSettings` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_12 | 3 calls |
| Cluster_21 | 2 calls |
| Cluster_33 | 1 calls |
| Cluster_27 | 1 calls |
| Cluster_5 | 1 calls |
| Cluster_16 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "_regionCompileShader"})` — see callers and callees
2. `gitnexus_query({query: "cluster_18"})` — find related execution flows
3. Read key files listed above for implementation details
