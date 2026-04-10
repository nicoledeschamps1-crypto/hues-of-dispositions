---
name: cluster-17
description: "Skill for the Cluster_17 area of blob-tracking-project. 9 symbols across 1 files."
---

# Cluster_17

9 symbols | 1 files | Cohesion: 84%

## When to Use

- Understanding how _renderPass, _renderDatamosh, _getPersistFBO work
- Modifying cluster_17-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-shader-fx.js` | _renderPass, _renderDatamosh, _getPersistFBO, _renderPersistentFX, process (+4) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `syncShaderFromCPU` | Function | `blob-shader-fx.js` | 2424 |
| `processShaderFX` | Function | `blob-shader-fx.js` | 2462 |
| `_renderPass` | Method | `blob-shader-fx.js` | 1770 |
| `_renderDatamosh` | Method | `blob-shader-fx.js` | 1790 |
| `_getPersistFBO` | Method | `blob-shader-fx.js` | 1875 |
| `_renderPersistentFX` | Method | `blob-shader-fx.js` | 1891 |
| `process` | Method | `blob-shader-fx.js` | 1982 |
| `resize` | Method | `blob-shader-fx.js` | 2088 |
| `enableEffect` | Method | `blob-shader-fx.js` | 2129 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_16 | 2 calls |

## How to Explore

1. `gitnexus_context({name: "_renderPass"})` — see callers and callees
2. `gitnexus_query({query: "cluster_17"})` — find related execution flows
3. Read key files listed above for implementation details
