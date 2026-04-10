---
name: cluster-0
description: "Skill for the Cluster_0 area of blob-tracking-project. 8 symbols across 2 files."
---

# Cluster_0

8 symbols | 2 files | Cohesion: 82%

## When to Use

- Understanding how adaptiveGridSize, shuffleArray, dedupCandidates work
- Modifying cluster_0-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `blob-tracking.js` | adaptiveGridSize, shuffleArray, dedupCandidates, dbscanCluster, regionQuery (+1) |
| `blob-core.js` | CandidatePoint, TrackedPoint |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CandidatePoint` | Class | `blob-core.js` | 1781 |
| `TrackedPoint` | Class | `blob-core.js` | 1785 |
| `adaptiveGridSize` | Function | `blob-tracking.js` | 9 |
| `shuffleArray` | Function | `blob-tracking.js` | 48 |
| `dedupCandidates` | Function | `blob-tracking.js` | 58 |
| `dbscanCluster` | Function | `blob-tracking.js` | 90 |
| `regionQuery` | Function | `blob-tracking.js` | 97 |
| `trackPoints` | Function | `blob-tracking.js` | 355 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_1 | 2 calls |
| Cluster_22 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "adaptiveGridSize"})` — see callers and callees
2. `gitnexus_query({query: "cluster_0"})` — find related execution flows
3. Read key files listed above for implementation details
