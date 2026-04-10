---
name: cluster-29
description: "Skill for the Cluster_29 area of blob-tracking-project. 10 symbols across 1 files."
---

# Cluster_29

10 symbols | 1 files | Cohesion: 83%

## When to Use

- Understanding how captureCurrentState, saveCustomPreset, deleteCustomPreset work
- Modifying cluster_29-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-fx.js` | captureCurrentState, saveCustomPreset, deleteCustomPreset, getCustomPresets, buildPresetPanel (+5) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `captureCurrentState` | Function | `blob-fx.js` | 2838 |
| `saveCustomPreset` | Function | `blob-fx.js` | 2850 |
| `deleteCustomPreset` | Function | `blob-fx.js` | 2868 |
| `getCustomPresets` | Function | `blob-fx.js` | 2878 |
| `buildPresetPanel` | Function | `blob-fx.js` | 2885 |
| `buildPresetGrid` | Function | `blob-fx.js` | 2919 |
| `buildPresetCustomGrid` | Function | `blob-fx.js` | 2932 |
| `createPresetCard` | Function | `blob-fx.js` | 2945 |
| `updatePresetActiveIndicator` | Function | `blob-fx.js` | 2995 |
| `updatePresetCardHighlights` | Function | `blob-fx.js` | 3017 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SetupFxUIListeners → UpdatePresetCardHighlights` | cross_community | 4 |
| `SetupFxUIListeners → GetCustomPresets` | cross_community | 4 |
| `SetupFxUIListeners → CaptureCurrentState` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_28 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "captureCurrentState"})` — see callers and callees
2. `gitnexus_query({query: "cluster_29"})` — find related execution flows
3. Read key files listed above for implementation details
