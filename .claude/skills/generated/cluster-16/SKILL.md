---
name: cluster-16
description: "Skill for the Cluster_16 area of blob-tracking-project. 13 symbols across 1 files."
---

# Cluster_16

13 symbols | 1 files | Cohesion: 92%

## When to Use

- Understanding how init, _initQuad, _createTexture work
- Modifying cluster_16-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-shader-fx.js` | init, _initQuad, _createTexture, _initFramebuffers, _initHistoryFBO (+8) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `_hexToGL` | Function | `blob-shader-fx.js` | 2186 |
| `registerCoreShaderEffects` | Function | `blob-shader-fx.js` | 2191 |
| `initShaderFX` | Function | `blob-shader-fx.js` | 2448 |
| `init` | Method | `blob-shader-fx.js` | 1570 |
| `_initQuad` | Method | `blob-shader-fx.js` | 1620 |
| `_createTexture` | Method | `blob-shader-fx.js` | 1637 |
| `_initFramebuffers` | Method | `blob-shader-fx.js` | 1648 |
| `_initHistoryFBO` | Method | `blob-shader-fx.js` | 1667 |
| `_compileShader` | Method | `blob-shader-fx.js` | 1686 |
| `_linkProgram` | Method | `blob-shader-fx.js` | 1699 |
| `registerEffect` | Method | `blob-shader-fx.js` | 1720 |
| `setUniform` | Method | `blob-shader-fx.js` | 1739 |
| `setEffectChain` | Method | `blob-shader-fx.js` | 1758 |

## How to Explore

1. `gitnexus_context({name: "init"})` — see callers and callees
2. `gitnexus_query({query: "cluster_16"})` — find related execution flows
3. Read key files listed above for implementation details
