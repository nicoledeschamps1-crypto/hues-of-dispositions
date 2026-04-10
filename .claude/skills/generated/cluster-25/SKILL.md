---
name: cluster-25
description: "Skill for the Cluster_25 area of blob-tracking-project. 32 symbols across 1 files."
---

# Cluster_25

32 symbols | 1 files | Cohesion: 65%

## When to Use

- Understanding how _fxActive, applyActiveEffects, applyHalftone work
- Modifying cluster_25-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-fx.js` | _fxActive, applyActiveEffects, applyHalftone, hexToRGB, applyPixelSort (+27) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `_fxActive` | Function | `blob-fx.js` | 83 |
| `applyActiveEffects` | Function | `blob-fx.js` | 88 |
| `applyHalftone` | Function | `blob-fx.js` | 323 |
| `hexToRGB` | Function | `blob-fx.js` | 333 |
| `applyPixelSort` | Function | `blob-fx.js` | 403 |
| `applyASCII` | Function | `blob-fx.js` | 464 |
| `applyScanlines` | Function | `blob-fx.js` | 661 |
| `_grainHash` | Function | `blob-fx.js` | 705 |
| `applyGrain` | Function | `blob-fx.js` | 710 |
| `applyTint` | Function | `blob-fx.js` | 878 |
| `applySepia` | Function | `blob-fx.js` | 909 |
| `applyPixelate` | Function | `blob-fx.js` | 934 |
| `applyNoise` | Function | `blob-fx.js` | 1399 |
| `applyBriCon` | Function | `blob-fx.js` | 1551 |
| `applyGrid` | Function | `blob-fx.js` | 1582 |
| `applyDots` | Function | `blob-fx.js` | 1604 |
| `applyPalette` | Function | `blob-fx.js` | 1690 |
| `applyThermal` | Function | `blob-fx.js` | 1724 |
| `applyLED` | Function | `blob-fx.js` | 1887 |
| `applyThreshold` | Function | `blob-fx.js` | 3584 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_23 | 23 calls |
| Cluster_26 | 4 calls |
| Cluster_24 | 3 calls |
| Cluster_30 | 3 calls |

## How to Explore

1. `gitnexus_context({name: "_fxActive"})` — see callers and callees
2. `gitnexus_query({query: "cluster_25"})` — find related execution flows
3. Read key files listed above for implementation details
