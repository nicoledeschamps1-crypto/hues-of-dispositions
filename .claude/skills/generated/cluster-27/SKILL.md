---
name: cluster-27
description: "Skill for the Cluster_27 area of blob-tracking-project. 8 symbols across 1 files."
---

# Cluster_27

8 symbols | 1 files | Cohesion: 50%

## When to Use

- Understanding how randomizeEffect, switchFxView, _loadFxAudioSync work
- Modifying cluster_27-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-fx.js` | randomizeEffect, switchFxView, _loadFxAudioSync, setupFxUIListeners, wireSlider (+3) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `randomizeEffect` | Function | `blob-fx.js` | 2046 |
| `switchFxView` | Function | `blob-fx.js` | 3023 |
| `_loadFxAudioSync` | Function | `blob-fx.js` | 3179 |
| `setupFxUIListeners` | Function | `blob-fx.js` | 3403 |
| `wireSlider` | Function | `blob-fx.js` | 3405 |
| `wireColorPicker` | Function | `blob-fx.js` | 3418 |
| `wireSelector` | Function | `blob-fx.js` | 3431 |
| `wireShapeSelector` | Function | `blob-fx.js` | 3441 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SetupFxUIListeners → GetEffectsForCategory` | cross_community | 4 |
| `SetupFxUIListeners → ShowFxParams` | cross_community | 4 |
| `SetupFxUIListeners → UpdateFxOnButton` | cross_community | 4 |
| `SetupFxUIListeners → UpdateCardHighlights` | cross_community | 4 |
| `SetupFxUIListeners → UpdatePresetCardHighlights` | cross_community | 4 |
| `SetupFxUIListeners → GetCustomPresets` | cross_community | 4 |
| `SetupFxUIListeners → CaptureCurrentState` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_28 | 3 calls |
| Cluster_5 | 3 calls |
| Cluster_29 | 2 calls |
| Cluster_20 | 1 calls |
| Cluster_31 | 1 calls |
| Cluster_13 | 1 calls |
| Cluster_6 | 1 calls |
| Cluster_14 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "randomizeEffect"})` — see callers and callees
2. `gitnexus_query({query: "cluster_27"})` — find related execution flows
3. Read key files listed above for implementation details
